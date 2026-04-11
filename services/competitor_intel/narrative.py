"""
Claude Narrative Layer for OMI Competitive Intelligence.

Generates actionable competitive intelligence briefs in Chinese, powered by
deterministic scores from scoring.py. Claude explains what the numbers mean
-- it doesn't compute them.

Three output types:
  1. Per-brand narratives (2-4 sentences each)
  2. Cross-brand strategic summary (3-5 paragraphs)
  3. OMI-specific prioritized action items (5-7 items)

Usage:
    python -m services.competitor-intel.narrative            # full pipeline
    python -m services.competitor-intel.narrative --dry-run  # preview prompts only
"""

import json
import os
import re
import sys
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from .config import ANTHROPIC_API_KEY, get_brand_by_name
from .storage import (
    get_all_brands,
    get_latest_narratives,
    get_latest_scores,
    init_db,
    save_narrative,
)
from .temporal import detect_anomalies


# ─── Model Configuration ────────────────────────────────────────────────────

NARRATIVE_MODEL = os.environ.get("NARRATIVE_MODEL", "claude-haiku-4-5-20251001")
STRATEGY_MODEL = os.environ.get("STRATEGY_MODEL", "claude-sonnet-4-6-20250514")


# ─── Cost Estimation ────────────────────────────────────────────────────────

_PRICING: Dict[str, Dict[str, float]] = {
    "claude-haiku-4-5-20251001": {"input": 1.0, "output": 5.0},  # per MTok
    "claude-sonnet-4-6-20250514": {"input": 3.0, "output": 15.0},
    "claude-opus-4-6-20250514": {"input": 5.0, "output": 25.0},
}


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """
    Estimate USD cost based on current Anthropic pricing.

    Args:
        model: Claude model identifier.
        input_tokens: Number of input tokens.
        output_tokens: Number of output tokens.

    Returns:
        Estimated cost in USD, rounded to 6 decimal places.
    """
    model_key = None
    for key in _PRICING:
        # Match without date suffix (e.g., "claude-haiku-4-5" matches "claude-haiku-4-5-20251001")
        prefix = key.rsplit("-", 1)[0]
        if model.startswith(prefix):
            model_key = key
            break
    if not model_key:
        model_key = "claude-sonnet-4-6-20250514"  # fallback

    rates = _PRICING[model_key]
    cost = (input_tokens / 1_000_000 * rates["input"]) + (
        output_tokens / 1_000_000 * rates["output"]
    )
    return round(cost, 6)


# ─── Prompt Construction ────────────────────────────────────────────────────

_BRAND_SYSTEM_PROMPT = (
    "你是OMI箱包(欧米箱包)的竞争情报分析师。根据提供的品牌评分、异常指标和GTM信号,"
    "用简洁的中文撰写竞争分析。\n\n"
    "要求:\n"
    "- 每个品牌写2-4句话\n"
    "- 必须引用具体数字(分数、百分比、变化量)\n"
    "- 必须说明对OMI的具体影响和建议\n"
    "- 语气专业但直接,像给CEO的简报\n"
    "- 如果有GTM信号,优先解读其战略含义\n\n"
    '示例输出:\n'
    '"Songmont本周势头强劲(动量82分,+7)。XHS粉丝增长18%远超月均3%,'
    '疑似与新签KOL@时尚大表姐合作有关。对OMI的威胁主要在300-500元价格带的直接竞争,'
    '建议电商部关注其新品定价策略。"\n\n'
    '"小CK本周表现平稳(动量55分,无变化)。各维度指标均在正常范围内,无异常信号。'
    '作为Group D的标杆品牌,其稳定表现反映成熟品牌的运营节奏,OMI可参考但无需紧急应对。"'
)

_STRATEGIC_SYSTEM_PROMPT = (
    "你是OMI箱包的首席战略顾问。根据20个竞品的评分数据,撰写本周竞争态势概览。\n\n"
    "要求:\n"
    "- 3-5段,每段聚焦一个主题(如:市场格局变化、新兴威胁、机会窗口、价格战动向)\n"
    "- 引用具体品牌和数据\n"
    "- 最后一段必须是对OMI管理层的战略建议\n"
    "- 中文撰写,专业但易懂"
)

