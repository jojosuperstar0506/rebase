"""
Tests for product ranking extraction pipeline (TASK-02B).

Covers:
- SYCM schema validation (required fields, rank sequencing)
- Douyin schema validation (optional brand, sales conversion)
- Price string handling
- save_product_rankings / get_product_rankings round-trip
- get_ranking_history brand filtering
- Import script data type detection (ranking vs brand extract)
- Brand frequency summary calculation
"""

import json
import os
import tempfile
from pathlib import Path

import pytest

from .chrome_schema import (
    normalize_numbers_recursive,
    parse_chinese_number,
    validate_and_normalize_ranking,
    validate_douyin_ranking,
    validate_sycm_ranking,
)
from .import_chrome_extract import (
    _compute_brand_frequency,
    _detect_data_type,
    import_rankings,
)
from .storage import (
    get_product_rankings,
    get_ranking_history,
    init_db,
    save_product_rankings,
)


# ─── SYCM Schema Validation ──────────────────────────────────────────────────


class TestSycmValidation:
    """Test validate_sycm_ranking() with various inputs."""

    def _make_sycm(self, **overrides):
        """Helper to create a minimal valid SYCM ranking."""
        base = {
            "source": "sycm",
            "extract_date": "2026-03-28",
            "category_path": "箱包皮具 > 女士包",
            "time_range": "最近7天",
            "ranking_type": "交易指数",
            "total_extracted": 3,
            "pages_navigated": 1,
            "products": [
                {"rank": 1, "product_name": "Product A", "brand": "Songmont", "price": "¥899", "transaction_index": 98543},
                {"rank": 2, "product_name": "Product B", "brand": "CASSILE", "price": "¥599", "transaction_index": 87654},
                {"rank": 3, "product_name": "Product C", "brand": "裘真", "price": "¥459", "transaction_index": 76543},
            ],
        }
        base.update(overrides)
        return base

    def test_valid_sycm(self):
        errors = validate_sycm_ranking(self._make_sycm())
        assert errors == []

    def test_wrong_source(self):
        errors = validate_sycm_ranking(self._make_sycm(source="douyin_shop"))
        assert any("sycm" in e for e in errors)

    def test_missing_source(self):
        data = self._make_sycm()
        del data["source"]
        errors = validate_sycm_ranking(data)
        assert any("source" in e for e in errors)

    def test_missing_extract_date(self):
        data = self._make_sycm()
        del data["extract_date"]
        errors = validate_sycm_ranking(data)
        assert any("extract_date" in e for e in errors)

    def test_invalid_date_format(self):
        errors = validate_sycm_ranking(self._make_sycm(extract_date="28/03/2026"))
        assert any("YYYY-MM-DD" in e for e in errors)

    def test_missing_products(self):
        data = self._make_sycm()
        del data["products"]
        errors = validate_sycm_ranking(data)
        assert any("products" in e for e in errors)

    def test_total_mismatch(self):
        errors = validate_sycm_ranking(self._make_sycm(total_extracted=5))
        assert any("total_extracted" in e and "5" in e for e in errors)

    def test_rank_gap_detected(self):
        data = self._make_sycm()
        data["products"][1]["rank"] = 5  # Gap: 1, 5, 3
        data["total_extracted"] = 3
        errors = validate_sycm_ranking(data)
        assert any("Rank gap" in e for e in errors)

    def test_missing_product_brand(self):
        data = self._make_sycm()
        del data["products"][0]["brand"]
        errors = validate_sycm_ranking(data)
        assert any("brand" in e for e in errors)

    def test_missing_product_price(self):
        data = self._make_sycm()
        del data["products"][0]["price"]
        errors = validate_sycm_ranking(data)
        assert any("price" in e for e in errors)

    def test_missing_product_name(self):
        data = self._make_sycm()
        del data["products"][0]["product_name"]
        errors = validate_sycm_ranking(data)
        assert any("product_name" in e for e in errors)


# ─── Douyin Schema Validation ─────────────────────────────────────────────────


