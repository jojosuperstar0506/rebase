"""Tests for the WeChat Work delivery module (delivery.py).

Covers:
  - format_weekly_brief: all sections present, correct ordering
  - GTM signals: rendering and emoji mapping
  - No-data edge cases: empty DB, no signals, no action items
  - send_wechat_brief: ValueError without webhook URL
  - run_delivery: dry-run mode
  - Truncation for WeChat Work character limit
  - Cron hint output
"""

import json
import io
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

from . import delivery as delivery_mod
from . import storage as storage_mod


class _SeededDBMixin:
    """Mixin that creates a temporary DB with seed data for delivery tests."""

    def _seed_db(self):
        """Create a temp DB with scores and narratives. Caller must close."""
        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        conn = storage_mod.init_db(path)
        self._tmp_path = path

        # Save scores for 5 brands
        brands_data = [
            ("小CK", "2026-03-28", 61, 65, [
                {"signal": "PRODUCT_BLITZ", "detail": "35 new SKUs added"},
                {"signal": "VIRAL_MOMENT", "detail": "xhs_followers z=3.9"},
            ]),
            ("La Festin", "2026-03-28", 51, 53, [
                {"signal": "PRODUCT_BLITZ", "detail": "17 new SKUs"},
                {"signal": "AWARENESS_PLAY", "detail": "douyin_mentions up 1000%"},
                {"signal": "VIRAL_MOMENT", "detail": "xhs_notes z=-3.9"},
            ]),
            ("Songmont", "2026-03-28", 38, 65, [
                {"signal": "AWARENESS_PLAY", "detail": "douyin_mentions up 459%"},
                {"signal": "VIRAL_MOMENT", "detail": "douyin_followers z=3.9"},
            ]),
            ("CASSILE", "2026-03-28", 36, 50, [
                {"signal": "AWARENESS_PLAY", "detail": "douyin_mentions up 200%"},
            ]),
            ("裘真", "2026-03-28", 9, 32, []),
        ]
        for brand_name, date, momentum, threat, signals in brands_data:
            storage_mod.save_scores(
                conn, brand_name, date, momentum, threat,
                signals, {}, {}, 0.5,
            )

        # Save narratives
        action_items = [
            {
                "action": "针对裘真+112 SKU上新,梳理OMI产品矩阵",
                "department": "产品部",
                "urgency": "本周",
                "rationale": "裘真PRODUCT_BLITZ信号明确",
            },
            {
                "action": "加速抖音品牌自播间搭建",
                "department": "电商部",
                "urgency": "本周",
                "rationale": "抖音电商是当前竞品争夺焦点",
            },
            {
                "action": "小红书KOL合作升级",
                "department": "市场部",
                "urgency": "本月",
                "rationale": "Songmont在小红书内容质量上领先",
            },
        ]
        storage_mod.save_narrative(
            conn, "2026-03-28", "action_items",
            json.dumps(action_items, ensure_ascii=False),
            None, "seed-data", 0, 0, 0.0,
        )
        storage_mod.save_narrative(
            conn, "2026-03-28", "strategic_summary",
            "本周竞品格局整体呈现一超多强态势。",
            None, "seed-data", 0, 0, 0.0,
        )

        return conn


class TestFormatWeeklyBrief(_SeededDBMixin, unittest.TestCase):
    """Test the format_weekly_brief function."""

    def test_produces_valid_markdown_with_all_sections(self):
        conn = self._seed_db()
        with patch.object(delivery_mod, "init_db", return_value=conn):
            brief = delivery_mod.format_weekly_brief()

        self.assertIn("# 🔍 OMI 竞品周报", brief)
        self.assertIn("## ⚠️ 本周重要信号", brief)
        self.assertIn("## 📈 品牌动量 TOP 5", brief)
        self.assertIn("## 🎯 本周行动建议", brief)
        self.assertIn("## 📊 数据概况", brief)
        self.assertIn("📋 详细报告", brief)

    def test_top5_brands_correct_order(self):
        conn = self._seed_db()
        with patch.object(delivery_mod, "init_db", return_value=conn):
            brief = delivery_mod.format_weekly_brief()

        # Find the leaderboard table rows
        lines = brief.split("\n")
        table_rows = [
            l for l in lines
            if l.startswith("| ") and "排名" not in l and "----" not in l
        ]

        # First row should be 小CK (61), last should be 裘真 (9)
        self.assertIn("小CK", table_rows[0])
        self.assertIn("61", table_rows[0])
        self.assertIn("裘真", table_rows[4])

    def test_includes_gtm_signals(self):
        conn = self._seed_db()
        with patch.object(delivery_mod, "init_db", return_value=conn):
            brief = delivery_mod.format_weekly_brief()

        self.assertIn("PRODUCT_BLITZ", brief)
        self.assertIn("VIRAL_MOMENT", brief)
        self.assertIn("AWARENESS_PLAY", brief)
        self.assertIn("🚀", brief)
        self.assertIn("🔥", brief)
        self.assertIn("⭐", brief)

    def test_includes_action_items(self):
        conn = self._seed_db()
        with patch.object(delivery_mod, "init_db", return_value=conn):
            brief = delivery_mod.format_weekly_brief()

        self.assertIn("针对裘真+112 SKU上新", brief)
        self.assertIn("产品部", brief)
        self.assertIn("本周", brief)

    def test_includes_data_freshness(self):
        conn = self._seed_db()
        with patch.object(delivery_mod, "init_db", return_value=conn):
            brief = delivery_mod.format_weekly_brief()

        self.assertIn("品牌数据:", brief)
        self.assertIn("天猫TOP100:", brief)
        self.assertIn("抖音TOP100:", brief)
        self.assertIn("评分引擎:", brief)
        self.assertIn("叙事引擎:", brief)

    def test_empty_database_no_crash(self):
        """Empty DB (no scores) produces a sensible 'no data' message."""
        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        conn = storage_mod.init_db(path)
        with patch.object(delivery_mod, "init_db", return_value=conn):
            brief = delivery_mod.format_weekly_brief()

        self.assertIn("暂无评分数据", brief)
        self.assertIn("竞品周报", brief)
        conn.close()
        os.unlink(path)