_ACTION_ITEMS_SYSTEM_PROMPT = (
    "你是OMI箱包的运营顾问。根据竞品数据,生成本周优先行动项。\n\n"
    "每个行动项必须包含:\n"
    "1. 具体行动(做什么)\n"
    "2. 负责部门(产品部/市场部/电商部/内容部/品牌部)\n"
    "3. 紧急度(本周/本月/本季度)\n"
    "4. 依据(基于哪个竞品的什么数据)\n\n"
    '输出JSON数组,每个元素格式:\n'
    '{"action": "...", "department": "...", "urgency": "...", "rationale": "..."}\n\n'
    "只输出JSON,不要其他文字。"
)


def _build_brand_user_prompt(
    brand_name: str,
    score_data: dict,
    brand_anomalies: List[dict],
) -> str:
    """Build the user prompt for a single brand narrative."""
    brand_info = get_brand_by_name(brand_name)
    name_en = brand_info["name_en"] if brand_info else brand_name
    group = brand_info.get("group", "?") if brand_info else "?"
    group_name = brand_info.get("group_name", "?") if brand_info else "?"

    momentum = score_data.get("momentum_score", 0)
    threat = score_data.get("threat_index", 0)

    # Format score breakdown
    breakdown = score_data.get("score_breakdown", {})
    breakdown_lines = []
    for signal, info in breakdown.items():
        if isinstance(info, dict):
            raw = info.get("raw", "N/A")
            norm = info.get("normalized", 0)
            weight = info.get("weight", 0)
            breakdown_lines.append(f"  {signal}: raw={raw}, normalized={norm}, weight={weight}")
    breakdown_str = "\n".join(breakdown_lines) if breakdown_lines else "  数据不足"

    # Format GTM signals
    gtm = score_data.get("gtm_signals", [])
    if gtm:
        gtm_lines = []
        for s in gtm:
            gtm_lines.append(f"  {s.get('signal', '?')}: {s.get('detail', '')} (severity: {s.get('severity', '?')})")
        gtm_str = "\n".join(gtm_lines)
    else:
        gtm_str = "  无"

    # Format anomalies
    if brand_anomalies:
        anomaly_lines = []
        for a in brand_anomalies:
            anomaly_lines.append(
                f"  {a['metric_name']}: z={a['z_score']}, "
                f"direction={a['direction']}, severity={a['severity']}"
            )
        anomaly_str = "\n".join(anomaly_lines)
    else:
        anomaly_str = "  无异常"

    return (
        f"品牌: {brand_name} ({name_en})\n"
        f"战略分组: {group} — {group_name}\n\n"
        f"动量评分: {momentum}/100\n"
        f"威胁指数: {threat}/100\n\n"
        f"评分明细:\n{breakdown_str}\n\n"
        f"活跃GTM信号:\n{gtm_str}\n\n"
        f"异常指标:\n{anomaly_str}\n\n"
        f"请分析此品牌本周表现及对OMI的影响。"
    )