class TestDouyinRankingValidation:
    """Test validate_douyin_ranking() with various inputs."""

    def _make_douyin(self, **overrides):
        """Helper to create a minimal valid Douyin ranking."""
        base = {
            "source": "douyin_shop",
            "extract_date": "2026-03-28",
            "category_path": "箱包 > 女包",
            "time_range": "最近7天",
            "ranking_type": "销售额",
            "total_extracted": 2,
            "pages_navigated": 1,
            "products": [
                {"rank": 1, "product_name": "Product X", "brand": "裘真", "price": "¥459", "sales_volume": "1.2万"},
                {"rank": 2, "product_name": "Product Y", "price": "¥299", "sales_volume": 5000},
            ],
        }
        base.update(overrides)
        return base

    def test_valid_douyin(self):
        errors = validate_douyin_ranking(self._make_douyin())
        assert errors == []

    def test_brand_optional(self):
        """Douyin products don't always show brand — should not error."""
        data = self._make_douyin()
        # Product Y already has no brand field — this should be fine
        del data["products"][0]["brand"]
        errors = validate_douyin_ranking(data)
        # brand is not required for douyin
        assert not any("brand" in e for e in errors)

    def test_wrong_source(self):
        errors = validate_douyin_ranking(self._make_douyin(source="sycm"))
        assert any("douyin_shop" in e for e in errors)

    def test_rank_gap_detected(self):
        data = self._make_douyin()
        data["products"][1]["rank"] = 10
        errors = validate_douyin_ranking(data)
        assert any("Rank gap" in e for e in errors)

    def test_total_mismatch(self):
        errors = validate_douyin_ranking(self._make_douyin(total_extracted=99))
        assert any("total_extracted" in e for e in errors)


# ─── Price String Handling ────────────────────────────────────────────────────


class TestPriceHandling:
    """Price is stored as string — should handle various formats."""

    def test_yen_prefix(self):
        """¥299 stays as string."""
        data = {"price": "¥299"}
        result = normalize_numbers_recursive(data)
        # ¥299 should NOT be converted to a number (it has a prefix)
        assert isinstance(result["price"], str)

    def test_price_range_preserved(self):
        """¥299-¥599 stays as string."""
        assert parse_chinese_number("¥299-¥599") == "¥299-¥599"

    def test_bare_number_price(self):
        """299 as string gets converted to int, but that's fine — it's stored as TEXT in DB."""
        assert parse_chinese_number("299") == 299

    def test_range_with_tilde(self):
        """1000~2500 stays as string."""
        assert parse_chinese_number("1000~2500") == "1000~2500"


# ─── Chinese Numbers in Rankings ──────────────────────────────────────────────


class TestRankingNumberConversion:
    """Test Chinese number conversion in ranking-specific fields."""

    def test_sales_volume_wan(self):
        data = {"sales_volume": "1.2万"}
        result = normalize_numbers_recursive(data)
        assert result["sales_volume"] == 12000

    def test_sales_revenue_wan(self):
        data = {"sales_revenue": "550万"}
        result = normalize_numbers_recursive(data)
        assert result["sales_revenue"] == 5500000

    def test_transaction_index_passthrough(self):
        """Integer index should pass through unchanged."""
        data = {"transaction_index": 98543}
        result = normalize_numbers_recursive(data)
        assert result["transaction_index"] == 98543

    def test_search_popularity_comma(self):
        data = {"search_popularity": "45,230"}
        result = normalize_numbers_recursive(data)
        assert result["search_popularity"] == 45230


# ─── Storage Round-Trip ───────────────────────────────────────────────────────


