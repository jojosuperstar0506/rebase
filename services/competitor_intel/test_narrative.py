"""
Tests for narrative.py — Claude Narrative Layer.

All tests pass WITHOUT an ANTHROPIC_API_KEY set.
API calls are mocked; only prompt construction, cost estimation,
JSON parsing, storage round-trips, and dry-run mode are tested.
"""

import json
import os
import sqlite3
import sys
import tempfile
import unittest
from datetime import datetime
from unittest.mock import MagicMock, patch

from . import narrative as narrative_mod
from .narrative import (
    _BRAND_SYSTEM_PROMPT,
    _STRATEGIC_SYSTEM_PROMPT,
    _ACTION_ITEMS_SYSTEM_PROMPT,
    _build_brand_user_prompt,
    _build_strategic_user_prompt,
    _build_action_items_user_prompt,
    _safe_json_parse,
    _estimate_tokens,
    _call_claude,
    estimate_cost,
    generate_brand_narrative,
    generate_strategic_summary,
    generate_action_items,
    run_dry_run,
    NARRATIVE_MODEL,
    STRATEGY_MODEL,
)
from .storage import (
    init_db,
    save_narrative,
    save_scores,
    get_latest_narratives,
    get_narrative_history,
)


# ─── Sample Data ────────────────────────────────────────────────────────────


def _sample_score_data(brand_name="Songmont"):
    """Return a realistic score data dict for testing."""
    return {
        "brand_name": brand_name,
        "momentum_score": 82,
        "threat_index": 65,
        "data_completeness": 0.75,
        "score_breakdown": {
            "xhs_follower_growth": {
                "raw": 0.18,
                "normalized": 85,
                "weight": 0.20,
            },
            "engagement_trend": {
                "raw": 0.05,
                "normalized": 60,
                "weight": 0.20,
            },
        },
        "gtm_signals": [
            {
                "signal": "AWARENESS_PLAY",
                "detail": "XHS followers +18% vs month avg 3%",
                "severity": "high",
            }
        ],
        "threat_breakdown": {
            "price_overlap": {
                "score": 80,
                "detail": "300-500元价格带直接竞争",
            },
        },
    }


def _sample_anomalies(brand_name="Songmont"):
    """Return sample anomaly list."""
    return [
        {
            "brand_name": brand_name,
            "metric_name": "xhs_followers",
            "z_score": 2.5,
            "direction": "spike",
            "severity": "medium",
        },
        {
            "brand_name": "小CK",
            "metric_name": "douyin_likes",
            "z_score": -2.1,
            "direction": "drop",
            "severity": "medium",
        },
    ]


def _sample_all_scores():
    """Return a list of score dicts for multiple brands."""
    brands = ["Songmont", "小CK", "裘真", "CASSILE", "Dissona"]
    scores = []
    for i, b in enumerate(brands):
        s = _sample_score_data(b)
        s["momentum_score"] = 82 - i * 10
        s["threat_index"] = 65 - i * 8
        if i > 0:
            s["gtm_signals"] = []
        scores.append(s)
    return scores


# ─── Test: estimate_cost ────────────────────────────────────────────────────


class TestEstimateCost(unittest.TestCase):
    """Test cost estimation with known values."""

    def test_haiku_cost(self):
        """Haiku: $1/MTok input, $5/MTok output."""
        cost = estimate_cost("claude-haiku-4-5-20251001", 1_000_000, 1_000_000)
        self.assertAlmostEqual(cost, 6.0)

    def test_haiku_small(self):
        """100 input + 50 output tokens on Haiku."""
        cost = estimate_cost("claude-haiku-4-5-20251001", 100, 50)
        expected = (100 / 1_000_000 * 1.0) + (50 / 1_000_000 * 5.0)
        self.assertAlmostEqual(cost, round(expected, 6))

    def test_sonnet_cost(self):
        """Sonnet: $3/MTok input, $15/MTok output."""
        cost = estimate_cost("claude-sonnet-4-6-20250514", 1_000_000, 1_000_000)
        self.assertAlmostEqual(cost, 18.0)

    def test_opus_cost(self):
        """Opus: $5/MTok input, $25/MTok output."""
        cost = estimate_cost("claude-opus-4-6-20250514", 1_000_000, 1_000_000)
        self.assertAlmostEqual(cost, 30.0)

    def test_zero_tokens(self):
        """Zero tokens should cost nothing."""
        self.assertEqual(estimate_cost("claude-haiku-4-5-20251001", 0, 0), 0.0)

    def test_unknown_model_fallback(self):
        """Unknown model falls back to Sonnet pricing."""
        cost = estimate_cost("claude-unknown-9000", 1_000_000, 1_000_000)
        self.assertAlmostEqual(cost, 18.0)  # sonnet pricing

    def test_model_prefix_matching(self):
        """Model name with different date suffix should still match."""
        cost = estimate_cost("claude-haiku-4-5-20260101", 1_000_000, 0)
        self.assertAlmostEqual(cost, 1.0)

    def test_returns_float(self):
        """Cost should always be a float."""
        cost = estimate_cost("claude-haiku-4-5-20251001", 500, 200)
        self.assertIsInstance(cost, float)