def _build_strategic_user_prompt(
    all_scores: List[dict],
    anomalies: List[dict],
) -> str:
    """Build the user prompt for the strategic summary."""
    # Top 10 by momentum
    by_momentum = sorted(all_scores, key=lambda x: x.get("momentum_score", 0), reverse=True)[:10]
    momentum_lines = []
    for i, s in enumerate(by_momentum, 1):
        signals_str = ""
        gtm = s.get("gtm_signals", [])
        if gtm:
            signals_str = " | " + ", ".join(g.get("signal", "") for g in gtm)
        momentum_lines.append(
            f"  {i}. {s['brand_name']}: 动量{s.get('momentum_score', 0)}分{signals_str}"
        )

    # Top 5 by threat
    by_threat = sorted(all_scores, key=lambda x: x.get("threat_index", 0), reverse=True)[:5]
    threat_lines = []
    for i, s in enumerate(by_threat, 1):
        tb = s.get("threat_breakdown", {})
        key_factor = ""
        if tb:
            top = max(tb.items(), key=lambda x: x[1].get("score", 0) if isinstance(x[1], dict) else 0)
            key_factor = f" — {top[1].get('detail', '')}" if isinstance(top[1], dict) else ""
        threat_lines.append(
            f"  {i}. {s['brand_name']}: 威胁{s.get('threat_index', 0)}分{key_factor}"
        )

    # Anomalies
    if anomalies:
        anomaly_lines = []
        for a in anomalies:
            anomaly_lines.append(
                f"  {a['brand_name']}: {a['metric_name']} "
                f"(z={a['z_score']}, {a['direction']}, {a['severity']})"
            )
        anomaly_str = "\n".join(anomaly_lines)
    else:
        anomaly_str = "  无异常"

    # All GTM signals
    all_signals = []
    for s in all_scores:
        for g in s.get("gtm_signals", []):
            all_signals.append(f"  {s['brand_name']}: {g.get('signal', '')} — {g.get('detail', '')}")
    signals_str = "\n".join(all_signals) if all_signals else "  无活跃信号"

    return (
        f"本周竞品评分汇总:\n\n"
        f"品牌动量排行:\n" + "\n".join(momentum_lines) + "\n\n"
        f"OMI威胁排行:\n" + "\n".join(threat_lines) + "\n\n"
        f"本周异常:\n{anomaly_str}\n\n"
        f"活跃GTM信号:\n{signals_str}\n\n"
        f"请撰写本周竞争态势概览。"
    )


def _build_action_items_user_prompt(
    all_scores: List[dict],
    anomalies: List[dict],
) -> str:
    """Build the user prompt for action items generation."""
    # Reuse the strategic prompt data but with different framing
    return _build_strategic_user_prompt(all_scores, anomalies).replace(
        "请撰写本周竞争态势概览。",
        "请生成5-7个优先行动项(JSON格式)。"
    )


def _safe_json_parse(text: str) -> Optional[list]:
    """
    Attempt to parse JSON from Claude's response, handling common issues.

    Handles:
    - Clean JSON arrays
    - JSON wrapped in code fences
    - JSON with trailing text

    Returns None if parsing fails completely.
    """
    if not text:
        return None

    # Strip code fences
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*\n?", "", cleaned)
    cleaned = re.sub(r"\n?```\s*$", "", cleaned)
    cleaned = cleaned.strip()

    # Try direct parse
    try:
        result = json.loads(cleaned)
        if isinstance(result, list):
            return result
        if isinstance(result, dict):
            return [result]
        return None
    except json.JSONDecodeError:
        pass

    # Try to extract JSON array from text
    match = re.search(r"\[.*\]", cleaned, re.DOTALL)
    if match:
        try:
            result = json.loads(match.group())
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass

    return None


def _estimate_tokens(text: str) -> int:
    """Rough token estimate: ~1.5 tokens per CJK character, ~0.75 per Latin word."""
    cjk_chars = sum(1 for c in text if "\u4e00" <= c <= "\u9fff")
    latin_words = len(re.findall(r"[a-zA-Z]+", text))
    other = len(text) - cjk_chars - sum(len(w) for w in re.findall(r"[a-zA-Z]+", text))
    return int(cjk_chars * 1.5 + latin_words * 0.75 + other * 0.3)


# ─── API Call Helpers ────────────────────────────────────────────────────────