class TestNoSignals(unittest.TestCase):
    """Test the no-signals case."""

    def test_no_signals_graceful(self):
        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        conn = storage_mod.init_db(path)
        storage_mod.save_scores(
            conn, "TestBrand", "2026-03-28", 50, 40,
            [], {}, {}, 0.5,
        )
        with patch.object(delivery_mod, "init_db", return_value=conn):
            brief = delivery_mod.format_weekly_brief()

        self.assertIn("本周无异常信号，市场整体平稳。", brief)
        conn.close()
        os.unlink(path)

    def test_no_action_items_graceful(self):
        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        conn = storage_mod.init_db(path)
        storage_mod.save_scores(
            conn, "TestBrand", "2026-03-28", 50, 40,
            [], {}, {}, 0.5,
        )
        with patch.object(delivery_mod, "init_db", return_value=conn):
            brief = delivery_mod.format_weekly_brief()

        self.assertIn("暂无行动建议", brief)
        conn.close()
        os.unlink(path)


class TestSignalEmojis(unittest.TestCase):
    """Test the signal emoji mapping."""

    def test_all_signal_types_have_emojis(self):
        expected = {
            "AGGRESSIVE_PRICING": "💰",
            "CHANNEL_EXPANSION": "📺",
            "PRODUCT_BLITZ": "🚀",
            "AWARENESS_PLAY": "⭐",
            "VIRAL_MOMENT": "🔥",
            "RANKING_SURGE": "📈",
        }
        self.assertEqual(delivery_mod.SIGNAL_EMOJIS, expected)

    def test_unknown_signal_uses_fallback(self):
        """Unknown signal types get a default emoji in the formatting."""
        fd, path = tempfile.mkstemp(suffix=".db")
        os.close(fd)
        conn = storage_mod.init_db(path)
        storage_mod.save_scores(
            conn, "TestBrand", "2026-03-28", 50, 40,
            [{"signal": "NEW_SIGNAL_TYPE", "detail": "test"}],
            {}, {}, 0.5,
        )
        with patch.object(delivery_mod, "init_db", return_value=conn):
            brief = delivery_mod.format_weekly_brief()

        self.assertIn("⚡", brief)
        self.assertIn("NEW_SIGNAL_TYPE", brief)
        conn.close()
        os.unlink(path)


class TestSendWechatBrief(unittest.TestCase):
    """Test the send_wechat_brief function."""

    def test_raises_without_webhook_url(self):
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("WECHAT_WORK_WEBHOOK", None)
            with self.assertRaises(ValueError) as ctx:
                delivery_mod.send_wechat_brief("test message")
            self.assertIn("No webhook URL", str(ctx.exception))

    def test_raises_with_empty_env(self):
        with patch.dict(os.environ, {"WECHAT_WORK_WEBHOOK": ""}):
            with self.assertRaises(ValueError):
                delivery_mod.send_wechat_brief("test message")


class TestRunDelivery(_SeededDBMixin, unittest.TestCase):
    """Test the run_delivery master function."""

    def test_dry_run_returns_message(self):
        conn = self._seed_db()
        with patch.object(delivery_mod, "init_db", return_value=conn):
            message = delivery_mod.run_delivery(dry_run=True)

        self.assertIsInstance(message, str)
        self.assertIn("竞品周报", message)
        self.assertIn("品牌动量 TOP 5", message)

    def test_dry_run_does_not_send(self):
        conn = self._seed_db()
        with patch.object(delivery_mod, "init_db", return_value=conn), \
             patch.object(delivery_mod, "send_wechat_brief") as mock_send:
            delivery_mod.run_delivery(dry_run=True)

        mock_send.assert_not_called()


class TestTruncation(_SeededDBMixin, unittest.TestCase):
    """Test message truncation for WeChat Work limits."""

    def test_brief_within_limit(self):
        conn = self._seed_db()
        with patch.object(delivery_mod, "init_db", return_value=conn):
            brief = delivery_mod.format_weekly_brief()

        self.assertLessEqual(len(brief), delivery_mod.WECHAT_MAX_LENGTH)

    def test_truncation_preserves_key_sections(self):
        """Even after truncation, the header and data sections survive."""
        long_message = "# 🔍 OMI 竞品周报\n\n## ⚠️ signals\n\n## 📈 top5\n\n"
        long_message += "## 🎯 本周行动建议\n" + ("x" * 5000) + "\n\n"
        long_message += "## 📊 数据概况\ndata here\n\n> 📋 详细报告: https://example.com"

        url = "https://example.com"
        result = delivery_mod._truncate_brief(long_message, url)

        self.assertIn("竞品周报", result)
        self.assertIn("数据概况", result)
        self.assertLessEqual(len(result), delivery_mod.WECHAT_MAX_LENGTH)


class TestCronHint(unittest.TestCase):
    """Test the cron hint output."""

    def test_cron_hint_prints(self):
        f = io.StringIO()
        with redirect_stdout(f):
            delivery_mod._print_cron_hint()

        output = f.getvalue()
        self.assertIn("crontab", output)
        self.assertIn("Monday", output)
        self.assertIn("9:00 AM", output)


if __name__ == "__main__":
    unittest.main()