# ─── Test: Prompt Construction ──────────────────────────────────────────────


class TestPromptConstruction(unittest.TestCase):
    """Test that system and user prompts are well-formed."""

    def test_brand_system_prompt_is_chinese(self):
        """System prompt must be in Chinese."""
        self.assertIn("OMI箱包", _BRAND_SYSTEM_PROMPT)
        self.assertIn("竞争情报分析师", _BRAND_SYSTEM_PROMPT)

    def test_strategic_system_prompt_is_chinese(self):
        self.assertIn("OMI箱包", _STRATEGIC_SYSTEM_PROMPT)
        self.assertIn("首席战略顾问", _STRATEGIC_SYSTEM_PROMPT)

    def test_action_items_system_prompt_requests_json(self):
        self.assertIn("JSON", _ACTION_ITEMS_SYSTEM_PROMPT)
        self.assertIn("行动项", _ACTION_ITEMS_SYSTEM_PROMPT)

    def test_brand_user_prompt_structure(self):
        """User prompt has all required sections."""
        with patch.object(narrative_mod, "get_brand_by_name", return_value={
            "name": "Songmont", "name_en": "Songmont",
            "group": "A", "group_name": "Direct Competitors",
        }):
            score = _sample_score_data()
            anomalies = _sample_anomalies()
            prompt = _build_brand_user_prompt("Songmont", score, anomalies)

        self.assertIn("品牌: Songmont", prompt)
        self.assertIn("战略分组: A", prompt)
        self.assertIn("动量评分: 82/100", prompt)
        self.assertIn("威胁指数: 65/100", prompt)
        self.assertIn("评分明细:", prompt)
        self.assertIn("活跃GTM信号:", prompt)
        self.assertIn("异常指标:", prompt)
        self.assertIn("请分析此品牌本周表现及对OMI的影响", prompt)

    def test_brand_prompt_includes_gtm_signals(self):
        with patch.object(narrative_mod, "get_brand_by_name", return_value={
            "name": "Songmont", "name_en": "Songmont",
            "group": "A", "group_name": "Direct",
        }):
            score = _sample_score_data()
            prompt = _build_brand_user_prompt("Songmont", score, [])
        self.assertIn("AWARENESS_PLAY", prompt)

    def test_brand_prompt_no_anomalies(self):
        """When no anomalies, prompt says 无异常."""
        with patch.object(narrative_mod, "get_brand_by_name", return_value={
            "name": "Songmont", "name_en": "Songmont",
            "group": "A", "group_name": "Direct",
        }):
            score = _sample_score_data()
            prompt = _build_brand_user_prompt("Songmont", score, [])
        self.assertIn("无异常", prompt)

    def test_brand_prompt_no_gtm(self):
        """When no GTM signals, prompt says 无."""
        with patch.object(narrative_mod, "get_brand_by_name", return_value={
            "name": "小CK", "name_en": "Charles & Keith",
            "group": "D", "group_name": "International",
        }):
            score = _sample_score_data("小CK")
            score["gtm_signals"] = []
            prompt = _build_brand_user_prompt("小CK", score, [])
        self.assertIn("无\n", prompt)

    def test_strategic_user_prompt_structure(self):
        """Strategic prompt has momentum and threat rankings."""
        scores = _sample_all_scores()
        anomalies = _sample_anomalies()
        prompt = _build_strategic_user_prompt(scores, anomalies)

        self.assertIn("品牌动量排行:", prompt)
        self.assertIn("OMI威胁排行:", prompt)
        self.assertIn("本周异常:", prompt)
        self.assertIn("活跃GTM信号:", prompt)
        self.assertIn("请撰写本周竞争态势概览", prompt)

    def test_action_items_user_prompt_structure(self):
        """Action items prompt reuses strategic data with different ask."""
        scores = _sample_all_scores()
        anomalies = _sample_anomalies()
        prompt = _build_action_items_user_prompt(scores, anomalies)

        self.assertIn("品牌动量排行:", prompt)
        self.assertIn("请生成5-7个优先行动项", prompt)
        self.assertNotIn("请撰写本周竞争态势概览", prompt)

    def test_brand_prompt_missing_brand_info(self):
        """When brand not in config, falls back gracefully."""
        with patch.object(narrative_mod, "get_brand_by_name", return_value=None):
            score = _sample_score_data("Unknown Brand")
            prompt = _build_brand_user_prompt("Unknown Brand", score, [])
        self.assertIn("品牌: Unknown Brand (Unknown Brand)", prompt)
        self.assertIn("战略分组: ? — ?", prompt)