def _call_claude(
    system_prompt: str,
    user_prompt: str,
    model: str,
    max_tokens: int = 500,
    use_cache: bool = False,
) -> dict:
    """
    Call the Claude API with retry logic.

    Args:
        system_prompt: System message content.
        user_prompt: User message content.
        model: Model identifier.
        max_tokens: Maximum output tokens.
        use_cache: Whether to use prompt caching on the system prompt.

    Returns:
        Dict with content, model, input_tokens, output_tokens, cost.
    """
    import anthropic

    client = anthropic.Anthropic()

    # Build system message with optional cache control
    if use_cache:
        system = [
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ]
    else:
        system = system_prompt

    messages = [{"role": "user", "content": user_prompt}]

    # Retry with exponential backoff
    delays = [2, 4, 8]
    last_error = None

    for attempt in range(len(delays) + 1):
        try:
            response = client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=system,
                messages=messages,
            )

            input_tokens = response.usage.input_tokens
            output_tokens = response.usage.output_tokens
            content = response.content[0].text if response.content else ""

            return {
                "content": content,
                "model": model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cost": estimate_cost(model, input_tokens, output_tokens),
            }
        except (anthropic.RateLimitError, anthropic.InternalServerError) as e:
            last_error = e
            if attempt < len(delays):
                time.sleep(delays[attempt])
            else:
                raise
        except anthropic.APIError as e:
            raise

    raise last_error  # Should not reach here


# ─── Public API ──────────────────────────────────────────────────────────────


def generate_brand_narrative(
    brand_name: str,
    scores: dict,
    anomalies: List[dict],
    db_path: Optional[str] = None,
) -> dict:
    """
    Generate a 2-4 sentence Chinese narrative for one brand via Claude.

    Args:
        brand_name: Brand to generate narrative for.
        scores: Score data dict for this brand (from get_latest_scores).
        anomalies: List of anomaly dicts (filtered to this brand or all).
        db_path: Path to SQLite database. None for default.

    Returns:
        Dict with narrative, model, input_tokens, output_tokens, cost.
    """
    brand_anomalies = [a for a in anomalies if a["brand_name"] == brand_name]
    user_prompt = _build_brand_user_prompt(brand_name, scores, brand_anomalies)

    result = _call_claude(
        system_prompt=_BRAND_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        model=NARRATIVE_MODEL,
        max_tokens=500,
        use_cache=True,
    )

    return {
        "brand_name": brand_name,
        "narrative": result["content"],
        "model": result["model"],
        "input_tokens": result["input_tokens"],
        "output_tokens": result["output_tokens"],
        "cost": result["cost"],
    }


def generate_strategic_summary(
    all_scores: List[dict],
    anomalies: List[dict],
    db_path: Optional[str] = None,
) -> dict:
    """
    Generate a 3-5 paragraph Chinese strategic overview via Claude.

    Args:
        all_scores: List of score dicts for all brands.
        anomalies: List of all anomaly dicts.
        db_path: Path to SQLite database. None for default.

    Returns:
        Dict with summary, model, input_tokens, output_tokens, cost.
    """
    user_prompt = _build_strategic_user_prompt(all_scores, anomalies)

    result = _call_claude(
        system_prompt=_STRATEGIC_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        model=STRATEGY_MODEL,
        max_tokens=2000,
    )

    return {
        "summary": result["content"],
        "model": result["model"],
        "input_tokens": result["input_tokens"],
        "output_tokens": result["output_tokens"],
        "cost": result["cost"],
    }


def generate_action_items(
    all_scores: List[dict],
    anomalies: List[dict],
    db_path: Optional[str] = None,
) -> dict:
    """
    Generate 5-7 prioritized action items for OMI via Claude.

    Args:
        all_scores: List of score dicts for all brands.
        anomalies: List of all anomaly dicts.
        db_path: Path to SQLite database. None for default.

    Returns:
        Dict with action_items (list), raw_response, model, tokens, cost.
    """
    user_prompt = _build_action_items_user_prompt(all_scores, anomalies)

    result = _call_claude(
        system_prompt=_ACTION_ITEMS_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        model=STRATEGY_MODEL,
        max_tokens=1500,
    )

    # Parse JSON response
    parsed = _safe_json_parse(result["content"])
    if parsed is None:
        # Fallback: wrap raw text
        parsed = [{"action": result["content"], "department": "unknown",
                    "urgency": "unknown", "rationale": "JSON parse failed"}]

    return {
        "action_items": parsed,
        "raw_response": result["content"],
        "model": result["model"],
        "input_tokens": result["input_tokens"],
        "output_tokens": result["output_tokens"],
        "cost": result["cost"],
    }