class TestProductRankingsStorage:
    """Test save_product_rankings / get_product_rankings / get_ranking_history."""

    def _sample_products(self):
        return [
            {"rank": 1, "product_name": "Songmont Hobo包", "brand": "Songmont", "price": "¥899",
             "transaction_index": 98543, "store_name": "Songmont官方旗舰店"},
            {"rank": 2, "product_name": "CASSILE 小菜篮", "brand": "CASSILE", "price": "¥599",
             "transaction_index": 87654, "store_name": "CASSILE卡思乐旗舰店"},
            {"rank": 3, "product_name": "裘真 hobo包", "brand": "裘真", "price": "¥459",
             "transaction_index": 76543, "store_name": "裘真旗舰店"},
            {"rank": 4, "product_name": "Songmont 托特包", "brand": "Songmont", "price": "¥1290",
             "transaction_index": 65432, "store_name": "Songmont官方旗舰店"},
        ]

    def test_save_and_get_roundtrip(self, tmp_path):
        """Save rankings and retrieve them."""
        db = str(tmp_path / "test.db")
        conn = init_db(db)
        products = self._sample_products()

        inserted = save_product_rankings(
            conn, "sycm", "2026-03-28", "箱包皮具 > 女士包",
            "交易指数", products, "最近7天",
        )
        assert inserted == 4

        result = get_product_rankings(conn, "sycm")
        assert len(result) == 4
        assert result[0]["rank"] == 1
        assert result[0]["product_name"] == "Songmont Hobo包"
        assert result[0]["brand"] == "Songmont"
        assert result[0]["sales_metric_value"] == 98543.0
        conn.close()

    def test_get_rankings_latest_date(self, tmp_path):
        """get_product_rankings with no date returns most recent."""
        db = str(tmp_path / "test.db")
        conn = init_db(db)

        # Insert old data
        save_product_rankings(
            conn, "sycm", "2026-03-21", "箱包", "交易指数",
            [{"rank": 1, "product_name": "Old", "brand": "A", "price": "¥100", "transaction_index": 100}],
        )
        # Insert new data
        save_product_rankings(
            conn, "sycm", "2026-03-28", "箱包", "交易指数",
            [{"rank": 1, "product_name": "New", "brand": "B", "price": "¥200", "transaction_index": 200}],
        )

        result = get_product_rankings(conn, "sycm")
        assert len(result) == 1
        assert result[0]["product_name"] == "New"
        conn.close()

    def test_get_rankings_specific_date(self, tmp_path):
        """get_product_rankings with specific date returns only that date."""
        db = str(tmp_path / "test.db")
        conn = init_db(db)

        save_product_rankings(
            conn, "sycm", "2026-03-21", "箱包", "交易指数",
            [{"rank": 1, "product_name": "Old", "brand": "A", "price": "¥100", "transaction_index": 100}],
        )
        save_product_rankings(
            conn, "sycm", "2026-03-28", "箱包", "交易指数",
            [{"rank": 1, "product_name": "New", "brand": "B", "price": "¥200", "transaction_index": 200}],
        )

        result = get_product_rankings(conn, "sycm", extract_date="2026-03-21")
        assert len(result) == 1
        assert result[0]["product_name"] == "Old"
        conn.close()

    def test_get_rankings_empty(self, tmp_path):
        """No rankings returns empty list."""
        db = str(tmp_path / "test.db")
        conn = init_db(db)
        result = get_product_rankings(conn, "sycm")
        assert result == []
        conn.close()

    def test_ranking_history(self, tmp_path):
        """get_ranking_history returns filtered results for a brand."""
        db = str(tmp_path / "test.db")
        conn = init_db(db)

        save_product_rankings(
            conn, "sycm", "2026-03-21", "箱包", "交易指数",
            [
                {"rank": 1, "product_name": "Songmont A", "brand": "Songmont", "price": "¥899", "transaction_index": 98000},
                {"rank": 2, "product_name": "CASSILE B", "brand": "CASSILE", "price": "¥599", "transaction_index": 87000},
            ],
        )
        save_product_rankings(
            conn, "sycm", "2026-03-28", "箱包", "交易指数",
            [
                {"rank": 1, "product_name": "CASSILE B", "brand": "CASSILE", "price": "¥599", "transaction_index": 99000},
                {"rank": 2, "product_name": "Songmont A", "brand": "Songmont", "price": "¥899", "transaction_index": 95000},
            ],
        )

        history = get_ranking_history(conn, "Songmont", "sycm", days=30)
        assert len(history) == 2
        # First entry: rank 1 on 03-21
        assert history[0][0] == "2026-03-21"
        assert history[0][1] == 1
        # Second entry: rank 2 on 03-28
        assert history[1][0] == "2026-03-28"
        assert history[1][1] == 2
        conn.close()

    def test_douyin_sales_channel(self, tmp_path):
        """Douyin products should store sales_channel."""
        db = str(tmp_path / "test.db")
        conn = init_db(db)

        save_product_rankings(
            conn, "douyin_shop", "2026-03-28", "女包", "销售额",
            [{"rank": 1, "product_name": "Test", "brand": "Test", "price": "¥299",
              "sales_volume": 5000, "sales_channel": "直播"}],
        )

        result = get_product_rankings(conn, "douyin_shop")
        assert result[0]["sales_channel"] == "livestream"
        conn.close()