# ─── Test: JSON Parsing ─────────────────────────────────────────────────────


class TestSafeJsonParse(unittest.TestCase):
    """Test _safe_json_parse with various inputs."""

    def test_valid_json_array(self):
        """Clean JSON array parses correctly."""
        text = '[{"action": "调研", "department": "市场部", "urgency": "本周", "rationale": "数据显示"}]'
        result = _safe_json_parse(text)
        self.assertIsNotNone(result)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["action"], "调研")

    def test_json_with_code_fences(self):
        """JSON wrapped in markdown code fences."""
        text = '```json\n[{"action": "test", "department": "电商部"}]\n```'
        result = _safe_json_parse(text)
        self.assertIsNotNone(result)
        self.assertEqual(result[0]["action"], "test")

    def test_json_with_plain_fences(self):
        """JSON wrapped in plain code fences (no language marker)."""
        text = '```\n[{"action": "test"}]\n```'
        result = _safe_json_parse(text)
        self.assertIsNotNone(result)

    def test_complete_garbage(self):
        """Non-JSON text returns None."""
        result = _safe_json_parse("这不是JSON,只是普通文字。")
        self.assertIsNone(result)

    def test_empty_string(self):
        result = _safe_json_parse("")
        self.assertIsNone(result)

    def test_none_input(self):
        result = _safe_json_parse(None)
        self.assertIsNone(result)

    def test_single_object_wrapped_in_list(self):
        """A single JSON object gets wrapped in a list."""
        text = '{"action": "test", "department": "品牌部"}'
        result = _safe_json_parse(text)
        self.assertIsNotNone(result)
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 1)

    def test_json_with_trailing_text(self):
        """JSON array followed by explanation text."""
        text = '[{"action": "测试"}]\n\n以上是本周的行动建议。'
        result = _safe_json_parse(text)
        self.assertIsNotNone(result)
        self.assertEqual(result[0]["action"], "测试")

    def test_multiple_items(self):
        """Multiple action items parse correctly."""
        items = [
            {"action": "A", "department": "市场部", "urgency": "本周", "rationale": "R1"},
            {"action": "B", "department": "电商部", "urgency": "本月", "rationale": "R2"},
            {"action": "C", "department": "内容部", "urgency": "本季度", "rationale": "R3"},
        ]
        result = _safe_json_parse(json.dumps(items, ensure_ascii=False))
        self.assertEqual(len(result), 3)


# ─── Test: Token Estimation ─────────────────────────────────────────────────


class TestTokenEstimation(unittest.TestCase):
    """Test rough token estimation."""

    def test_chinese_text(self):
        """CJK characters count ~1.5 tokens each."""
        tokens = _estimate_tokens("你好世界")  # 4 chars
        self.assertGreater(tokens, 0)
        self.assertEqual(tokens, 6)  # 4 * 1.5

    def test_english_text(self):
        """English words count ~0.75 tokens each."""
        tokens = _estimate_tokens("hello world")
        self.assertGreater(tokens, 0)

    def test_empty(self):
        self.assertEqual(_estimate_tokens(""), 0)

    def test_mixed_text(self):
        """Mixed Chinese/English text."""
        tokens = _estimate_tokens("OMI箱包competitive intel")
        self.assertGreater(tokens, 0)