def run_narrative_pipeline(
    db_path: Optional[str] = None,
) -> dict:
    """
    Run the complete narrative generation pipeline.

    1. Load latest scores and anomalies
    2. Generate per-brand narratives
    3. Generate strategic summary
    4. Generate action items
    5. Save everything to SQLite
    6. Return all results with cost summary

    Args:
        db_path: Path to SQLite database. None for default.

    Returns:
        Dict with brand_narratives, strategic_summary, action_items, cost_summary.
    """
    conn = init_db(db_path)

    # Load data
    all_scores = get_latest_scores(conn)
    if not all_scores:
        conn.close()
        raise ValueError("No scores found. Run `python -m services.competitor-intel.scoring` first.")

    anomalies = detect_anomalies(db_path=db_path)
    today = datetime.now().strftime("%Y-%m-%d")

    # Track costs
    brand_costs = {"input_tokens": 0, "output_tokens": 0, "cost": 0.0, "calls": 0}
    summary_costs = {"input_tokens": 0, "output_tokens": 0, "cost": 0.0}
    action_costs = {"input_tokens": 0, "output_tokens": 0, "cost": 0.0}

    # 1. Per-brand narratives
    brand_narratives: Dict[str, str] = {}
    for score_data in all_scores:
        brand_name = score_data["brand_name"]
        if score_data.get("data_completeness", 0) == 0:
            continue

        result = generate_brand_narrative(brand_name, score_data, anomalies, db_path)
        brand_narratives[brand_name] = result["narrative"]

        # Save to DB
        save_narrative(
            conn, today, "brand", result["narrative"],
            brand_name=brand_name, model_used=result["model"],
            input_tokens=result["input_tokens"],
            output_tokens=result["output_tokens"],
            cost_estimate=result["cost"],
        )

        brand_costs["input_tokens"] += result["input_tokens"]
        brand_costs["output_tokens"] += result["output_tokens"]
        brand_costs["cost"] += result["cost"]
        brand_costs["calls"] += 1

        # Stream-like feedback
        print(f"  {brand_name}: {result['narrative'][:60]}...")

    # 2. Strategic summary
    summary_result = generate_strategic_summary(all_scores, anomalies, db_path)
    save_narrative(
        conn, today, "strategic_summary", summary_result["summary"],
        model_used=summary_result["model"],
        input_tokens=summary_result["input_tokens"],
        output_tokens=summary_result["output_tokens"],
        cost_estimate=summary_result["cost"],
    )
    summary_costs["input_tokens"] = summary_result["input_tokens"]
    summary_costs["output_tokens"] = summary_result["output_tokens"]
    summary_costs["cost"] = summary_result["cost"]

    # 3. Action items
    action_result = generate_action_items(all_scores, anomalies, db_path)
    save_narrative(
        conn, today, "action_items",
        json.dumps(action_result["action_items"], ensure_ascii=False),
        model_used=action_result["model"],
        input_tokens=action_result["input_tokens"],
        output_tokens=action_result["output_tokens"],
        cost_estimate=action_result["cost"],
    )
    action_costs["input_tokens"] = action_result["input_tokens"]
    action_costs["output_tokens"] = action_result["output_tokens"]
    action_costs["cost"] = action_result["cost"]

    conn.close()

    total_cost = brand_costs["cost"] + summary_costs["cost"] + action_costs["cost"]

    return {
        "date": today,
        "brand_narratives": brand_narratives,
        "strategic_summary": summary_result["summary"],
        "action_items": action_result["action_items"],
        "cost_summary": {
            "brand_narratives": {
                "model": NARRATIVE_MODEL,
                "calls": brand_costs["calls"],
                "input_tokens": brand_costs["input_tokens"],
                "output_tokens": brand_costs["output_tokens"],
                "cost": round(brand_costs["cost"], 6),
            },
            "strategic_summary": {
                "model": STRATEGY_MODEL,
                "input_tokens": summary_costs["input_tokens"],
                "output_tokens": summary_costs["output_tokens"],
                "cost": round(summary_costs["cost"], 6),
            },
            "action_items": {
                "model": STRATEGY_MODEL,
                "input_tokens": action_costs["input_tokens"],
                "output_tokens": action_costs["output_tokens"],
                "cost": round(action_costs["cost"], 6),
            },
            "total_cost": round(total_cost, 6),
        },
    }


