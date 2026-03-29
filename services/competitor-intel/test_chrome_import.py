"""
Tests for Chrome-based data extraction pipeline.

Covers:
- Chinese number conversion
- JSON cleanup (code fences, trailing commas)
- Schema validation
- Merge logic (XHS-only, Douyin-only, both platforms)
- Full import pipeline (JSON → validate → merge → SQLite → verify)
- Piped/stdin input mode
"""

import json
import os
import sqlite3
import tempfile
from pathlib import Path

import pytest

from .chrome_schema import (
    clean_json_text,
    normalize_numbers_recursive,
    parse_chinese_number,
    parse_extract_json,
    validate_and_normalize,
    validate_extract,
)
from .import_chrome_extract import _merge_brand_data, import_extracts
from .storage import get_latest_snapshot, init_db


# ─── Chinese Number Conversion ────────────────────────────────────────────────


class TestChineseNumberConversion:
    """Test parse_chinese_number() with various formats."""

    def test_wan_integer(self):
        assert parse_chinese_number("15万") == 150000

    def test_wan_decimal(self):
        assert parse_chinese_number("15.2万") == 152000

    def test_yi_integer(self):
        assert parse_chinese_number("2亿") == 200000000

    def test_yi_decimal(self):
        assert parse_chinese_number("2.3亿") == 230000000

    def test_wan_with_trailing_text(self):
        assert parse_chinese_number("52.3万粉丝") == 523000

    def test_wan_small_decimal(self):
        assert parse_chinese_number("1.5万") == 15000

    def test_comma_separated(self):
        assert parse_chinese_number("1,234,567") == 1234567

    def test_chinese_comma_separated(self):
        assert parse_chinese_number("1，234") == 1234

    def test_plain_integer(self):
        assert parse_chinese_number("1234") == 1234

    def test_plain_float(self):
        assert parse_chinese_number("12.34") == 12.34

    def test_passthrough_int(self):
        assert parse_chinese_number(1234) == 1234

    def test_passthrough_float(self):
        assert parse_chinese_number(12.34) == 12.34

    def test_passthrough_non_numeric_string(self):
        assert parse_chinese_number("hello") == "hello"

    def test_empty_string(self):
        assert parse_chinese_number("") == ""

    def test_none_passthrough(self):
        assert parse_chinese_number(None) is None

    def test_yi_with_trailing_text(self):
        assert parse_chinese_number("2.3亿次播放") == 230000000

    def test_wan_exact_round(self):
        """10万 should be exactly 100000, not 100000.0."""
        result = parse_chinese_number("10万")
        assert result == 100000
        assert isinstance(result, int)


class TestNormalizeRecursive:
    """Test normalize_numbers_recursive() on nested structures."""

    def test_dict_with_chinese_numbers(self):
        data = {"followers": "15.2万", "likes": "2.3亿"}
        result = normalize_numbers_recursive(data)
        assert result == {"followers": 152000, "likes": 230000000}

    def test_nested_dict(self):
        data = {"d2_brand_voice": {"followers": "52.3万粉丝", "notes": 342}}
        result = normalize_numbers_recursive(data)
        assert result["d2_brand_voice"]["followers"] == 523000
        assert result["d2_brand_voice"]["notes"] == 342

    def test_list_in_dict(self):
        data = {"items": [{"count": "1.5万"}, {"count": "200"}]}
        result = normalize_numbers_recursive(data)
        assert result["items"][0]["count"] == 15000
        assert result["items"][1]["count"] == 200

    def test_non_numeric_strings_preserved(self):
        data = {"name": "小CK", "status": "verified"}
        result = normalize_numbers_recursive(data)
        assert result == data


# ─── JSON Cleanup ─────────────────────────────────────────────────────────────


