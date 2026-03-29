"""
Tests for the SQLite storage layer.

Run with:
    cd services/competitor-intel && python -m pytest test_storage.py -v
"""

import json
import os
import sqlite3
import tempfile
from datetime import datetime

import pytest

from .storage import (
    DEFAULT_DB_PATH,
    METRIC_EXTRACTION_MAP,
    _resolve_json_path,
    export_latest_json,
    get_all_brands,
    get_latest_snapshot,
    get_metric_history,
    init_db,
    record_scrape_run,
    save_snapshot,
    update_scrape_run,
)
from .config import BRAND_GROUPS


# ─── Fixtures ────────────────────────────────────────────────────────────────


@pytest.fixture
def db_conn(tmp_path):
    """Create a fresh in-memory-like DB for each test."""
    db_path = str(tmp_path / "test.db")
    conn = init_db(db_path)
    yield conn
    conn.close()


def _make_sample_brand_data(
    brand_name: str = "小CK",
    scrape_date: str = "2026-03-28",
) -> dict:
    """Create a realistic merged 7-dimension data dict for testing."""
    return {
        "brand_name": brand_name,
        "brand_name_en": "Charles & Keith",
        "group": "D",
        "group_name": "快时尚/International",
        "badge": "东南亚快时尚标杆",
        "scrape_date": scrape_date,
        "scrape_status": {"xhs": "success", "douyin": "success", "sycm": "skipped"},
        "d1_brand_search_index": {
            "xhs_suggestions": ["小CK包包", "小CK新款"],
            "xhs_related": ["轻奢包包"],
            "douyin_suggestions": ["小CK测评"],
            "douyin_trending": ["小CK穿搭"],
        },
        "d2_brand_voice_volume": {
            "xhs": {
                "followers": 150000,
                "notes": 8500,
                "likes": 320000,
                "account_name": "Charles & Keith Official",
                "account_id": "ck12345",
            },
            "douyin": {
                "followers": 89000,
                "videos": 420,
                "likes": 1200000,
                "account_name": "小CK官方",
                "account_id": "dy67890",
                "verified": True,
            },
        },
        "d3_content_strategy": {
            "content_types": {"穿搭OOTD": 35, "测评对比": 20, "开箱": 15},
            "top_notes": [{"title": "小CK新款测评", "likes": 5000}],
            "posting_frequency": "每周3-4篇",
            "avg_engagement": "2.5%",
        },
        "d4_kol_ecosystem": {
            "xhs_kols": [{"name": "包包博主A", "followers": 50000}],
            "xhs_collab_count": 12,
            "xhs_celebrity_mentions": ["明星A"],
            "douyin_creators": [{"name": "达人B", "followers": 100000}],
            "douyin_mentions_count": 35,
            "douyin_hashtag_views": {"#小CK": "1.2亿"},
        },
        "d5_social_commerce": {
            "live_status": "active",
            "live_viewers": 5000,
            "shop_product_count": 128,
            "live_frequency": "每天",
            "avg_live_viewers": "3000-5000",
            "top_selling_products": [{"name": "经典翻盖包", "price": 399}],
        },
        "d6_consumer_mindshare": {
            "sentiment_keywords": ["好看", "性价比"],
            "positive_keywords": ["好看", "百搭", "轻便"],
            "negative_keywords": ["偏硬"],
            "ugc_samples": [{"title": "小CK包包真实测评", "sentiment": "positive"}],
        },
        "d7_channel_authority": {
            "tmall_rank": "Top 15",
            "category_share": "3.2%",
            "monthly_sales_index": "8500",
            "price_band": "200-600",
            "top_products": [{"name": "经典翻盖包", "sales_index": "1200"}],
            "traffic_sources": {"搜索": "45%", "推荐": "30%"},
            "conversion_index": "4.8%",
        },
    }


# ─── Tests: init_db ──────────────────────────────────────────────────────────