# ─── Dry Run ─────────────────────────────────────────────────────────────────


def run_dry_run(db_path: Optional[str] = None) -> dict:
    """
    Build all prompts without making API calls. Estimates token counts and costs.

    Args:
        db_path: Path to SQLite database. None for default.

    Returns:
        Dict with all prompts and estimated costs.
    """
    conn = init_db(db_path)
    all_scores = get_latest_scores(conn)
    if not all_scores:
        conn.close()
        print("No scores found. Run `python -m services.competitor-intel.scoring` first.")
        return {"error": "no scores"}

    anomalies = detect_anomalies(db_path=db_path)
    conn.close()

    total_estimated_input = 0
    total_estimated_output = 0

    # Brand prompts
    print("=" * 60)
    print("DRY RUN — Prompts that would be sent to Claude")
    print("=" * 60)
    print()

    print(f"System Prompt (brand narratives, cached across all calls):")
    print(f"  Model: {NARRATIVE_MODEL}")
    print(f"  Tokens (est.): {_estimate_tokens(_BRAND_SYSTEM_PROMPT)}")
    print(f"  ---")
    print(f"  {_BRAND_SYSTEM_PROMPT[:200]}...")
    print()

    brand_prompts = []
    brands_with_data = [s for s in all_scores if s.get("data_completeness", 0) > 0]

    for score_data in brands_with_data:
        brand_name = score_data["brand_name"]
        brand_anomalies = [a for a in anomalies if a["brand_name"] == brand_name]
        user_prompt = _build_brand_user_prompt(brand_name, score_data, brand_anomalies)
        est_input = _estimate_tokens(_BRAND_SYSTEM_PROMPT) + _estimate_tokens(user_prompt)
        est_output = 250  # estimated average output

        brand_prompts.append({
            "brand_name": brand_name,
            "user_prompt": user_prompt,
            "estimated_input_tokens": est_input,
            "estimated_output_tokens": est_output,
        })

        total_estimated_input += est_input
        total_estimated_output += est_output

        print(f"  [{brand_name}] User Prompt ({_estimate_tokens(user_prompt)} tokens est.):")
        for line in user_prompt.split("\n")[:5]:
            print(f"    {line}")
        print(f"    ...")
        print()

    # Strategic summary
    strategic_prompt = _build_strategic_user_prompt(all_scores, anomalies)
    est_strat_input = _estimate_tokens(_STRATEGIC_SYSTEM_PROMPT) + _estimate_tokens(strategic_prompt)
    est_strat_output = 1000

    print(f"Strategic Summary Prompt:")
    print(f"  Model: {STRATEGY_MODEL}")
    print(f"  Tokens (est.): {est_strat_input} input, {est_strat_output} output")
    print(f"  ---")
    for line in strategic_prompt.split("\n")[:10]:
        print(f"    {line}")
    print(f"    ...")
    print()

    total_estimated_input += est_strat_input
    total_estimated_output += est_strat_output

    # Action items
    action_prompt = _build_action_items_user_prompt(all_scores, anomalies)
    est_action_input = _estimate_tokens(_ACTION_ITEMS_SYSTEM_PROMPT) + _estimate_tokens(action_prompt)
    est_action_output = 800

    print(f"Action Items Prompt:")
    print(f"  Model: {STRATEGY_MODEL}")
    print(f"  Tokens (est.): {est_action_input} input, {est_action_output} output")
    print(f"  ---")
    for line in action_prompt.split("\n")[:10]:
        print(f"    {line}")
    print(f"    ...")
    print()

    total_estimated_input += est_action_input
    total_estimated_output += est_action_output

    # Cost estimates
    brand_cost = estimate_cost(NARRATIVE_MODEL, total_estimated_input - est_strat_input - est_action_input,
                               total_estimated_output - est_strat_output - est_action_output)
    strat_cost = estimate_cost(STRATEGY_MODEL, est_strat_input, est_strat_output)
    action_cost = estimate_cost(STRATEGY_MODEL, est_action_input, est_action_output)
    total_cost = brand_cost + strat_cost + action_cost

    print("Estimated Cost Summary")
    print("\u2500" * 40)
    print(f"Brand narratives ({len(brands_with_data)} calls): ${brand_cost:.4f}")
    print(f"Strategic summary (1 call):    ${strat_cost:.4f}")
    print(f"Action items (1 call):         ${action_cost:.4f}")
    print(f"Total estimated:               ${total_cost:.4f}")

    return {
        "brand_prompts": brand_prompts,
        "strategic_prompt": strategic_prompt,
        "action_prompt": action_prompt,
        "estimated_cost": total_cost,
    }