class TestJsonCleanup:
    """Test clean_json_text() with common Chrome output issues."""

    def test_strips_code_fences(self):
        text = '```json\n[{"brand": "test"}]\n```'
        result = clean_json_text(text)
        assert result == '[{"brand": "test"}]'

    def test_strips_code_fences_no_lang(self):
        text = '```\n[{"brand": "test"}]\n```'
        result = clean_json_text(text)
        assert result == '[{"brand": "test"}]'

    def test_removes_trailing_commas(self):
        text = '{"a": 1, "b": 2, }'
        result = clean_json_text(text)
        # Trailing comma removed; exact whitespace may vary
        parsed = json.loads(result)
        assert parsed == {"a": 1, "b": 2}

    def test_removes_trailing_comma_in_array(self):
        text = '[1, 2, 3, ]'
        result = clean_json_text(text)
        parsed = json.loads(result)
        assert parsed == [1, 2, 3]

    def test_plain_json_passthrough(self):
        text = '[{"brand": "test"}]'
        result = clean_json_text(text)
        assert result == '[{"brand": "test"}]'

    def test_whitespace_stripped(self):
        text = '  \n  [{"a": 1}]  \n  '
        result = clean_json_text(text)
        assert result == '[{"a": 1}]'


class TestParseExtractJson:
    """Test parse_extract_json() end-to-end."""

    def test_parses_clean_array(self):
        text = '[{"brand_name": "test", "platform": "xhs"}]'
        result = parse_extract_json(text)
        assert len(result) == 1
        assert result[0]["brand_name"] == "test"

    def test_parses_fenced_json(self):
        text = '```json\n[{"brand_name": "test"}]\n```'
        result = parse_extract_json(text)
        assert len(result) == 1

    def test_wraps_single_dict_in_list(self):
        text = '{"brand_name": "test"}'
        result = parse_extract_json(text)
        assert isinstance(result, list)
        assert len(result) == 1

    def test_raises_on_invalid_json(self):
        with pytest.raises(ValueError, match="Invalid JSON"):
            parse_extract_json("this is not json")

    def test_raises_on_non_array(self):
        with pytest.raises(ValueError, match="Expected JSON array"):
            parse_extract_json('"just a string"')


# ─── Schema Validation ────────────────────────────────────────────────────────


class TestValidation:
    """Test validate_extract() schema checks."""

    def _make_xhs_extract(self, **overrides):
        """Helper to create a minimal valid XHS extract."""
        base = {
            "brand_name": "小CK",
            "brand_name_en": "Charles & Keith",
            "platform": "xhs",
            "extract_date": "2026-03-28",
            "d2_brand_voice": {
                "followers": 150000,
                "notes": 342,
                "likes": 890000,
            },
            "d1_search_index": {
                "search_suggestions": ["小CK包包", "小CK新款"],
            },
        }
        base.update(overrides)
        return base

    def _make_douyin_extract(self, **overrides):
        """Helper to create a minimal valid Douyin extract."""
        base = {
            "brand_name": "小CK",
            "brand_name_en": "Charles & Keith",
            "platform": "douyin",
            "extract_date": "2026-03-28",
            "d2_brand_voice": {
                "followers": 89000,
                "videos": 156,
                "likes": 1200000,
            },
            "d1_search_index": {
                "search_suggestions": ["小CK包包"],
            },
        }
        base.update(overrides)
        return base

    def test_valid_xhs_extract(self):
        errors = validate_extract([self._make_xhs_extract()])
        assert errors == []

    def test_valid_douyin_extract(self):
        errors = validate_extract([self._make_douyin_extract()])
        assert errors == []

    def test_missing_brand_name(self):
        data = self._make_xhs_extract()
        del data["brand_name"]
        errors = validate_extract([data])
        assert any("brand_name" in e for e in errors)

    def test_missing_platform(self):
        data = self._make_xhs_extract()
        del data["platform"]
        errors = validate_extract([data])
        assert any("platform" in e for e in errors)

    def test_invalid_platform(self):
        data = self._make_xhs_extract(platform="weibo")
        errors = validate_extract([data])
        assert any("'weibo'" in e for e in errors)

    def test_invalid_date_format(self):
        data = self._make_xhs_extract(extract_date="28/03/2026")
        errors = validate_extract([data])
        assert any("YYYY-MM-DD" in e for e in errors)

    def test_missing_d2_section(self):
        data = self._make_xhs_extract()
        del data["d2_brand_voice"]
        errors = validate_extract([data])
        assert any("d2_brand_voice" in e for e in errors)

    def test_missing_followers_in_d2(self):
        data = self._make_xhs_extract()
        del data["d2_brand_voice"]["followers"]
        errors = validate_extract([data])
        assert any("d2_brand_voice.followers" in e for e in errors)

    def test_missing_d1_section(self):
        data = self._make_xhs_extract()
        del data["d1_search_index"]
        errors = validate_extract([data])
        assert any("d1_search_index" in e for e in errors)

    def test_multiple_brands_mixed_valid_invalid(self):
        valid = self._make_xhs_extract(brand_name="Good")
        invalid = self._make_xhs_extract(brand_name="Bad")
        del invalid["d2_brand_voice"]
        errors = validate_extract([valid, invalid])
        assert len(errors) == 1
        assert "Bad" in errors[0]