# ─── Data Type Detection ──────────────────────────────────────────────────────


class TestDataTypeDetection:
    """Test _detect_data_type() to route ranking vs brand extracts."""

    def test_detects_sycm_ranking(self):
        data = json.dumps({"source": "sycm", "products": []})
        assert _detect_data_type(data) == "ranking"

    def test_detects_douyin_ranking(self):
        data = json.dumps({"source": "douyin_shop", "products": []})
        assert _detect_data_type(data) == "ranking"

    def test_detects_brand_extract(self):
        data = json.dumps([{"brand_name": "小CK", "platform": "xhs"}])
        assert _detect_data_type(data) == "brand_extract"

    def test_invalid_json_defaults_to_brand(self):
        assert _detect_data_type("not json") == "brand_extract"


# ─── Brand Frequency ──────────────────────────────────────────────────────────


class TestBrandFrequency:
    """Test _compute_brand_frequency()."""

    def test_counts_brands(self):
        products = [
            {"brand": "Songmont"}, {"brand": "Songmont"}, {"brand": "Songmont"},
            {"brand": "CASSILE"}, {"brand": "CASSILE"},
            {"brand": "裘真"},
        ]
        freq = _compute_brand_frequency(products)
        assert freq["Songmont"] == 3
        assert freq["CASSILE"] == 2
        assert freq["裘真"] == 1
        # Should be sorted by count desc
        brands = list(freq.keys())
        assert brands[0] == "Songmont"

    def test_skips_empty_brand(self):
        products = [{"brand": ""}, {"brand": "A"}, {}]
        freq = _compute_brand_frequency(products)
        assert "" not in freq
        assert freq == {"A": 1}


# ─── Full Ranking Import Pipeline ─────────────────────────────────────────────