# ─── CLI ─────────────────────────────────────────────────────────────────────


def _print_cost_summary(cost_summary: dict) -> None:
    """Print formatted cost summary."""
    print()
    print("Narrative Pipeline Cost Summary")
    print("\u2500" * 40)

    bn = cost_summary["brand_narratives"]
    print(f"Brand narratives ({bn['calls']} calls):")
    print(f"  Model: {bn['model']}")
    print(f"  Input tokens: {bn['input_tokens']:,}")
    print(f"  Output tokens: {bn['output_tokens']:,}")
    print(f"  Cost: ${bn['cost']:.4f}")
    print()

    ss = cost_summary["strategic_summary"]
    print(f"Strategic summary (1 call):")
    print(f"  Model: {ss['model']}")
    print(f"  Input tokens: {ss['input_tokens']:,}")
    print(f"  Output tokens: {ss['output_tokens']:,}")
    print(f"  Cost: ${ss['cost']:.4f}")
    print()

    ai = cost_summary["action_items"]
    print(f"Action items (1 call):")
    print(f"  Model: {ai['model']}")
    print(f"  Input tokens: {ai['input_tokens']:,}")
    print(f"  Output tokens: {ai['output_tokens']:,}")
    print(f"  Cost: ${ai['cost']:.4f}")
    print()

    print(f"Total: ${cost_summary['total_cost']:.4f}")


def main():
    """CLI entry point for the narrative pipeline."""
    dry_run = "--dry-run" in sys.argv

    if dry_run:
        run_dry_run()
        return

    # Check API key
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("Error: ANTHROPIC_API_KEY environment variable is not set.")
        print("Set it with: export ANTHROPIC_API_KEY=your-key-here")
        print("Or use --dry-run to preview prompts without API calls.")
        sys.exit(1)

    # Check scores exist
    conn = init_db()
    scores = get_latest_scores(conn)
    conn.close()
    if not scores:
        print("No scores found. Run `python -m services.competitor-intel.scoring` first.")
        sys.exit(1)

    print(f"Narrative Pipeline \u2014 {datetime.now().strftime('%Y-%m-%d')}")
    print("=" * 40)
    print()
    print("Generating brand narratives...")

    result = run_narrative_pipeline()

    print()
    print("=" * 40)
    print("Strategic Summary:")
    print("=" * 40)
    print(result["strategic_summary"])
    print()

    print("=" * 40)
    print("Action Items:")
    print("=" * 40)
    for i, item in enumerate(result["action_items"], 1):
        if isinstance(item, dict):
            print(f"  {i}. [{item.get('urgency', '?')}] {item.get('action', '?')}")
            print(f"     Department: {item.get('department', '?')}")
            print(f"     Rationale: {item.get('rationale', '?')}")
        else:
            print(f"  {i}. {item}")
    print()

    _print_cost_summary(result["cost_summary"])


if __name__ == "__main__":
    main()
