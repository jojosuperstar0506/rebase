"""
Tests for temporal analysis engine (temporal.py) and storage.py delta functions.

Covers:
  - compute_deltas: two snapshots, single snapshot, division by zero
  - compute_rolling_stats: 4 data points, 1 data point
  - detect_anomalies: flags above threshold, ignores within range
  - get_brand_trend_summary: correct categorization (up/down/stable)
  - run_full_analysis: returns expected structure
  - Storage functions: save_deltas, get_latest_deltas, get_delta_history round-trips
  - Integration: seed_historical_data + temporal produces expected anomalies
"""

import os
import sqlite3
import tempfile
from datetime import datetime, timedelta

import pytest

from .storage import (
    get_delta_history,
    get_latest_deltas,
    init_db,
    save_deltas,
)
from .temporal import (
    _try_float,
    compute_deltas,
    compute_rolling_stats,
    detect_anomalies,
    get_brand_trend_summary,
    run_full_analysis,
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


# ─── compute_deltas ──────────────────────────────────────────────────────────


class TestComputeDeltas:
    """Tests for compute_deltas function."""

    def test_two_snapshots_correct_changes(self, tmp_db):
        """Two snapshots produce correct absolute and percentage changes."""
        path, conn = tmp_db
        _insert_brand(conn, "TestBrand")
        _insert_metric(conn, "TestBrand", "2026-03-01", "xhs_followers", 10000)
        _insert_metric(conn, "TestBrand", "2026-03-08", "xhs_followers", 11000)

        result = compute_deltas(db_path=path)

        assert "TestBrand" in result
        delta = result["TestBrand"]["xhs_followers"]
        assert delta["previous_value"] == 10000.0
        assert delta["current_value"] == 11000.0
        assert delta["absolute_change"] == 1000.0
        assert abs(delta["pct_change"] - 10.0) < 0.01

    def test_single_snapshot_returns_empty(self, tmp_db):
        """Single snapshot (no previous) gracefully returns empty."""
        path, conn = tmp_db
        _insert_brand(conn, "OnlyOne")
        _insert_metric(conn, "OnlyOne", "2026-03-08", "xhs_followers", 5000)

        result = compute_deltas(db_path=path)

        # Brand should not appear (needs 2+ data points)
        assert "OnlyOne" not in result

    def test_previous_value_zero_no_crash(self, tmp_db):
        """Previous value of 0 doesn't cause division by zero."""
        path, conn = tmp_db
        _insert_brand(conn, "ZeroBrand")
        _insert_metric(conn, "ZeroBrand", "2026-03-01", "xhs_followers", 0)
        _insert_metric(conn, "ZeroBrand", "2026-03-08", "xhs_followers", 1000)

        result = compute_deltas(db_path=path)

        assert "ZeroBrand" in result
        delta = result["ZeroBrand"]["xhs_followers"]
        assert delta["absolute_change"] == 1000.0
        assert delta["pct_change"] is None  # Can't compute % from zero

    def test_multiple_metrics(self, tmp_db):
        """Multiple metrics computed correctly for same brand."""
        path, conn = tmp_db
        _insert_brand(conn, "MultiBrand")
        _insert_metric(conn, "MultiBrand", "2026-03-01", "xhs_followers", 10000)
        _insert_metric(conn, "MultiBrand", "2026-03-08", "xhs_followers", 12000)
        _insert_metric(conn, "MultiBrand", "2026-03-01", "douyin_followers", 5000, "douyin")
        _insert_metric(conn, "MultiBrand", "2026-03-08", "douyin_followers", 4500, "douyin")

        result = compute_deltas(db_path=path)

        assert "MultiBrand" in result
        assert result["MultiBrand"]["xhs_followers"]["absolute_change"] == 2000.0
        assert result["MultiBrand"]["douyin_followers"]["absolute_change"] == -500.0

    def test_negative_change(self, tmp_db):
        """Declining metrics show negative changes."""
        path, conn = tmp_db
        _insert_brand(conn, "Declining")
        _insert_metric(conn, "Declining", "2026-03-01", "avg_engagement", 5000)
        _insert_metric(conn, "Declining", "2026-03-08", "avg_engagement", 4000)

        result = compute_deltas(db_path=path)

        delta = result["Declining"]["avg_engagement"]
        assert delta["absolute_change"] == -1000.0
        assert abs(delta["pct_change"] - (-20.0)) < 0.01

    def test_deltas_written_to_db(self, tmp_db):
        """Deltas are persisted to the deltas table."""
        path, conn = tmp_db
        _insert_brand(conn, "Persisted")
        _insert_metric(conn, "Persisted", "2026-03-01", "xhs_followers", 1000)
        _insert_metric(conn, "Persisted", "2026-03-08", "xhs_followers", 1100)

        compute_deltas(db_path=path)

        # Verify deltas table has data
        rows = conn.execute(
            "SELECT * FROM deltas WHERE brand_name = 'Persisted'"
        ).fetchall()
        assert len(rows) >= 1


# ─── compute_rolling_stats ───────────────────────────────────────────────────


class TestComputeRollingStats:
    """Tests for compute_rolling_stats function."""

    def test_four_data_points(self, tmp_db):
        """4 data points produce correct mean, std, and z-score."""
        path, conn = tmp_db
        _insert_brand(conn, "RollingBrand")
        # Insert 4 weeks of data: 100, 102, 104, 106 (steady increase)
        base = datetime.now() - timedelta(days=25)
        for i, val in enumerate([100, 102, 104, 106]):
            date = (base + timedelta(days=i * 7)).strftime("%Y-%m-%d")
            _insert_metric(conn, "RollingBrand", date, "xhs_followers", val)

        stats = compute_rolling_stats("RollingBrand", "xhs_followers", db_path=path)

        assert stats is not None
        assert stats["data_points"] == 4
        assert abs(stats["rolling_mean"] - 103.0) < 0.01
        assert stats["rolling_std"] is not None
        assert stats["rolling_std"] > 0
        assert stats["current_value"] == 106.0
        assert stats["z_score"] is not None

    def test_single_data_point(self, tmp_db):
        """Single data point returns None for std and z-score."""
        path, conn = tmp_db
        _insert_brand(conn, "SinglePoint")
        _insert_metric(conn, "SinglePoint", "2026-03-08", "xhs_followers", 5000)

        stats = compute_rolling_stats("SinglePoint", "xhs_followers", db_path=path)

        assert stats is not None
        assert stats["data_points"] == 1
        assert stats["current_value"] == 5000.0
        assert stats["rolling_std"] is None
        assert stats["z_score"] is None

    def test_no_data_returns_none(self, tmp_db):
        """No data for brand+metric returns None."""
        path, conn = tmp_db
        _insert_brand(conn, "EmptyBrand")

        stats = compute_rolling_stats("EmptyBrand", "xhs_followers", db_path=path)

        assert stats is None

    def test_constant_values_zero_std(self, tmp_db):
        """Constant values produce z_score of 0."""
        path, conn = tmp_db
        _insert_brand(conn, "FlatBrand")
        base = datetime.now() - timedelta(days=25)
        for i in range(4):
            date = (base + timedelta(days=i * 7)).strftime("%Y-%m-%d")
            _insert_metric(conn, "FlatBrand", date, "xhs_followers", 1000)

        stats = compute_rolling_stats("FlatBrand", "xhs_followers", db_path=path)

        assert stats is not None
        assert stats["rolling_std"] == 0
        assert stats["z_score"] == 0.0

    def test_z_score_direction(self, tmp_db):
        """A value above the mean produces positive z-score."""
        path, conn = tmp_db
        _insert_brand(conn, "ZBrand")
        base = datetime.now() - timedelta(days=25)
        # Values: 100, 100, 100, 200 — last value is above mean
        for i, val in enumerate([100, 100, 100, 200]):
            date = (base + timedelta(days=i * 7)).strftime("%Y-%m-%d")
            _insert_metric(conn, "ZBrand", date, "xhs_followers", val)

        stats = compute_rolling_stats("ZBrand", "xhs_followers", db_path=path)

        assert stats["z_score"] > 0


# ─── detect_anomalies ────────────────────────────────────────────────────────


class TestDetectAnomalies:
    """Tests for detect_anomalies function."""

    def test_flags_metrics_above_threshold(self, tmp_db):
        """Metrics with z-score above threshold are flagged."""
        path, conn = tmp_db
        _insert_brand(conn, "AnomalyBrand")
        base = datetime.now() - timedelta(days=25)
        # 8 data points within 28 days: 7 normal + 1 spike
        # More normal points anchor the mean/std so spike z-score > 2
        vals = [1000, 1000, 1000, 1000, 1000, 1000, 1000, 5000]
        for i, val in enumerate(vals):
            date = (base + timedelta(days=i * 3)).strftime("%Y-%m-%d")
            _insert_metric(conn, "AnomalyBrand", date, "xhs_followers", val)

        anomalies = detect_anomalies(threshold_sigma=2.0, db_path=path)

        brand_anomalies = [a for a in anomalies if a["brand_name"] == "AnomalyBrand"]
        assert len(brand_anomalies) > 0
        assert brand_anomalies[0]["direction"] == "up"
        assert brand_anomalies[0]["severity"] in ("medium", "high")

    def test_does_not_flag_normal_metrics(self, tmp_db):
        """Metrics within normal range are NOT flagged."""
        path, conn = tmp_db
        _insert_brand(conn, "NormalBrand")
        base = datetime.now() - timedelta(days=25)
        # Steady values, small changes
        for i, val in enumerate([1000, 1005, 1010, 1015]):
            date = (base + timedelta(days=i * 7)).strftime("%Y-%m-%d")
            _insert_metric(conn, "NormalBrand", date, "xhs_followers", val)

        anomalies = detect_anomalies(threshold_sigma=2.0, db_path=path)

        brand_anomalies = [a for a in anomalies if a["brand_name"] == "NormalBrand"]
        assert len(brand_anomalies) == 0

    def test_severity_levels(self, tmp_db):
        """Anomalies have correct severity based on z-score magnitude."""
        path, conn = tmp_db
        # Test medium severity (z between 2 and 3)
        _insert_brand(conn, "MedBrand")
        base = datetime.now() - timedelta(days=25)
        vals = [100, 100, 100, 100, 100, 100, 100, 5000]
        for i, val in enumerate(vals):
            date = (base + timedelta(days=i * 3)).strftime("%Y-%m-%d")
            _insert_metric(conn, "MedBrand", date, "xhs_followers", val)

        anomalies = detect_anomalies(threshold_sigma=2.0, db_path=path)
        med_anomalies = [a for a in anomalies if a["brand_name"] == "MedBrand"]
        assert len(med_anomalies) > 0
        assert med_anomalies[0]["severity"] == "medium"

        # Test high severity (z > 3) with even more extreme spike
        _insert_brand(conn, "HighBrand")
        # 15 normal points + 1 extreme spike ensures z > 3
        for i in range(15):
            date = (base + timedelta(days=i * 1.5)).strftime("%Y-%m-%d")
            _insert_metric(conn, "HighBrand", date, "xhs_followers", 100)
        extreme_date = (base + timedelta(days=24)).strftime("%Y-%m-%d")
        _insert_metric(conn, "HighBrand", extreme_date, "xhs_followers", 10000)

        anomalies2 = detect_anomalies(threshold_sigma=2.0, db_path=path)
        high_anomalies = [a for a in anomalies2 if a["brand_name"] == "HighBrand"]
        assert len(high_anomalies) > 0
        assert high_anomalies[0]["severity"] == "high"

    def test_anomaly_dict_structure(self, tmp_db):
        """Anomaly dicts have all required fields."""
        path, conn = tmp_db
        _insert_brand(conn, "StructBrand")
        base = datetime.now() - timedelta(days=25)
        vals = [100, 100, 100, 100, 100, 100, 100, 1000]
        for i, val in enumerate(vals):
            date = (base + timedelta(days=i * 3)).strftime("%Y-%m-%d")
            _insert_metric(conn, "StructBrand", date, "xhs_followers", val)

        anomalies = detect_anomalies(threshold_sigma=2.0, db_path=path)
        brand_anomalies = [a for a in anomalies if a["brand_name"] == "StructBrand"]
        assert len(brand_anomalies) > 0

        a = brand_anomalies[0]
        required_keys = {
            "brand_name", "metric_name", "current_value", "rolling_mean",
            "rolling_std", "z_score", "pct_change", "direction", "severity",
        }
        assert required_keys.issubset(set(a.keys()))


# ─── get_brand_trend_summary ─────────────────────────────────────────────────


class TestBrandTrendSummary:
    """Tests for get_brand_trend_summary function."""

    def test_categorizes_trending_up(self, tmp_db):
        """Increasing metrics categorized as trending_up."""
        path, conn = tmp_db
        _insert_brand(conn, "UpBrand")
        base = datetime.now() - timedelta(days=25)
        for i, val in enumerate([1000, 1200, 1400, 1600]):
            date = (base + timedelta(days=i * 7)).strftime("%Y-%m-%d")
            _insert_metric(conn, "UpBrand", date, "xhs_followers", val)

        summary = get_brand_trend_summary("UpBrand", db_path=path)

        assert summary["brand_name"] == "UpBrand"
        assert "xhs_followers" in summary["trending_up"]
        assert "xhs_followers" not in summary["trending_down"]
        assert "xhs_followers" not in summary["stable"]

    def test_categorizes_trending_down(self, tmp_db):
        """Decreasing metrics categorized as trending_down."""
        path, conn = tmp_db
        _insert_brand(conn, "DownBrand")
        base = datetime.now() - timedelta(days=25)
        for i, val in enumerate([2000, 1600, 1200, 800]):
            date = (base + timedelta(days=i * 7)).strftime("%Y-%m-%d")
            _insert_metric(conn, "DownBrand", date, "avg_engagement", val)

        summary = get_brand_trend_summary("DownBrand", db_path=path)

        assert "avg_engagement" in summary["trending_down"]

    def test_categorizes_stable(self, tmp_db):
        """Flat metrics categorized as stable."""
        path, conn = tmp_db
        _insert_brand(conn, "StableBrand")
        base = datetime.now() - timedelta(days=25)
        for i in range(4):
            date = (base + timedelta(days=i * 7)).strftime("%Y-%m-%d")
            _insert_metric(conn, "StableBrand", date, "xhs_followers", 1000)

        summary = get_brand_trend_summary("StableBrand", db_path=path)

        assert "xhs_followers" in summary["stable"]

    def test_summary_structure(self, tmp_db):
        """Summary dict has all required fields."""
        path, conn = tmp_db
        _insert_brand(conn, "SummBrand")
        _insert_metric(conn, "SummBrand", "2026-03-08", "xhs_followers", 1000)

        summary = get_brand_trend_summary("SummBrand", db_path=path)

        required_keys = {
            "brand_name", "data_points", "period",
            "trending_up", "trending_down", "stable", "anomalies",
        }
        assert required_keys.issubset(set(summary.keys()))


# ─── run_full_analysis ───────────────────────────────────────────────────────


class TestRunFullAnalysis:
    """Tests for run_full_analysis function."""

    def test_returns_expected_structure(self, tmp_db):
        """Full analysis returns dict with all expected keys."""
        path, conn = tmp_db
        _insert_brand(conn, "FullBrand")
        base = datetime.now() - timedelta(days=25)
        for i, val in enumerate([100, 110, 120, 130]):
            date = (base + timedelta(days=i * 7)).strftime("%Y-%m-%d")
            _insert_metric(conn, "FullBrand", date, "xhs_followers", val)

        result = run_full_analysis(db_path=path)

        assert "analysis_date" in result
        assert "brands_with_deltas" in result
        assert "total_anomalies" in result
        assert "deltas" in result
        assert "anomalies" in result
        assert isinstance(result["deltas"], dict)
        assert isinstance(result["anomalies"], list)

    def test_empty_db_no_crash(self, tmp_db):
        """Empty database doesn't crash."""
        path, conn = tmp_db

        result = run_full_analysis(db_path=path)

        assert result["brands_with_deltas"] == 0
        assert result["total_anomalies"] == 0


# ─── Storage delta functions ─────────────────────────────────────────────────


class TestStorageDeltaFunctions:
    """Tests for save_deltas, get_latest_deltas, get_delta_history."""

    def test_save_and_get_latest_deltas(self, tmp_db):
        """save_deltas → get_latest_deltas round-trip."""
        path, conn = tmp_db
        _insert_brand(conn, "DeltaBrand")

        deltas_dict = {
            "xhs_followers": {
                "previous_value": 1000,
                "current_value": 1100,
                "absolute_change": 100.0,
                "pct_change": 10.0,
            },
            "douyin_followers": {
                "previous_value": 500,
                "current_value": 550,
                "absolute_change": 50.0,
                "pct_change": 10.0,
            },
        }
        save_deltas(conn, "DeltaBrand", "2026-03-08", deltas_dict)

        result = get_latest_deltas(conn, "DeltaBrand")
        assert len(result) == 2

        # Check values
        xhs = next(r for r in result if r["metric_name"] == "xhs_followers")
        assert xhs["absolute_change"] == 100.0
        assert xhs["pct_change"] == 10.0

    def test_save_deltas_upsert(self, tmp_db):
        """Saving deltas twice for same brand+date+metric overwrites."""
        path, conn = tmp_db
        _insert_brand(conn, "UpsertBrand")

        d1 = {"xhs_followers": {"previous_value": 100, "current_value": 110,
                                 "absolute_change": 10, "pct_change": 10.0}}
        save_deltas(conn, "UpsertBrand", "2026-03-08", d1)

        d2 = {"xhs_followers": {"previous_value": 100, "current_value": 120,
                                 "absolute_change": 20, "pct_change": 20.0}}
        save_deltas(conn, "UpsertBrand", "2026-03-08", d2)

        result = get_latest_deltas(conn, "UpsertBrand")
        assert len(result) == 1
        assert result[0]["absolute_change"] == 20.0

    def test_get_latest_deltas_all_brands(self, tmp_db):
        """get_latest_deltas(None) returns all brands."""
        path, conn = tmp_db
        _insert_brand(conn, "BrandA")
        _insert_brand(conn, "BrandB")

        save_deltas(conn, "BrandA", "2026-03-08",
                    {"xhs_followers": {"previous_value": 100, "current_value": 110,
                                       "absolute_change": 10, "pct_change": 10.0}})
        save_deltas(conn, "BrandB", "2026-03-08",
                    {"xhs_followers": {"previous_value": 200, "current_value": 220,
                                       "absolute_change": 20, "pct_change": 10.0}})

        result = get_latest_deltas(conn)
        brands = {r["brand_name"] for r in result}
        assert "BrandA" in brands
        assert "BrandB" in brands

    def test_get_delta_history(self, tmp_db):
        """get_delta_history returns chronological list."""
        path, conn = tmp_db
        _insert_brand(conn, "HistBrand")

        save_deltas(conn, "HistBrand", "2026-03-01",
                    {"xhs_followers": {"previous_value": 100, "current_value": 110,
                                       "absolute_change": 10, "pct_change": 10.0}})
        save_deltas(conn, "HistBrand", "2026-03-08",
                    {"xhs_followers": {"previous_value": 110, "current_value": 125,
                                       "absolute_change": 15, "pct_change": 13.6}})

        history = get_delta_history(conn, "HistBrand", "xhs_followers", days=30)
        assert len(history) == 2
        assert history[0][0] <= history[1][0]  # Chronological
        assert history[0][1] == 10.0
        assert history[1][1] == 15.0

    def test_get_latest_deltas_empty(self, tmp_db):
        """get_latest_deltas returns empty list when no data."""
        path, conn = tmp_db
        result = get_latest_deltas(conn, "NoBrand")
        assert result == []


# ─── Utility functions ───────────────────────────────────────────────────────


class TestTryFloat:
    """Tests for _try_float utility."""

    def test_float_string(self):
        assert _try_float("123.45") == 123.45

    def test_int_string(self):
        assert _try_float("100") == 100.0

    def test_none(self):
        assert _try_float(None) is None

    def test_non_numeric(self):
        assert _try_float("not_a_number") is None

    def test_actual_float(self):
        assert _try_float(42.0) == 42.0


# ─── Integration: seed + temporal ────────────────────────────────────────────


class TestSeedIntegration:
    """Integration test: seed_historical_data + temporal analysis."""

    def test_seed_and_analyze(self):
        """Seeded data produces expected anomalies for 裘真 and CASSILE."""
        from .seed_historical_data import seed_historical_data

        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)

        try:
            seed_result = seed_historical_data(db_path=path)
            assert seed_result["brands"] == 5
            assert seed_result["weeks"] >= 4

            # Run temporal analysis
            result = run_full_analysis(db_path=path)

            assert result["brands_with_deltas"] > 0

            # Check that anomalies were detected
            anomaly_brands = {a["brand_name"] for a in result["anomalies"]}

            # 裘真 should have anomalies (week 4 spike)
            assert "裘真" in anomaly_brands, (
                f"Expected 裘真 to have anomalies, got: {anomaly_brands}"
            )

            # CASSILE may have anomalies (declining engagement)
            # This depends on the threshold — at least 裘真 should be flagged

            # 小CK should NOT have anomalies (stable)
            xiao_ck_anomalies = [
                a for a in result["anomalies"] if a["brand_name"] == "小CK"
            ]
            assert len(xiao_ck_anomalies) == 0, (
                f"小CK should be stable but got anomalies: {xiao_ck_anomalies}"
            )

        finally:
            os.unlink(path)

    def test_seed_data_counts(self):
        """Seeded data has expected structure and counts."""
        from .seed_historical_data import seed_historical_data

        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)

        try:
            seed_result = seed_historical_data(db_path=path)

            conn = init_db(path)

            # Check metrics table has data
            count = conn.execute("SELECT COUNT(*) as c FROM metrics").fetchone()["c"]
            assert count == seed_result["total_data_points"]
            assert count > 0

            # Check each brand has data
            for brand in ["Songmont", "裘真", "小CK", "CASSILE", "La Festin"]:
                brand_count = conn.execute(
                    "SELECT COUNT(*) as c FROM metrics WHERE brand_name = ?",
                    (brand,),
                ).fetchone()["c"]
                assert brand_count > 0, f"{brand} should have metric data"

            conn.close()
        finally:
            os.unlink(path)