# ─── Test: Storage Round-Trip ───────────────────────────────────────────────


class TestNarrativeStorage(unittest.TestCase):
    """Test save_narrative / get_latest_narratives / get_narrative_history."""

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.db_path = self.tmp.name
        self.tmp.close()
        self.conn = init_db(self.db_path)

    def tearDown(self):
        self.conn.close()
        os.unlink(self.db_path)

    def test_save_and_get_brand_narrative(self):
        """Save a brand narrative and retrieve it."""
        save_narrative(
            self.conn, "2026-03-28", "brand",
            "Songmont势头强劲,动量82分。",
            brand_name="Songmont", model_used="claude-haiku-4-5-20251001",
            input_tokens=500, output_tokens=100, cost_estimate=0.001,
        )
        results = get_latest_narratives(self.conn, "brand")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["brand_name"], "Songmont")
        self.assertEqual(results[0]["content"], "Songmont势头强劲,动量82分。")
        self.assertEqual(results[0]["model_used"], "claude-haiku-4-5-20251001")

    def test_save_strategic_summary(self):
        """Save and retrieve strategic summary."""
        save_narrative(
            self.conn, "2026-03-28", "strategic_summary",
            "本周市场格局有明显变化...",
            model_used="claude-sonnet-4-6-20250514",
            input_tokens=2000, output_tokens=1500,
        )
        results = get_latest_narratives(self.conn, "strategic_summary")
        self.assertEqual(len(results), 1)
        self.assertIsNone(results[0]["brand_name"])
        self.assertIn("市场格局", results[0]["content"])

    def test_save_action_items(self):
        """Save and retrieve action items."""
        items = json.dumps([{"action": "test"}], ensure_ascii=False)
        save_narrative(
            self.conn, "2026-03-28", "action_items", items,
            model_used="claude-sonnet-4-6-20250514",
        )
        results = get_latest_narratives(self.conn, "action_items")
        self.assertEqual(len(results), 1)
        parsed = json.loads(results[0]["content"])
        self.assertEqual(parsed[0]["action"], "test")

    def test_upsert_replaces_existing(self):
        """Saving same date+type+brand replaces the old one."""
        save_narrative(self.conn, "2026-03-28", "brand", "v1", brand_name="Songmont")
        save_narrative(self.conn, "2026-03-28", "brand", "v2", brand_name="Songmont")
        results = get_latest_narratives(self.conn, "brand")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["content"], "v2")

    def test_get_latest_no_filter(self):
        """Get all narrative types for latest date."""
        save_narrative(self.conn, "2026-03-28", "brand", "b1", brand_name="Songmont")
        save_narrative(self.conn, "2026-03-28", "strategic_summary", "s1")
        save_narrative(self.conn, "2026-03-28", "action_items", "a1")
        results = get_latest_narratives(self.conn)
        self.assertEqual(len(results), 3)

    def test_get_latest_returns_newest_date(self):
        """When multiple dates exist, returns only the latest."""
        save_narrative(self.conn, "2026-03-20", "brand", "old", brand_name="Songmont")
        save_narrative(self.conn, "2026-03-28", "brand", "new", brand_name="Songmont")
        results = get_latest_narratives(self.conn, "brand")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["content"], "new")

    def test_narrative_history(self):
        """Get narrative history over time."""
        save_narrative(self.conn, "2026-03-20", "brand", "week1", brand_name="Songmont")
        save_narrative(self.conn, "2026-03-28", "brand", "week2", brand_name="Songmont")
        history = get_narrative_history(self.conn, brand_name="Songmont", narrative_type="brand")
        self.assertEqual(len(history), 2)
        # Should be ordered by date ascending
        self.assertEqual(history[0]["content"], "week1")
        self.assertEqual(history[1]["content"], "week2")

    def test_narrative_history_empty(self):
        """Empty history returns empty list."""
        history = get_narrative_history(self.conn, brand_name="Nonexistent")
        self.assertEqual(history, [])

    def test_get_latest_empty_db(self):
        """No narratives returns empty list."""
        results = get_latest_narratives(self.conn)
        self.assertEqual(results, [])