class TestInitDb:
    def test_creates_all_tables(self, db_conn):
        """init_db should create brands, scrape_runs, snapshots, metrics, deltas tables."""
        tables = db_conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
        table_names = sorted([row["name"] for row in tables])
        assert "brands" in table_names
        assert "scrape_runs" in table_names
        assert "snapshots" in table_names
        assert "metrics" in table_names
        assert "deltas" in table_names

    def test_brands_populated_from_config(self, db_conn):
        """init_db should populate the brands table with all 20 brands from config."""
        count = db_conn.execute("SELECT COUNT(*) as cnt FROM brands").fetchone()["cnt"]
        # Count brands from config
        expected = sum(len(g["brands"]) for g in BRAND_GROUPS.values())
        assert count == expected
        assert count == 20

    def test_brand_data_matches_config(self, db_conn):
        """Spot-check a brand's data matches config.py."""
        row = db_conn.execute(
            'SELECT * FROM brands WHERE name = "小CK"'
        ).fetchone()
        assert row is not None
        assert row["name_en"] == "Charles & Keith"
        assert row["group"] == "D"
        assert row["group_name"] == "快时尚/International"
        assert row["badge"] == "东南亚快时尚标杆"
        assert row["xhs_keyword"] == "小CK"
        assert row["tmall_store"] == "charleskeith"

    def test_idempotent(self, tmp_path):
        """Calling init_db twice on the same path should not duplicate brands."""
        db_path = str(tmp_path / "test.db")
        conn1 = init_db(db_path)
        count1 = conn1.execute("SELECT COUNT(*) as cnt FROM brands").fetchone()["cnt"]
        conn1.close()

        conn2 = init_db(db_path)
        count2 = conn2.execute("SELECT COUNT(*) as cnt FROM brands").fetchone()["cnt"]
        conn2.close()

        assert count1 == count2 == 20


# ─── Tests: scrape_runs ─────────────────────────────────────────────────────


class TestScrapeRuns:
    def test_record_scrape_run_returns_id(self, db_conn):
        """record_scrape_run should return a positive integer run_id."""
        run_id = record_scrape_run(db_conn, status="running", brands_attempted=20)
        assert isinstance(run_id, int)
        assert run_id > 0

    def test_record_scrape_run_persists(self, db_conn):
        """The recorded run should be retrievable from the database."""
        run_id = record_scrape_run(
            db_conn,
            status="completed",
            brands_attempted=20,
            brands_succeeded=18,
            error_log="2 brands failed: timeout",
        )
        row = db_conn.execute(
            "SELECT * FROM scrape_runs WHERE run_id = ?", (run_id,)
        ).fetchone()
        assert row["status"] == "completed"
        assert row["brands_attempted"] == 20
        assert row["brands_succeeded"] == 18
        assert "2 brands failed" in row["error_log"]

    def test_update_scrape_run(self, db_conn):
        """update_scrape_run should modify the specified fields."""
        run_id = record_scrape_run(db_conn, status="running", brands_attempted=20)
        update_scrape_run(db_conn, run_id, status="completed", brands_succeeded=19)
        row = db_conn.execute(
            "SELECT * FROM scrape_runs WHERE run_id = ?", (run_id,)
        ).fetchone()
        assert row["status"] == "completed"
        assert row["brands_succeeded"] == 19


# ─── Tests: save_snapshot + get_latest_snapshot ──────────────────────────────


