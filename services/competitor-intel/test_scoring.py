"""
Tests for brand scoring model (scoring.py) and storage.py score functions.

Covers:
  - compute_momentum_score: 0-100 range, normalization, weight redistribution
  - compute_threat_index: price overlap scoring, OMI baseline usage
  - detect_gtm_signals: each flag type, empty list when no signals
  - score_all_brands: processes all brands and saves to SQLite
  - Storage round-trips: save_scores, get_latest_scores, get_score_history
  - Integration with seed_historical_data
  - Edge case: brand with single snapshot
"""

import os
import sqlite3
import tempfile
from datetime import datetime, timedelta

import pytest

from .scoring import (
    OMI_BASELINE,
    _normalize_min_max,
    compute_momentum_score,
    compute_threat_index,
    detect_gtm_signals,
    score_all_brands,
)
from .storage import (
    get_latest_scores,
    get_score_history,
    init_db,
    save_scores,
)


@pytest.fixture
def tmp_db():
    """Create a temporary database for testing."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    conn = init_db(path)
    yield path, conn
    conn.close()
    os.unlink(path)


def _insert_brand(conn, name):
    """Insert a test brand if it doesn't exist."""
    conn.execute(
        """INSERT OR IGNORE INTO brands
           (name, name_en, "group", group_name, badge)
           VALUES (?, ?, 'test', 'Test', '')""",
        (name, name),
    )
    conn.commit()


def _insert_metric(conn, brand, date, metric, value, platform="xhs"):
    """Insert a metric data point."""
    conn.execute(
        """INSERT INTO metrics (brand_name, date, metric_name, metric_value, platform)
           VALUES (?, ?, ?, ?, ?)""",
        (brand, date, metric, str(value), platform),
    )
    conn.commit()


