"""
LLM cost estimator + ai_call_log writer (sub-issue #146).

Single helper used by every LLM call site in the Python pipelines so the
ai_call_log table fills up consistently. Cost rates live in RATES_USD_PER_M
below; update when providers change pricing — old rows keep their original
estimate (NUMERIC column, not recomputed).

Usage:
    from .cost_estimator import log_ai_call, estimate_cost_usd

    started = time.time()
    try:
        # ... call provider, get usage dict ...
        log_ai_call(
            workspace_id=workspace_id,
            caller="narrative_pipeline.brand_insight",
            provider="deepseek",
            model="deepseek-chat",
            input_tokens=usage.get("prompt_tokens"),
            output_tokens=usage.get("completion_tokens"),
            duration_ms=int((time.time() - started) * 1000),
            success=True,
        )
    except Exception as exc:
        log_ai_call(
            workspace_id=workspace_id,
            caller="narrative_pipeline.brand_insight",
            provider="deepseek",
            model="deepseek-chat",
            duration_ms=int((time.time() - started) * 1000),
            success=False,
            error_message=str(exc),
        )
        raise

The function NEVER raises — a logging failure (DB blip, missing table,
serialization issue) is logged to stderr and the original call result is
returned unchanged. We never want telemetry to break a real LLM call.
"""

import json
import sys
import traceback

from .db_bridge import get_conn

# Cost per million tokens, USD. Update when providers change rates.
# Verified 2026-05-31. Old ai_call_log rows keep their then-current
# estimate — the DB column is NUMERIC, not recomputed at read time.
RATES_USD_PER_M = {
    # Anthropic (Claude) — claude.com/pricing
    "claude-haiku-4-5-20251001":   {"input": 1.00,  "output": 5.00},
    "claude-haiku-4-5":            {"input": 1.00,  "output": 5.00},
    "claude-sonnet-4-5-20250929":  {"input": 3.00,  "output": 15.00},
    "claude-sonnet-4-5":           {"input": 3.00,  "output": 15.00},
    "claude-opus-4-5":             {"input": 15.00, "output": 75.00},

    # DeepSeek — api-docs.deepseek.com/quick_start/pricing
    "deepseek-chat":               {"input": 0.27,  "output": 1.10},
    "deepseek-reasoner":           {"input": 0.55,  "output": 2.19},

    # Qwen — help.aliyun.com (qwen-plus pricing)
    "qwen-plus":                   {"input": 0.40,  "output": 1.20},
    "qwen-max":                    {"input": 2.40,  "output": 9.60},

    # GLM — open.bigmodel.cn (GLM-4-Flash is free tier)
    "glm-4-flash":                 {"input": 0.00,  "output": 0.00},
    "glm-4":                       {"input": 0.50,  "output": 1.50},
}

# Fallback estimate if we don't have a rate for the model. Chosen to be
# conservative-high so an unknown model surfaces in cost reports rather
# than disappearing silently.
DEFAULT_RATE = {"input": 1.00, "output": 5.00}


def estimate_cost_usd(model: str, input_tokens: int | None, output_tokens: int | None) -> float | None:
    """
    Compute estimated USD cost for a single call. Returns None when token
    counts are missing (some providers don't return usage). The wrapper
    still writes the row so the call shows up in telemetry — it just won't
    have a $ figure.
    """
    if input_tokens is None and output_tokens is None:
        return None
    rate = RATES_USD_PER_M.get(model, DEFAULT_RATE)
    cost = 0.0
    if input_tokens is not None:
        cost += (input_tokens / 1_000_000) * rate["input"]
    if output_tokens is not None:
        cost += (output_tokens / 1_000_000) * rate["output"]
    return round(cost, 6)


def log_ai_call(
    *,
    workspace_id: str | None,
    caller: str,
    provider: str,
    model: str,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    duration_ms: int | None = None,
    success: bool = True,
    error_message: str | None = None,
) -> None:
    """
    Insert one row into ai_call_log. Never raises — telemetry failures
    are stderr-logged but never propagate. Cost is computed here from the
    static rate table.

    workspace_id may be None for non-workspace-scoped calls (e.g. ad-hoc
    CLI runs, the diagnostic /api/ai endpoint). The aggregator queries
    filter `WHERE workspace_id IS NOT NULL` when reporting cost-per-customer.
    """
    cost = estimate_cost_usd(model, input_tokens, output_tokens)
    truncated_error = (error_message or "")[:500] if error_message else None

    try:
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO ai_call_log
                        (workspace_id, caller, provider, model,
                         input_tokens, output_tokens, cost_estimate_usd,
                         duration_ms, success, error_message)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        workspace_id, caller, provider, model,
                        input_tokens, output_tokens, cost,
                        duration_ms, success, truncated_error,
                    ),
                )
            conn.commit()
        finally:
            conn.close()
    except Exception:
        # NEVER propagate. Print to stderr so it shows in pm2/cron logs.
        print(
            f"[cost_estimator] FAILED to log ai_call (caller={caller}, model={model}): "
            f"{traceback.format_exc().splitlines()[-1]}",
            file=sys.stderr,
        )