class TestSnapshots:
    def test_save_and_get_roundtrip(self, db_conn):
        """Saving a snapshot and retrieving it should return identical data."""
        run_id = record_scrape_run(db_conn, status="completed", brands_attempted=1)
        data = _make_sample_brand_data("小CK")
        save_snapshot(db_conn, run_id, "小CK", data)

        result = get_latest_snapshot(db_conn, "小CK")
        assert result is not None
        assert result["brand_name"] == "小CK"
        assert result["d2_brand_voice_volume"]["xhs"]["followers"] == 150000
        assert result["d5_social_commerce"]["live_status"] == "active"

    def test_latest_returns_most_recent(self, db_conn):
        """When multiple snapshots exist, get_latest_snapshot returns the newest."""
        run_id = record_scrape_run(db_conn, status="completed", brands_attempted=1)

        old_data = _make_sample_brand_data("小CK", scrape_date="2026-03-20")
        old_data["d2_brand_voice_volume"]["xhs"]["followers"] = 100000
        save_snapshot(db_conn, run_id, "小CK", old_data)

        new_data = _make_sample_brand_data("小CK", scrape_date="2026-03-28")
        new_data["d2_brand_voice_volume"]["xhs"]["followers"] = 150000
        save_snapshot(db_conn, run_id, "小CK", new_data)

        result = get_latest_snapshot(db_conn, "小CK")
        assert result["d2_brand_voice_volume"]["xhs"]["followers"] == 150000
        assert result["scrape_date"] == "2026-03-28"

    def test_get_latest_nonexistent_brand(self, db_conn):
        """get_latest_snapshot returns None for a brand with no snapshots."""
        result = get_latest_snapshot(db_conn, "小CK")
        assert result is None

    def test_snapshot_extracts_metrics(self, db_conn):
        """save_snapshot should also populate the metrics table."""
        run_id = record_scrape_run(db_conn, status="completed", brands_attempted=1)
        data = _make_sample_brand_data("小CK")
        save_snapshot(db_conn, run_id, "小CK", data)

        rows = db_conn.execute(
            "SELECT metric_name, metric_value, platform FROM metrics WHERE brand_name = '小CK'"
        ).fetchall()
        metrics_dict = {row["metric_name"]: row["metric_value"] for row in rows}

        assert metrics_dict["xhs_followers"] == "150000"
        assert metrics_dict["douyin_followers"] == "89000"
        assert metrics_dict["xhs_likes"] == "320000"
        assert metrics_dict["douyin_videos"] == "420"
        assert metrics_dict["live_status"] == "active"
        assert metrics_dict["shop_product_count"] == "128"
        assert metrics_dict["tmall_rank"] == "Top 15"
        assert metrics_dict["category_share"] == "3.2%"
        assert metrics_dict["content_posting_frequency"] == "每周3-4篇"
        assert metrics_dict["avg_engagement"] == "2.5%"


# ─── Tests: get_metric_history ───────────────────────────────────────────────


class TestMetricHistory:
    def test_returns_ordered_history(self, db_conn):
        """get_metric_history should return date-ordered (ascending) results."""
        run_id = record_scrape_run(db_conn, status="completed", brands_attempted=1)

        dates = ["2026-03-20", "2026-03-23", "2026-03-26", "2026-03-28"]
        follower_counts = [100000, 110000, 130000, 150000]

        for date, followers in zip(dates, follower_counts):
            data = _make_sample_brand_data("小CK", scrape_date=date)
            data["d2_brand_voice_volume"]["xhs"]["followers"] = followers
            save_snapshot(db_conn, run_id, "小CK", data)

        history = get_metric_history(db_conn, "小CK", "xhs_followers", days=30)
        assert len(history) == 4
        # Check ascending date order
        assert history[0][0] == "2026-03-20"
        assert history[-1][0] == "2026-03-28"
        # Check values
        assert history[0][1] == "100000"
        assert history[-1][1] == "150000"

    def test_respects_days_filter(self, db_conn):
        """get_metric_history should only return data within the specified day range."""
        run_id = record_scrape_run(db_conn, status="completed", brands_attempted=1)

        # Insert data from 60 days ago and today
        old_data = _make_sample_brand_data("小CK", scrape_date="2026-01-28")
        save_snapshot(db_conn, run_id, "小CK", old_data)

        new_data = _make_sample_brand_data("小CK", scrape_date="2026-03-28")
        save_snapshot(db_conn, run_id, "小CK", new_data)

        # Only last 30 days
        history = get_metric_history(db_conn, "小CK", "xhs_followers", days=30)
        assert len(history) == 1
        assert history[0][0] == "2026-03-28"

        # Last 90 days should include both
        history_90 = get_metric_history(db_conn, "小CK", "xhs_followers", days=90)
        assert len(history_90) == 2

    def test_empty_history(self, db_conn):
        """get_metric_history returns empty list when no data exists."""
        history = get_metric_history(db_conn, "小CK", "xhs_followers")
        assert history == []


# ─── Tests: get_all_brands ───────────────────────────────────────────────────