def _insert_delta(conn, brand, date, metric, prev, curr, abs_change, pct_change):
    """Insert a delta record."""
    conn.execute(
        """INSERT INTO deltas (brand_name, date, metric_name,
           previous_value, current_value, absolute_change, pct_change)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (brand, date, metric, str(prev), str(curr), abs_change, pct_change),
    )
    conn.commit()


def _seed_brand_with_deltas(conn, brand_name, deltas_dict, date="2026-03-28"):
    """Insert a brand with pre-computed deltas for testing."""
    _insert_brand(conn, brand_name)
    for metric, vals in deltas_dict.items():
        _insert_delta(
            conn, brand_name, date, metric,
            vals.get("prev", 0), vals.get("curr", 0),
            vals.get("abs", 0), vals.get("pct", 0),
        )


# ─── Normalization ───────────────────────────────────────────────────────────


class TestNormalization:
    """Tests for the min-max normalization helper."""

    def test_min_max_basic(self):
        result = _normalize_min_max({"A": 0, "B": 50, "C": 100})
        assert result["A"] == 0.0
        assert result["C"] == 100.0
        assert 45 <= result["B"] <= 55

    def test_all_same_gets_50(self):
        result = _normalize_min_max({"A": 10, "B": 10, "C": 10})
        assert all(v == 50.0 for v in result.values())

    def test_empty_dict(self):
        assert _normalize_min_max({}) == {}

    def test_negative_values_floored(self):
        result = _normalize_min_max({"A": -50, "B": 0, "C": 100})
        assert result["A"] == 0.0  # Floored from -50 to 0
        assert result["C"] == 100.0


# ─── Momentum Score ──────────────────────────────────────────────────────────


class TestMomentumScore:
    """Tests for compute_momentum_score function."""

    def test_produces_0_100_range(self, tmp_db):
        """Momentum score must be between 0 and 100."""
        path, conn = tmp_db
        _seed_brand_with_deltas(conn, "TestBrand", {
            "xhs_followers": {"prev": 1000, "curr": 1100, "abs": 100, "pct": 10.0},
        })

        all_raws = {
            "TestBrand": {"xhs_follower_growth": 10.0},
        }
        result = compute_momentum_score("TestBrand", all_brand_raws=all_raws, db_path=path)

        assert 0 <= result["momentum_score"] <= 100

    def test_highest_grower_gets_near_100(self, tmp_db):
        """Brand with highest growth should score near 100 for that signal."""
        path, conn = tmp_db
        _insert_brand(conn, "Hot")
        _insert_brand(conn, "Cold")

        all_raws = {
            "Hot": {
                "xhs_follower_growth": 50.0,
                "douyin_follower_growth": 40.0,
                "content_velocity": 30,
                "engagement_trend": 45.0,
                "new_products": 10,
                "livestream_activity": 25.0,
            },
            "Cold": {
                "xhs_follower_growth": 0.0,
                "douyin_follower_growth": 0.0,
                "content_velocity": 0,
                "engagement_trend": 0.0,
                "new_products": 0,
                "livestream_activity": 0.0,
            },
        }

        hot_result = compute_momentum_score("Hot", all_brand_raws=all_raws, db_path=path)
        cold_result = compute_momentum_score("Cold", all_brand_raws=all_raws, db_path=path)

        assert hot_result["momentum_score"] > 90
        assert cold_result["momentum_score"] < 10

    def test_no_growth_gets_near_0(self, tmp_db):
        """Brand with no growth should score near 0."""
        path, conn = tmp_db
        _insert_brand(conn, "Flat")
        _insert_brand(conn, "Other")

        all_raws = {
            "Flat": {
                "xhs_follower_growth": 0.0,
                "douyin_follower_growth": 0.0,
                "content_velocity": 0,
                "engagement_trend": 0.0,
                "new_products": 0,
                "livestream_activity": 0.0,
            },
            "Other": {
                "xhs_follower_growth": 20.0,
                "douyin_follower_growth": 15.0,
                "content_velocity": 10,
                "engagement_trend": 18.0,
                "new_products": 5,
                "livestream_activity": 12.0,
            },
        }

        flat_result = compute_momentum_score("Flat", all_brand_raws=all_raws, db_path=path)
        assert flat_result["momentum_score"] < 10

    def test_weight_redistribution_missing_data(self, tmp_db):
        """Missing data signals contribute 0 but weight is redistributed."""
        path, conn = tmp_db
        _insert_brand(conn, "Partial")
        _insert_brand(conn, "Full")

        # Partial has only xhs_follower_growth data
        all_raws = {
            "Partial": {
                "xhs_follower_growth": 50.0,
                # All other signals are None (missing)
            },
            "Full": {
                "xhs_follower_growth": 50.0,
            },
        }

        result = compute_momentum_score("Partial", all_brand_raws=all_raws, db_path=path)

        assert result["data_completeness"] < 1.0
        # With only one signal, the score should still be meaningful
        # because weight is redistributed
        assert result["momentum_score"] > 0
        # Score breakdown should show missing data
        breakdown = result["score_breakdown"]
        missing_count = sum(1 for v in breakdown.values() if v["raw"] is None)
        assert missing_count > 0

    def test_score_breakdown_structure(self, tmp_db):
        """Score breakdown has correct structure."""
        path, conn = tmp_db
        _insert_brand(conn, "StructBrand")

        all_raws = {"StructBrand": {"xhs_follower_growth": 10.0}}
        result = compute_momentum_score("StructBrand", all_brand_raws=all_raws, db_path=path)

        assert "score_breakdown" in result
        assert "data_completeness" in result
        for signal_name, info in result["score_breakdown"].items():
            assert "raw" in info
            assert "normalized" in info
            assert "weight" in info


# ─── Threat Index ────────────────────────────────────────────────────────────


class TestThreatIndex:
    """Tests for compute_threat_index function."""

    def test_produces_0_100_range(self, tmp_db):
        """Threat index must be between 0 and 100."""
        path, conn = tmp_db
        _insert_brand(conn, "ThreatBrand")

        result = compute_threat_index("ThreatBrand", db_path=path)

        assert 0 <= result["threat_index"] <= 100

    def test_higher_threat_for_price_overlap(self, tmp_db):
        """Brand with products in OMI's price range should score higher on price_overlap."""
        path, conn = tmp_db
        _insert_brand(conn, "Overlap")
        _insert_brand(conn, "NoOverlap")

        # Insert ranking data with brand in OMI's price range
        from .storage import save_product_rankings
        save_product_rankings(conn, "sycm", "2026-03-28", "箱包", "交易指数", [
            {"rank": 1, "product_name": "Bag A", "brand": "Overlap", "price": "399"},
            {"rank": 2, "product_name": "Bag B", "brand": "Overlap", "price": "299"},
            {"rank": 3, "product_name": "Bag C", "brand": "Overlap", "price": "499"},
        ])

        result_overlap = compute_threat_index("Overlap", db_path=path)
        result_no = compute_threat_index("NoOverlap", db_path=path)

        assert result_overlap["threat_breakdown"]["price_overlap"]["score"] > result_no["threat_breakdown"]["price_overlap"]["score"]

    def test_uses_omi_baseline(self, tmp_db):
        """When OMI not in brands table, uses OMI_BASELINE."""
        path, conn = tmp_db
        _insert_brand(conn, "CompBrand")

        # OMI is not in brands table
        omi_row = conn.execute(
            "SELECT name FROM brands WHERE name IN ('OMI', '欧米', '欧米箱包')"
        ).fetchone()
        assert omi_row is None

        result = compute_threat_index("CompBrand", db_path=path)

        # Should still produce a valid result using baseline
        assert "threat_index" in result
        assert "threat_breakdown" in result

    def test_threat_breakdown_structure(self, tmp_db):
        """Threat breakdown has all required signals."""
        path, conn = tmp_db
        _insert_brand(conn, "BDStruct")

        result = compute_threat_index("BDStruct", db_path=path)

        expected_signals = {"price_overlap", "closing_gap", "channel_expansion",
                           "kol_investment", "sentiment_momentum"}
        assert set(result["threat_breakdown"].keys()) == expected_signals
        for signal, info in result["threat_breakdown"].items():
            assert "score" in info
            assert "detail" in info

    def test_closing_gap_detects_faster_growth(self, tmp_db):
        """Closing gap score increases when competitor grows faster than OMI."""
        path, conn = tmp_db
        _insert_brand(conn, "FastGrow")
        # Insert deltas showing fast growth
        _insert_delta(conn, "FastGrow", "2026-03-28", "xhs_followers", 10000, 15000, 5000, 50.0)
        _insert_delta(conn, "FastGrow", "2026-03-28", "douyin_followers", 5000, 8000, 3000, 60.0)

        result = compute_threat_index("FastGrow", db_path=path)

        assert result["threat_breakdown"]["closing_gap"]["score"] > 0


# ─── GTM Signals ─────────────────────────────────────────────────────────────


class TestGTMSignals:
    """Tests for detect_gtm_signals function."""

    def test_product_blitz_triggered(self, tmp_db):
        """PRODUCT_BLITZ fires when shop_product_count delta >= 3."""
        path, conn = tmp_db
        _insert_brand(conn, "BlitzBrand")
        _insert_delta(conn, "BlitzBrand", "2026-03-28", "shop_product_count",
                      50, 58, 8, 16.0)

        signals = detect_gtm_signals("BlitzBrand", db_path=path)

        blitz = [s for s in signals if s["signal"] == "PRODUCT_BLITZ"]
        assert len(blitz) == 1
        assert "8" in blitz[0]["detail"]

    def test_product_blitz_not_triggered_small_change(self, tmp_db):
        """PRODUCT_BLITZ does NOT fire when delta < 3."""
        path, conn = tmp_db
        _insert_brand(conn, "SmallChange")
        _insert_delta(conn, "SmallChange", "2026-03-28", "shop_product_count",
                      50, 52, 2, 4.0)

        signals = detect_gtm_signals("SmallChange", db_path=path)

        blitz = [s for s in signals if s["signal"] == "PRODUCT_BLITZ"]
        assert len(blitz) == 0

    def test_viral_moment_triggered(self, tmp_db):
        """VIRAL_MOMENT fires when any social metric z-score > 3."""
        path, conn = tmp_db
        _insert_brand(conn, "ViralBrand")

        # Insert enough data points for z-score computation
        # 15 normal points + 1 extreme spike = z > 3
        base = datetime.now() - timedelta(days=25)
        for i in range(15):
            date = (base + timedelta(days=i * 1.5)).strftime("%Y-%m-%d")
            _insert_metric(conn, "ViralBrand", date, "xhs_followers", 1000)
        extreme_date = (base + timedelta(days=24)).strftime("%Y-%m-%d")
        _insert_metric(conn, "ViralBrand", extreme_date, "xhs_followers", 10000)

        signals = detect_gtm_signals("ViralBrand", db_path=path)

        viral = [s for s in signals if s["signal"] == "VIRAL_MOMENT"]
        assert len(viral) == 1
        assert viral[0]["severity"] == "high"

    def test_awareness_play_triggered(self, tmp_db):
        """AWARENESS_PLAY fires when KOL collabs grow > 50%."""
        path, conn = tmp_db
        _insert_brand(conn, "AwareBrand")
        _insert_delta(conn, "AwareBrand", "2026-03-28", "xhs_kol_collab_count",
                      10, 18, 8, 80.0)

        signals = detect_gtm_signals("AwareBrand", db_path=path)

        awareness = [s for s in signals if s["signal"] == "AWARENESS_PLAY"]
        assert len(awareness) == 1

    def test_no_signals_when_stable(self, tmp_db):
        """Returns empty list when no signals are active."""
        path, conn = tmp_db
        _insert_brand(conn, "StableBrand")
        # Small, unremarkable changes
        _insert_delta(conn, "StableBrand", "2026-03-28", "shop_product_count",
                      50, 51, 1, 2.0)
        _insert_delta(conn, "StableBrand", "2026-03-28", "xhs_kol_collab_count",
                      10, 11, 1, 10.0)

        signals = detect_gtm_signals("StableBrand", db_path=path)

        # Should have no PRODUCT_BLITZ (delta < 3) and no AWARENESS_PLAY (< 50%)
        blitz = [s for s in signals if s["signal"] in ("PRODUCT_BLITZ", "AWARENESS_PLAY")]
        assert len(blitz) == 0

    def test_channel_expansion_douyin(self, tmp_db):
        """CHANNEL_EXPANSION fires when Douyin data appears for the first time."""
        path, conn = tmp_db
        _insert_brand(conn, "NewDouyin")

        base = datetime.now() - timedelta(days=25)
        # First 5 dates: no Douyin data (value 0)
        for i in range(5):
            date = (base + timedelta(days=i * 3)).strftime("%Y-%m-%d")
            _insert_metric(conn, "NewDouyin", date, "douyin_followers", 0, "douyin")
        # Then data appears
        date6 = (base + timedelta(days=18)).strftime("%Y-%m-%d")
        _insert_metric(conn, "NewDouyin", date6, "douyin_followers", 5000, "douyin")

        signals = detect_gtm_signals("NewDouyin", db_path=path)

        channel = [s for s in signals if s["signal"] == "CHANNEL_EXPANSION"]
        assert len(channel) >= 1


# ─── score_all_brands ────────────────────────────────────────────────────────


class TestScoreAllBrands:
    """Tests for score_all_brands master function."""

    def test_processes_all_brands(self, tmp_db):
        """score_all_brands processes all brands with data."""
        path, conn = tmp_db
        _insert_brand(conn, "BrandA")
        _insert_brand(conn, "BrandB")

        # Insert metrics for both brands
        base = datetime.now() - timedelta(days=10)
        for brand in ("BrandA", "BrandB"):
            for i in range(3):
                date = (base + timedelta(days=i * 3)).strftime("%Y-%m-%d")
                _insert_metric(conn, brand, date, "xhs_followers", 1000 + i * 100)

        result = score_all_brands(db_path=path)

        assert result["brands_scored"] >= 2
        assert "results" in result
        brand_names = {r["brand_name"] for r in result["results"]}
        assert "BrandA" in brand_names
        assert "BrandB" in brand_names

    def test_saves_to_sqlite(self, tmp_db):
        """Scores are persisted to the scores table."""
        path, conn = tmp_db
        _insert_brand(conn, "SavedBrand")
        base = datetime.now() - timedelta(days=10)
        for i in range(3):
            date = (base + timedelta(days=i * 3)).strftime("%Y-%m-%d")
            _insert_metric(conn, "SavedBrand", date, "xhs_followers", 1000 + i * 100)

        score_all_brands(db_path=path)

        # Verify scores in DB
        scores = get_latest_scores(conn, "SavedBrand")
        assert len(scores) >= 1
        assert scores[0]["momentum_score"] is not None

    def test_deterministic(self, tmp_db):
        """Running twice produces identical scores."""
        path, conn = tmp_db
        _insert_brand(conn, "DetBrand")
        base = datetime.now() - timedelta(days=10)
        for i in range(3):
            date = (base + timedelta(days=i * 3)).strftime("%Y-%m-%d")
            _insert_metric(conn, "DetBrand", date, "xhs_followers", 1000 + i * 100)

        result1 = score_all_brands(db_path=path)
        result2 = score_all_brands(db_path=path)

        scores1 = {r["brand_name"]: r["momentum_score"] for r in result1["results"]}
        scores2 = {r["brand_name"]: r["momentum_score"] for r in result2["results"]}

        for brand in scores1:
            if brand in scores2:
                assert scores1[brand] == scores2[brand], f"Non-deterministic score for {brand}"


# ─── Storage Score Functions ─────────────────────────────────────────────────


class TestStorageScoreFunctions:
    """Tests for save_scores, get_latest_scores, get_score_history."""

    def test_save_and_get_latest_scores(self, tmp_db):
        """save_scores → get_latest_scores round-trip."""
        path, conn = tmp_db
        _insert_brand(conn, "ScoreBrand")

        save_scores(
            conn, "ScoreBrand", "2026-03-28",
            momentum_score=75.5,
            threat_index=62.3,
            gtm_signals=[{"signal": "PRODUCT_BLITZ", "detail": "5 new SKUs", "severity": "medium"}],
            score_breakdown={"xhs_follower_growth": {"raw": 10.0, "normalized": 80, "weight": 0.2}},
            threat_breakdown={"price_overlap": {"score": 50, "detail": "3 products"}},
            data_completeness=0.85,
        )

        scores = get_latest_scores(conn, "ScoreBrand")
        assert len(scores) == 1
        s = scores[0]
        assert s["momentum_score"] == 75.5
        assert s["threat_index"] == 62.3
        assert len(s["gtm_signals"]) == 1
        assert s["gtm_signals"][0]["signal"] == "PRODUCT_BLITZ"
        assert s["data_completeness"] == 0.85

    def test_upsert_replaces(self, tmp_db):
        """Saving scores twice for same brand+date replaces."""
        path, conn = tmp_db
        _insert_brand(conn, "UpsertScore")

        save_scores(conn, "UpsertScore", "2026-03-28", 50.0, 40.0, [], {}, {}, 0.5)
        save_scores(conn, "UpsertScore", "2026-03-28", 75.0, 60.0, [], {}, {}, 0.8)

        scores = get_latest_scores(conn, "UpsertScore")
        assert len(scores) == 1
        assert scores[0]["momentum_score"] == 75.0

    def test_get_latest_all_brands(self, tmp_db):
        """get_latest_scores(None) returns all brands."""
        path, conn = tmp_db
        _insert_brand(conn, "SA")
        _insert_brand(conn, "SB")

        save_scores(conn, "SA", "2026-03-28", 80.0, 50.0, [], {}, {}, 1.0)
        save_scores(conn, "SB", "2026-03-28", 60.0, 70.0, [], {}, {}, 1.0)

        scores = get_latest_scores(conn)
        brands = {s["brand_name"] for s in scores}
        assert "SA" in brands
        assert "SB" in brands

    def test_get_score_history(self, tmp_db):
        """get_score_history returns chronological list."""
        path, conn = tmp_db
        _insert_brand(conn, "HistScore")

        save_scores(conn, "HistScore", "2026-03-21", 60.0, 45.0, [], {}, {}, 0.8)
        save_scores(conn, "HistScore", "2026-03-28", 65.0, 48.0, [], {}, {}, 0.9)

        history = get_score_history(conn, "HistScore", days=30)
        assert len(history) == 2
        assert history[0][0] <= history[1][0]  # Chronological
        assert history[0][1] == 60.0
        assert history[1][1] == 65.0

    def test_get_latest_scores_empty(self, tmp_db):
        """get_latest_scores returns empty list when no data."""
        path, conn = tmp_db
        result = get_latest_scores(conn, "NoBrand")
        assert result == []


# ─── Edge Cases ──────────────────────────────────────────────────────────────


class TestEdgeCases:
    """Edge case tests."""

    def test_brand_with_single_snapshot(self, tmp_db):
        """Brand with only 1 snapshot gets scored with available data."""
        path, conn = tmp_db
        _insert_brand(conn, "SingleSnap")
        _insert_metric(conn, "SingleSnap", "2026-03-28", "xhs_followers", 5000)

        result = score_all_brands(db_path=path)

        # Should still appear in results (with low/zero scores, no deltas)
        brand_result = next(
            (r for r in result["results"] if r["brand_name"] == "SingleSnap"), None
        )
        assert brand_result is not None
        assert brand_result["momentum_score"] >= 0

    def test_empty_database(self, tmp_db):
        """Empty database doesn't crash."""
        path, conn = tmp_db

        result = score_all_brands(db_path=path)

        assert result["brands_scored"] >= 0
        assert "results" in result


# ─── Integration ─────────────────────────────────────────────────────────────


class TestScoringIntegration:
    """Integration test: seed + temporal + scoring."""

    def test_seed_temporal_scoring_pipeline(self):
        """Full pipeline: seed → temporal → scoring produces valid results."""
        from .seed_historical_data import seed_historical_data
        from .temporal import compute_deltas

        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)

        try:
            # Seed
            seed_result = seed_historical_data(db_path=path)
            assert seed_result["brands"] == 5

            # Temporal
            deltas = compute_deltas(db_path=path)
            assert len(deltas) > 0

            # Scoring
            result = score_all_brands(db_path=path)

            assert result["brands_scored"] > 0

            # All scored brands should have valid scores
            for r in result["results"]:
                assert 0 <= r["momentum_score"] <= 100
                assert 0 <= r["threat_index"] <= 100

            # 裘真 should have high momentum (week 4 spike)
            qiuzhen = next(
                (r for r in result["results"] if r["brand_name"] == "裘真"), None
            )
            songmont = next(
                (r for r in result["results"] if r["brand_name"] == "Songmont"), None
            )
            xiao_ck = next(
                (r for r in result["results"] if r["brand_name"] == "小CK"), None
            )

            if qiuzhen and songmont and xiao_ck:
                # 裘真 with its spike should rank higher than stable 小CK
                assert qiuzhen["momentum_score"] > xiao_ck["momentum_score"], (
                    f"裘真 ({qiuzhen['momentum_score']}) should beat 小CK ({xiao_ck['momentum_score']})"
                )

            # Scores should be saved to DB
            conn = init_db(path)
            scores = get_latest_scores(conn)
            assert len(scores) > 0
            conn.close()

        finally:
            os.unlink(path)

    def test_scoring_is_deterministic(self):
        """Running scoring twice on same data produces identical results."""
        from .seed_historical_data import seed_historical_data

        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)

        try:
            seed_historical_data(db_path=path)

            result1 = score_all_brands(db_path=path)
            result2 = score_all_brands(db_path=path)

            scores1 = {r["brand_name"]: r["momentum_score"] for r in result1["results"]}
            scores2 = {r["brand_name"]: r["momentum_score"] for r in result2["results"]}

            for brand in scores1:
                if brand in scores2:
                    assert scores1[brand] == scores2[brand]

        finally:
            os.unlink(path)
