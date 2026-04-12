"""
Anthropic API-powered Brand Equity Analyzer for OMI Competitive Intelligence.

Takes raw scraped data and produces:
  1. Per-brand strategic analysis (7 dimensions)
  2. Cross-brand comparison insights
  3. Action items for OMI teams
  4. Updated dashboard HTML sections

Designed for Aliyun cloud deployment with Anthropic API.
"""

import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Anthropic API configuration
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")


class BrandEquityAnalyzer:
    """
    Uses Anthropic Claude API to analyze scraped competitor data
    and produce strategic insights in the 7-dimension framework.
    """

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or ANTHROPIC_API_KEY
        self.model = model or ANTHROPIC_MODEL
        self._client = None

    def _get_client(self):
        """Lazy-init Anthropic client."""
        if self._client is None:
            try:
                import anthropic
                self._client = anthropic.Anthropic(api_key=self.api_key)
            except ImportError:
                raise ImportError(
                    "anthropic package required. Install with: pip install anthropic"
                )
        return self._client

    async def analyze_brand(self, brand_data: dict) -> dict:
        """
        Analyze a single brand's scraped data and produce strategic insights.

        Args:
            brand_data: Merged 7-dimension data from orchestrator

        Returns:
            Enhanced brand_data with 'analysis' key containing insights
        """
        client = self._get_client()

        prompt = self._build_brand_analysis_prompt(brand_data)

        try:
            message = client.messages.create(
                model=self.model,
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )
            analysis_text = message.content[0].text

            # Parse structured analysis from response
            analysis = self._parse_analysis_response(analysis_text)
            brand_data["analysis"] = analysis
            brand_data["analysis_date"] = datetime.now().strftime("%Y-%m-%d")
            brand_data["analysis_model"] = self.model

        except Exception as e:
            logger.error(f"Anthropic analysis failed for {brand_data.get('brand_name')}: {e}")
            brand_data["analysis"] = {"error": str(e)}

        return brand_data

    async def analyze_all_brands(self, all_brands_data: dict) -> dict:
        """
        Analyze all brands and produce cross-brand comparison.

        Args:
            all_brands_data: Full output from orchestrator

        Returns:
            Enhanced data with per-brand analysis and cross-brand insights
        """
        brands = all_brands_data.get("brands", {})

        # Analyze each brand individually
        for brand_name, brand_data in brands.items():
            logger.info(f"Analyzing {brand_name}...")
            brands[brand_name] = await self.analyze_brand(brand_data)

        # Cross-brand comparison
        comparison = await self._cross_brand_analysis(brands)
        all_brands_data["cross_brand_analysis"] = comparison

        return all_brands_data

    async def generate_omi_action_items(self, all_brands_data: dict) -> List[dict]:
        """
        Generate specific action items for OMI teams based on competitor analysis.

        Returns list of action items with department, priority, and description.
        """
        client = self._get_client()

        prompt = self._build_action_items_prompt(all_brands_data)

        try:
            message = client.messages.create(
                model=self.model,
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )
            return self._parse_action_items(message.content[0].text)
        except Exception as e:
            logger.error(f"Action items generation failed: {e}")
            return []

    # ─── Prompt Builders ───────────────────────────────────────────────────

    def _build_brand_analysis_prompt(self, brand_data: dict) -> str:
        """Build prompt for single-brand strategic analysis."""
        brand_name = brand_data.get("brand_name", "Unknown")
        group = brand_data.get("group_name", "")
        badge = brand_data.get("badge", "")

        return f"""You are a senior brand strategist analyzing competitive intelligence
for OMI Bags (欧米箱包), a Chinese handbag brand in the 200-500 RMB segment.

Analyze this competitor brand data and provide strategic insights in Chinese
(with English section headers).

Brand: {brand_name}
Category: {badge}
Strategic Group: {group}

Raw scraped data:
{json.dumps(brand_data, ensure_ascii=False, indent=2)}

Please provide analysis in this exact JSON structure:
{{
  "d1_insight": "搜索联想词分析 — what the search data reveals about brand awareness",
  "d2_insight": "声量分析 — social media presence strength and trajectory",
  "d3_insight": "内容策略 — what their content strategy tells us",
  "d4_insight": "KOL生态 — celebrity/influencer strategy assessment",
  "d5_insight": "社交电商 — live commerce and social selling effectiveness",
  "d6_insight": "消费者心智 — what consumers really think about this brand",
  "d7_insight": "渠道权威 — channel strength and market position",
  "strategic_conclusion": "综合战略结论 — overall threat/opportunity assessment for OMI",
  "threat_level": "high/medium/low — how much of a threat this brand poses to OMI",
  "opportunity_areas": ["list of areas where OMI can learn from or counter this brand"],
  "action_items": [
    {{"dept": "部门名", "action": "specific action for OMI", "priority": "high/medium/low"}}
  ]
}}

Be specific, data-driven, and actionable. Write insights in Chinese.
Focus on what OMI can learn or counter from this competitor."""

    def _build_action_items_prompt(self, all_brands_data: dict) -> str:
        """Build prompt for cross-brand action items."""
        # Summarize key metrics for each brand
        brand_summaries = []
        for name, data in all_brands_data.get("brands", {}).items():
            d2 = data.get("d2_brand_voice_volume", {})
            xhs = d2.get("xhs", {})
            douyin = d2.get("douyin", {})
            brand_summaries.append(
                f"- {name}: XHS {xhs.get('followers', 0)} followers, "
                f"Douyin {douyin.get('followers', 0)} followers, "
                f"Group {data.get('group', '?')}"
            )

        return f"""You are a senior brand strategist for OMI Bags (欧米箱包).

Based on competitive intelligence across 20 brands, generate 10 high-priority
action items for OMI's teams.

Brand landscape:
{chr(10).join(brand_summaries)}

Generate action items as JSON array:
[
  {{
    "dept": "电商部/内容部/品牌部/产品部/市场部",
    "action": "Specific, measurable action in Chinese",
    "priority": "high/medium/low",
    "rationale": "Why this matters, referencing specific competitor data",
    "timeline": "immediate/1-week/1-month/1-quarter"
  }}
]

Focus on actionable insights that directly respond to competitor moves.
Prioritize CASSILE, 裘真, and Songmont as primary competitive threats."""

    async def _cross_brand_analysis(self, brands: dict) -> dict:
        """Generate cross-brand comparison analysis."""
        client = self._get_client()

        # Build comparison data
        comparison_data = {}
        for name, data in brands.items():
            d2 = data.get("d2_brand_voice_volume", {})
            comparison_data[name] = {
                "group": data.get("group", ""),
                "xhs_followers": d2.get("xhs", {}).get("followers", 0),
                "douyin_followers": d2.get("douyin", {}).get("followers", 0),
                "threat_level": data.get("analysis", {}).get("threat_level", "unknown"),
            }

        prompt = f"""Analyze this competitive landscape for OMI Bags and provide
a cross-brand strategic summary in Chinese.

Brand metrics:
{json.dumps(comparison_data, ensure_ascii=False, indent=2)}

Provide JSON response:
{{
  "landscape_summary": "Overall competitive landscape assessment",
  "top_threats": ["brand1", "brand2", "brand3"],
  "emerging_trends": ["trend1", "trend2"],
  "omi_positioning_advice": "Strategic positioning advice for OMI",
  "market_gaps": ["gap1", "gap2"]
}}"""

        try:
            message = client.messages.create(
                model=self.model,
                max_tokens=2048,
                messages=[{"role": "user", "content": prompt}],
            )
            return self._safe_json_parse(message.content[0].text)
        except Exception as e:
            logger.error(f"Cross-brand analysis failed: {e}")
            return {"error": str(e)}

    # ─── Response Parsers ──────────────────────────────────────────────────

    @staticmethod
    def _parse_analysis_response(text: str) -> dict:
        """Parse JSON analysis from Claude's response."""
        return BrandEquityAnalyzer._safe_json_parse(text)

    @staticmethod
    def _parse_action_items(text: str) -> List[dict]:
        """Parse action items JSON from Claude's response."""
        result = BrandEquityAnalyzer._safe_json_parse(text)
        if isinstance(result, list):
            return result
        return result.get("action_items", []) if isinstance(result, dict) else []

    @staticmethod
    def _safe_json_parse(text: str) -> dict:
        """Safely extract JSON from Claude's response text."""
        # Try direct parse
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Try extracting JSON block from markdown
        import re
        json_match = re.search(r'```(?:json)?\s*\n?([\s\S]*?)\n?```', text)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        # Try finding first { to last }
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass

        # Try finding first [ to last ]
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass

        logger.warning(f"Could not parse JSON from response: {text[:200]}...")
        return {"raw_text": text}