# ─── Test: Retry Logic ──────────────────────────────────────────────────────


class TestRetryLogic(unittest.TestCase):
    """Test retry behavior with mocked API calls."""

    def test_retry_on_rate_limit(self):
        """Retries on RateLimitError with exponential backoff."""
        # Create mock exception types
        RateLimitError = type("RateLimitError", (Exception,), {})
        InternalServerError = type("InternalServerError", (Exception,), {})
        APIError = type("APIError", (Exception,), {})

        # Create mock anthropic module
        mock_anthropic = MagicMock()
        mock_anthropic.RateLimitError = RateLimitError
        mock_anthropic.InternalServerError = InternalServerError
        mock_anthropic.APIError = APIError

        # Create mock client and response
        mock_client = MagicMock()
        mock_anthropic.Anthropic.return_value = mock_client

        mock_response = MagicMock()
        mock_response.usage.input_tokens = 100
        mock_response.usage.output_tokens = 50
        mock_response.content = [MagicMock(text="test response")]

        # First call: rate limit, second: success
        mock_client.messages.create.side_effect = [
            RateLimitError(),
            mock_response,
        ]

        with patch.dict(sys.modules, {"anthropic": mock_anthropic}), \
             patch.object(narrative_mod.time, "sleep") as mock_sleep:
            result = _call_claude("system", "user", "claude-haiku-4-5-20251001")

        self.assertEqual(result["content"], "test response")
        mock_sleep.assert_called_once_with(2)  # First retry delay

    def test_retry_exhausted_raises(self):
        """After 3 retries, raises the error."""
        RateLimitError = type("RateLimitError", (Exception,), {})
        InternalServerError = type("InternalServerError", (Exception,), {})
        APIError = type("APIError", (Exception,), {})

        mock_anthropic = MagicMock()
        mock_anthropic.RateLimitError = RateLimitError
        mock_anthropic.InternalServerError = InternalServerError
        mock_anthropic.APIError = APIError

        mock_client = MagicMock()
        mock_anthropic.Anthropic.return_value = mock_client

        # All 4 attempts fail
        mock_client.messages.create.side_effect = RateLimitError()

        with patch.dict(sys.modules, {"anthropic": mock_anthropic}), \
             patch.object(narrative_mod.time, "sleep") as mock_sleep:
            with self.assertRaises(RateLimitError):
                _call_claude("system", "user", "claude-haiku-4-5-20251001")

        # Should have slept 3 times: 2s, 4s, 8s
        self.assertEqual(mock_sleep.call_count, 3)

    def test_retry_delay_values(self):
        """Verify the exponential backoff delays are 2, 4, 8 seconds."""
        import inspect
        source = inspect.getsource(_call_claude)
        self.assertIn("[2, 4, 8]", source)


# ─── Test: Dry Run Mode ────────────────────────────────────────────────────


class TestDryRun(unittest.TestCase):
    """Test dry-run mode works without API key."""

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.db_path = self.tmp.name
        self.tmp.close()
        self.conn = init_db(self.db_path)

    def tearDown(self):
        self.conn.close()
        os.unlink(self.db_path)

    def test_dry_run_no_scores_returns_error(self):
        """Dry run with no scores returns error dict."""
        result = run_dry_run(db_path=self.db_path)
        self.assertEqual(result.get("error"), "no scores")

    def _insert_score(self, brand_name, date, momentum=50, threat=30, completeness=0.5):
        """Helper to insert a score row directly."""
        save_scores(
            self.conn, brand_name, date,
            momentum_score=momentum, threat_index=threat,
            gtm_signals=[], score_breakdown={},
            threat_breakdown={}, data_completeness=completeness,
        )

    def test_dry_run_with_scores(self):
        """Dry run with scores builds prompts and returns cost estimate."""
        self._insert_score("Songmont", "2026-03-28", momentum=82, threat=65, completeness=0.75)

        result = run_dry_run(db_path=self.db_path)
        self.assertNotIn("error", result)
        self.assertIn("brand_prompts", result)
        self.assertIn("strategic_prompt", result)
        self.assertIn("action_prompt", result)
        self.assertIn("estimated_cost", result)
        self.assertGreater(result["estimated_cost"], 0)

    def test_dry_run_no_api_calls(self):
        """Dry run should not call the anthropic client."""
        self._insert_score("TestBrand", "2026-03-28")

        # dry_run never imports anthropic, so this should work fine
        # We verify by ensuring no exception even without anthropic available
        result = run_dry_run(db_path=self.db_path)
        self.assertIn("brand_prompts", result)