# ─── Merge Logic ──────────────────────────────────────────────────────────────


class TestMergeLogic:
    """Test _merge_brand_data() with various input combinations."""

    def _xhs_data(self, brand="小CK"):
        return {
            "brand_name": brand,
            "brand_name_en": "Charles & Keith",
            "platform": "xhs",
            "extract_date": "2026-03-28",
            "d2_brand_voice": {
                "followers": 150000,
                "notes": 342,
                "likes": 890000,
                "account_name": "Charles & Keith官方",
                "account_id": "abc123",
                "verified": True,
            },
            "d1_search_index": {
                "search_suggestions": ["小CK包包", "小CK新款"],
                "related_searches": ["小CK平替"],
            },
            "d3_content_sample": {
                "top_notes": [
                    {"title": "百搭包包", "author": "小美", "likes": 5200, "comments": 340, "type": "image"},
                ],
            },
            "d6_consumer_sentiment": {
                "positive_themes": ["质感好", "百搭"],
                "negative_themes": ["偏重"],
                "ugc_samples": ["太百搭了"],
            },
        }

    def _douyin_data(self, brand="小CK"):
        return {
            "brand_name": brand,
            "brand_name_en": "Charles & Keith",
            "platform": "douyin",
            "extract_date": "2026-03-28",
            "d2_brand_voice": {
                "followers": 89000,
                "videos": 156,
                "likes": 1200000,
                "account_name": "CK旗舰店",
                "account_id": "dy123",
                "verified": True,
            },
            "d1_search_index": {
                "search_suggestions": ["小CK包包"],
                "trending_hashtags": {"#小CK": "2.3亿"},
            },
            "d4_kol_ecosystem": {
                "top_creators": [
                    {"name": "时尚小鱼", "followers": 520000},
                ],
            },
            "d5_social_commerce": {
                "shop_product_count": 45,
                "live_status": "not_live",
                "live_viewers": 0,
                "top_selling_products": [{"name": "链条包", "price": 499}],
            },
        }

    def test_xhs_only(self):
        """Brand with only XHS data should have Douyin fields zeroed."""
        merged = _merge_brand_data(
            xhs_extracts={"小CK": self._xhs_data()},
            douyin_extracts={},
        )
        assert "小CK" in merged
        brand = merged["小CK"]
        assert brand["d2_brand_voice_volume"]["xhs"]["followers"] == 150000
        assert brand["d2_brand_voice_volume"]["douyin"]["followers"] == 0
        assert brand["d6_consumer_mindshare"]["positive_keywords"] == ["质感好", "百搭"]

    def test_douyin_only(self):
        """Brand with only Douyin data should have XHS fields zeroed."""
        merged = _merge_brand_data(
            xhs_extracts={},
            douyin_extracts={"小CK": self._douyin_data()},
        )
        assert "小CK" in merged
        brand = merged["小CK"]
        assert brand["d2_brand_voice_volume"]["douyin"]["followers"] == 89000
        assert brand["d2_brand_voice_volume"]["xhs"]["followers"] == 0
        assert brand["d5_social_commerce"]["shop_product_count"] == 45

    def test_both_platforms(self):
        """Brand with both XHS + Douyin data should merge all fields."""
        merged = _merge_brand_data(
            xhs_extracts={"小CK": self._xhs_data()},
            douyin_extracts={"小CK": self._douyin_data()},
        )
        brand = merged["小CK"]
        # XHS fields
        assert brand["d2_brand_voice_volume"]["xhs"]["followers"] == 150000
        assert brand["d1_brand_search_index"]["xhs_suggestions"] == ["小CK包包", "小CK新款"]
        assert brand["d6_consumer_mindshare"]["positive_keywords"] == ["质感好", "百搭"]
        # Douyin fields
        assert brand["d2_brand_voice_volume"]["douyin"]["followers"] == 89000
        assert brand["d1_brand_search_index"]["douyin_trending"] == {"#小CK": "2.3亿"}
        assert brand["d5_social_commerce"]["shop_product_count"] == 45
        assert len(brand["d4_kol_ecosystem"]["douyin_creators"]) == 1

    def test_multiple_brands(self):
        """Different brands from different platforms should all appear."""
        merged = _merge_brand_data(
            xhs_extracts={"小CK": self._xhs_data("小CK")},
            douyin_extracts={"Songmont": self._douyin_data("Songmont")},
        )
        assert "小CK" in merged
        assert "Songmont" in merged

    def test_avg_engagement_computed(self):
        """Average engagement should be computed from top_notes."""
        merged = _merge_brand_data(
            xhs_extracts={"小CK": self._xhs_data()},
            douyin_extracts={},
        )
        brand = merged["小CK"]
        # top_notes has 1 note: likes=5200, comments=340 → avg=5540
        assert brand["d3_content_strategy"]["avg_engagement"] == 5540

    def test_scrape_date_uses_latest(self):
        """scrape_date should be the max of xhs and douyin dates."""
        xhs = self._xhs_data()
        xhs["extract_date"] = "2026-03-25"
        dy = self._douyin_data()
        dy["extract_date"] = "2026-03-28"
        merged = _merge_brand_data(
            xhs_extracts={"小CK": xhs},
            douyin_extracts={"小CK": dy},
        )
        assert merged["小CK"]["scrape_date"] == "2026-03-28"