class TestRankingImportPipeline:
    """Test import_rankings() end-to-end."""

    def _sample_sycm_json(self):
        return json.dumps({
            "source": "sycm",
            "extract_date": "2026-03-28",
            "category_path": "箱包皮具 > 女士包",
            "time_range": "最近7天",
            "ranking_type": "交易指数",
            "total_extracted": 3,
            "pages_navigated": 1,
            "products": [
                {"rank": 1, "product_name": "Songmont Hobo", "brand": "Songmont", "price": "¥899", "transaction_index": 98543},
                {"rank": 2, "product_name": "CASSILE 菜篮", "brand": "CASSILE", "price": "¥599", "transaction_index": 87654},
                {"rank": 3, "product_name": "裘真 Hobo", "brand": "裘真", "price": "¥459", "transaction_index": 76543},
            ],
        }, ensure_ascii=False)

    def _sample_douyin_json(self):
        return json.dumps({
            "source": "douyin_shop",
            "extract_date": "2026-03-28",
            "category_path": "箱包 > 女包",
            "time_range": "最近7天",
            "ranking_type": "销售额",
            "total_extracted": 2,
            "pages_navigated": 1,
            "products": [
                {"rank": 1, "product_name": "ECODAY编织包", "brand": "ECODAY", "price": "¥299", "sales_volume": "5.2万", "sales_revenue": "1500万", "sales_channel": "直播"},
                {"rank": 2, "product_name": "裘真托特包", "brand": "裘真", "price": "¥459", "sales_volume": "1.2万", "sales_channel": "达人带货"},
            ],
        }, ensure_ascii=False)

    def test_sycm_import(self, tmp_path):
        fpath = tmp_path / "sycm.json"
        db = str(tmp_path / "test.db")
        fpath.write_text(self._sample_sycm_json(), encoding="utf-8")

        success, message = import_rankings(files=[str(fpath)], db_path=db)
        assert success, message
        assert "3 products" in message
        assert "sycm" in message
        assert "Songmont" in message  # Top brand

        conn = init_db(db)
        result = get_product_rankings(conn, "sycm")
        assert len(result) == 3
        conn.close()

    def test_douyin_import(self, tmp_path):
        fpath = tmp_path / "douyin.json"
        db = str(tmp_path / "test.db")
        fpath.write_text(self._sample_douyin_json(), encoding="utf-8")

        success, message = import_rankings(files=[str(fpath)], db_path=db)
        assert success, message
        assert "2 products" in message
        assert "douyin_shop" in message

    def test_dry_run(self, tmp_path):
        fpath = tmp_path / "sycm.json"
        db = str(tmp_path / "test.db")
        fpath.write_text(self._sample_sycm_json(), encoding="utf-8")

        success, message = import_rankings(files=[str(fpath)], db_path=db, dry_run=True)
        assert success
        assert "Dry run" in message
        assert not (tmp_path / "test.db").exists()

    def test_stdin_import(self, tmp_path):
        db = str(tmp_path / "test.db")
        success, message = import_rankings(
            files=[], stdin_text=self._sample_sycm_json(), db_path=db,
        )
        assert success, message

    def test_validation_blocks_import(self, tmp_path):
        fpath = tmp_path / "bad.json"
        db = str(tmp_path / "test.db")
        fpath.write_text(json.dumps({
            "source": "sycm",
            "extract_date": "2026-03-28",
            # Missing category_path and products
        }), encoding="utf-8")

        success, message = import_rankings(files=[str(fpath)], db_path=db)
        assert not success
        assert "Validation failed" in message

    def test_chinese_numbers_normalized(self, tmp_path):
        """Chinese numbers in sales fields should be converted."""
        fpath = tmp_path / "dy.json"
        db = str(tmp_path / "test.db")
        fpath.write_text(self._sample_douyin_json(), encoding="utf-8")

        success, message = import_rankings(files=[str(fpath)], db_path=db)
        assert success

        conn = init_db(db)
        result = get_product_rankings(conn, "douyin_shop")
        # "5.2万" should become 52000, and sales_revenue "1500万" = 15000000
        # The import uses sales_revenue as primary metric for douyin
        assert result[0]["sales_metric_name"] == "sales_revenue"
        assert result[0]["sales_metric_value"] == 15000000.0
        conn.close()

    def test_validate_and_normalize_ranking_valid(self):
        """Test the combined validate_and_normalize_ranking function."""
        text = json.dumps({
            "source": "sycm",
            "extract_date": "2026-03-28",
            "category_path": "箱包",
            "total_extracted": 1,
            "products": [{"rank": 1, "product_name": "Test", "brand": "A", "price": "¥100", "transaction_index": "1.5万"}],
        })
        data, errors = validate_and_normalize_ranking(text)
        assert errors == []
        assert data["products"][0]["transaction_index"] == 15000

    def test_validate_and_normalize_ranking_fenced(self):
        """Fenced JSON should be handled."""
        inner = json.dumps({
            "source": "sycm",
            "extract_date": "2026-03-28",
            "category_path": "箱包",
            "total_extracted": 1,
            "products": [{"rank": 1, "product_name": "Test", "brand": "A", "price": "¥100"}],
        })
        text = "```json\n" + inner + "\n```"
        data, errors = validate_and_normalize_ranking(text)
        assert errors == []