# ─── Test: Model Configuration ──────────────────────────────────────────────


class TestModelConfig(unittest.TestCase):
    """Test model defaults and env var overrides."""

    def test_default_narrative_model(self):
        self.assertEqual(NARRATIVE_MODEL, os.environ.get("NARRATIVE_MODEL", "claude-haiku-4-5-20251001"))

    def test_default_strategy_model(self):
        self.assertEqual(STRATEGY_MODEL, os.environ.get("STRATEGY_MODEL", "claude-sonnet-4-6-20250514"))


# ─── Test: Generate Functions with Mock API ─────────────────────────────────


class TestGenerateFunctionsWithMock(unittest.TestCase):
    """Test generate_* functions with mocked Claude API."""

    def test_generate_brand_narrative_returns_result(self):
        """generate_brand_narrative returns proper dict structure."""
        mock_brand = {
            "name": "Songmont", "name_en": "Songmont",
            "group": "A", "group_name": "Direct",
        }
        mock_call_result = {
            "content": "Songmont本周表现强劲。",
            "model": "claude-haiku-4-5-20251001",
            "input_tokens": 300,
            "output_tokens": 80,
            "cost": 0.0007,
        }

        with patch.object(narrative_mod, "_call_claude", return_value=mock_call_result), \
             patch.object(narrative_mod, "get_brand_by_name", return_value=mock_brand):
            result = generate_brand_narrative("Songmont", _sample_score_data(), _sample_anomalies())

        self.assertEqual(result["brand_name"], "Songmont")
        self.assertIn("narrative", result)
        self.assertIn("cost", result)

    def test_generate_strategic_summary_returns_result(self):
        mock_call_result = {
            "content": "本周竞争态势概览...",
            "model": "claude-sonnet-4-6-20250514",
            "input_tokens": 2000,
            "output_tokens": 1000,
            "cost": 0.021,
        }

        with patch.object(narrative_mod, "_call_claude", return_value=mock_call_result):
            result = generate_strategic_summary(_sample_all_scores(), _sample_anomalies())

        self.assertIn("summary", result)
        self.assertIn("cost", result)

    def test_generate_action_items_valid_json(self):
        """Action items with valid JSON response."""
        items = [{"action": "调研竞品", "department": "市场部", "urgency": "本周", "rationale": "数据显示"}]
        mock_call_result = {
            "content": json.dumps(items, ensure_ascii=False),
            "model": "claude-sonnet-4-6-20250514",
            "input_tokens": 1500,
            "output_tokens": 600,
            "cost": 0.0135,
        }

        with patch.object(narrative_mod, "_call_claude", return_value=mock_call_result):
            result = generate_action_items(_sample_all_scores(), _sample_anomalies())

        self.assertEqual(len(result["action_items"]), 1)
        self.assertEqual(result["action_items"][0]["action"], "调研竞品")

    def test_generate_action_items_bad_json_fallback(self):
        """Action items with unparseable response returns fallback."""
        mock_call_result = {
            "content": "抱歉,我无法生成JSON格式的回答。",
            "model": "claude-sonnet-4-6-20250514",
            "input_tokens": 1500,
            "output_tokens": 50,
            "cost": 0.005,
        }

        with patch.object(narrative_mod, "_call_claude", return_value=mock_call_result):
            result = generate_action_items(_sample_all_scores(), _sample_anomalies())

        self.assertIsNotNone(result["action_items"])
        self.assertEqual(len(result["action_items"]), 1)
        self.assertEqual(result["action_items"][0]["department"], "unknown")


if __name__ == "__main__":
    unittest.main()