# ─── Full Import Pipeline ────────────────────────────────────────────────────


class TestFullPipeline:
    """Test the complete import flow: JSON → validate → merge → SQLite."""

    def _sample_xhs_json(self):
        return json.dumps([{
            "brand_name": "CASSILE",
            "brand_name_en": "Cassile",
            "platform": "xhs",
            "extract_date": "2026-03-28",
            "d2_brand_voice": {
                "followers": "8.5万",
                "notes": 128,
                "likes": "32.1万",
            },
            "d1_search_index": {
                "search_suggestions": ["CASSILE包包", "CASSILE新款"],
                "related_searches": ["法式包包"],
            },
            "d3_content_sample": {
                "top_notes": [
                    {"title": "法式优雅", "author": "搭配师", "likes": 3200, "comments": 180, "type": "image"},
                ],
            },
            "d6_consumer_sentiment": {
                "positive_themes": ["设计好看", "质感不错"],
                "negative_themes": ["价格偏高"],
                "ugc_samples": ["设计真的很特别"],
            },
        }], ensure_ascii=False)

    def _sample_douyin_json(self):
        return json.dumps([{
            "brand_name": "CASSILE",
            "brand_name_en": "Cassile",
            "platform": "douyin",
            "extract_date": "2026-03-28",
            "d2_brand_voice": {
                "followers": "3.2万",
                "videos": 67,
                "likes": "15万",
            },
            "d1_search_index": {
                "search_suggestions": ["CASSILE"],
                "trending_hashtags": {"#CASSILE": "1200万"},
            },
            "d4_kol_ecosystem": {
                "top_creators": [
                    {"name": "包包达人", "followers": "25万"},
                ],
            },
            "d5_social_commerce": {
                "shop_product_count": 23,
                "live_status": "not_live",
                "live_viewers": 0,
                "top_selling_products": [{"name": "链条法棍包", "price": 599}],
            },
        }], ensure_ascii=False)

    def test_full_import_from_files(self, tmp_path):
        """Write sample JSON → import → verify data in SQLite."""
        xhs_file = tmp_path / "xhs.json"
        douyin_file = tmp_path / "douyin.json"
        db_file = tmp_path / "test.db"

        xhs_file.write_text(self._sample_xhs_json(), encoding="utf-8")
        douyin_file.write_text(self._sample_douyin_json(), encoding="utf-8")

        success, message = import_extracts(
            files=[str(xhs_file), str(douyin_file)],
            db_path=str(db_file),
        )
        assert success, f"Import failed: {message}"
        assert "1" in message  # 1 brand imported
        assert "XHS" in message
        assert "Douyin" in message

        # Verify in SQLite
        conn = init_db(str(db_file))
        snapshot = get_latest_snapshot(conn, "CASSILE")
        assert snapshot is not None
        assert snapshot["d2_brand_voice_volume"]["xhs"]["followers"] == 85000
        assert snapshot["d2_brand_voice_volume"]["douyin"]["followers"] == 32000
        assert snapshot["d5_social_commerce"]["shop_product_count"] == 23
        conn.close()

    def test_dry_run(self, tmp_path):
        """Dry run should validate but not create database."""
        xhs_file = tmp_path / "xhs.json"
        db_file = tmp_path / "test.db"

        xhs_file.write_text(self._sample_xhs_json(), encoding="utf-8")

        success, message = import_extracts(
            files=[str(xhs_file)],
            db_path=str(db_file),
            dry_run=True,
        )
        assert success
        assert "Dry run" in message
        # DB should not exist (dry run doesn't write)
        assert not db_file.exists()

    def test_stdin_import(self, tmp_path):
        """Simulate stdin import."""
        db_file = tmp_path / "test.db"

        success, message = import_extracts(
            files=[],
            stdin_text=self._sample_xhs_json(),
            stdin_platform="xhs",
            db_path=str(db_file),
        )
        assert success, f"Import failed: {message}"

        conn = init_db(str(db_file))
        snapshot = get_latest_snapshot(conn, "CASSILE")
        assert snapshot is not None
        assert snapshot["d2_brand_voice_volume"]["xhs"]["followers"] == 85000
        conn.close()

    def test_validation_failure_blocks_import(self, tmp_path):
        """Invalid JSON should block the entire import."""
        bad_file = tmp_path / "bad.json"
        db_file = tmp_path / "test.db"

        bad_file.write_text(json.dumps([{
            "brand_name": "Test",
            "platform": "xhs",
            "extract_date": "2026-03-28",
            # Missing d2_brand_voice and d1_search_index
        }]), encoding="utf-8")

        success, message = import_extracts(
            files=[str(bad_file)],
            db_path=str(db_file),
        )
        assert not success
        assert "Validation failed" in message

    def test_chinese_numbers_normalized_in_pipeline(self, tmp_path):
        """Chinese numbers in Chrome output should be converted before import."""
        xhs_file = tmp_path / "xhs.json"
        db_file = tmp_path / "test.db"

        # Use Chinese numbers like Chrome would output
        data = [{
            "brand_name": "CASSILE",
            "brand_name_en": "Cassile",
            "platform": "xhs",
            "extract_date": "2026-03-28",
            "d2_brand_voice": {
                "followers": "8.5万粉丝",
                "notes": "128",
                "likes": "32.1万",
            },
            "d1_search_index": {
                "search_suggestions": ["CASSILE包包"],
            },
        }]
        xhs_file.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

        success, message = import_extracts(
            files=[str(xhs_file)],
            db_path=str(db_file),
        )
        assert success

        conn = init_db(str(db_file))
        snapshot = get_latest_snapshot(conn, "CASSILE")
        assert snapshot["d2_brand_voice_volume"]["xhs"]["followers"] == 85000
        assert snapshot["d2_brand_voice_volume"]["xhs"]["likes"] == 321000
        conn.close()

    def test_fenced_json_import(self, tmp_path):
        """JSON wrapped in code fences should still import."""
        fenced_file = tmp_path / "fenced.json"
        db_file = tmp_path / "test.db"

        content = '```json\n' + self._sample_xhs_json() + '\n```'
        fenced_file.write_text(content, encoding="utf-8")

        success, message = import_extracts(
            files=[str(fenced_file)],
            db_path=str(db_file),
        )
        assert success, f"Import failed: {message}"

    def test_file_not_found(self):
        """Non-existent file should produce clear error."""
        success, message = import_extracts(files=["/nonexistent/file.json"])
        assert not success
        assert "File not found" in message