class TestGetAllBrands:
    def test_returns_all_20_brands(self, db_conn):
        """get_all_brands should return all 20 brands from the registry."""
        brands = get_all_brands(db_conn)
        assert len(brands) == 20

    def test_brand_has_all_fields(self, db_conn):
        """Each brand dict should have all expected fields."""
        brands = get_all_brands(db_conn)
        expected_fields = {
            "name", "name_en", "group", "group_name", "badge",
            "xhs_keyword", "douyin_keyword", "tmall_store",
        }
        for brand in brands:
            assert expected_fields.issubset(brand.keys()), (
                f"Brand {brand.get('name')} missing fields: "
                f"{expected_fields - brand.keys()}"
            )


# ─── Tests: export_latest_json ───────────────────────────────────────────────


class TestExportLatestJson:
    def test_produces_valid_json(self, db_conn, tmp_path):
        """export_latest_json should write a valid JSON file."""
        run_id = record_scrape_run(db_conn, status="completed", brands_attempted=1)
        data = _make_sample_brand_data("小CK")
        save_snapshot(db_conn, run_id, "小CK", data)

        output_path = str(tmp_path / "competitors_latest.json")
        export_latest_json(db_conn, output_path)

        assert os.path.exists(output_path)
        with open(output_path, "r", encoding="utf-8") as f:
            result = json.load(f)

        assert isinstance(result, dict)

    def test_matches_existing_schema(self, db_conn, tmp_path):
        """Exported JSON should have the same top-level keys as the existing schema."""
        run_id = record_scrape_run(db_conn, status="completed", brands_attempted=1)
        data = _make_sample_brand_data("小CK")
        save_snapshot(db_conn, run_id, "小CK", data)

        output_path = str(tmp_path / "competitors_latest.json")
        export_latest_json(db_conn, output_path)

        with open(output_path, "r", encoding="utf-8") as f:
            result = json.load(f)

        # Must have these top-level keys (matching existing schema)
        assert "scrape_date" in result
        assert "scrape_version" in result
        assert result["scrape_version"] == "7dim-v1"
        assert "dashboard_html" in result
        assert result["dashboard_html"] == "/competitor-intel.html"
        assert "brands_count" in result
        assert "groups" in result
        assert "brands" in result

    def test_includes_brand_data(self, db_conn, tmp_path):
        """Exported JSON should include the actual brand snapshot data."""
        run_id = record_scrape_run(db_conn, status="completed", brands_attempted=1)
        data = _make_sample_brand_data("小CK")
        save_snapshot(db_conn, run_id, "小CK", data)

        output_path = str(tmp_path / "competitors_latest.json")
        export_latest_json(db_conn, output_path)

        with open(output_path, "r", encoding="utf-8") as f:
            result = json.load(f)

        assert "小CK" in result["brands"]
        assert result["brands"]["小CK"]["d2_brand_voice_volume"]["xhs"]["followers"] == 150000
        assert result["brands_count"] == 1

    def test_includes_all_groups(self, db_conn, tmp_path):
        """Exported JSON should include all 3 brand groups."""
        output_path = str(tmp_path / "competitors_latest.json")
        export_latest_json(db_conn, output_path)

        with open(output_path, "r", encoding="utf-8") as f:
            result = json.load(f)

        assert "D" in result["groups"]
        assert "C" in result["groups"]
        assert "B" in result["groups"]
        assert result["groups"]["D"]["name"] == "快时尚/International"

    def test_empty_db_still_valid(self, db_conn, tmp_path):
        """Exporting from a DB with no snapshots should produce valid JSON with 0 brands."""
        output_path = str(tmp_path / "competitors_latest.json")
        export_latest_json(db_conn, output_path)

        with open(output_path, "r", encoding="utf-8") as f:
            result = json.load(f)

        assert result["brands_count"] == 0
        assert result["brands"] == {}
        assert len(result["groups"]) == 3  # Groups always present from config


# ─── Tests: _resolve_json_path helper ────────────────────────────────────────


class TestResolveJsonPath:
    def test_simple_path(self):
        data = {"a": {"b": {"c": 42}}}
        assert _resolve_json_path(data, "a.b.c") == 42

    def test_missing_key(self):
        data = {"a": {"b": 1}}
        assert _resolve_json_path(data, "a.x.y") is None

    def test_top_level(self):
        data = {"foo": "bar"}
        assert _resolve_json_path(data, "foo") == "bar"

    def test_non_dict_intermediate(self):
        data = {"a": "string_not_dict"}
        assert _resolve_json_path(data, "a.b") is None
