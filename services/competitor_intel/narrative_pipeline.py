"""
AI narrative generation for CI vFinal.
Reads scores from analysis_results, generates narratives via LLM, stores in analysis_narratives.

Model priority (fallback chain):
1. Anthropic Claude (Haiku + Sonnet) — best quality, may be blocked from HK
2. DeepSeek V3 — primary fallback, strong Chinese language support
3. GLM-4-Flash — free tier fallback

Usage:
  python -m services.competitor_intel.narrative_pipeline --workspace-id UUID
  python -m services.competitor_intel.narrative_pipeline --all
"""

import argparse
import json
import os
import sys
import time

import httpx

from .db_bridge import get_conn, VALID_PROFILE_FILTER
from .cost_estimator import log_ai_call

# Workspace context for cost logging — set per pipeline run via
# set_active_workspace(). Module-level (not thread-local) is fine because
# the pipelines run single-threaded per workspace; the orchestrator calls
# set_active_workspace(workspace_id) before any LLM call.
_ACTIVE_WORKSPACE_ID: str | None = None


def set_active_workspace(workspace_id: str | None) -> None:
    """Set the workspace_id stamped into every ai_call_log row from this
    point on. Call before each pipeline run (or pass None for ad-hoc work)."""
    global _ACTIVE_WORKSPACE_ID
    _ACTIVE_WORKSPACE_ID = workspace_id


# ---------------------------------------------------------------------------
# Model configuration — reads from env vars, falls back through chain
# ---------------------------------------------------------------------------

def _get_llm_config():
    """Determine which LLM provider to use based on available env vars."""

    # Priority 1: Anthropic (if key exists and not in blocked region)
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
    if anthropic_key and os.environ.get("USE_ANTHROPIC", "").lower() == "true":
        return {
            "provider": "anthropic",
            "api_key": anthropic_key,
            "base_url": os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com"),
            "brand_model": "claude-haiku-4-5-20251001",
            "synthesis_model": "claude-sonnet-4-20250514",
        }

    # Priority 2: DeepSeek (recommended for HK servers)
    deepseek_key = os.environ.get("DEEPSEEK_API_KEY")
    if deepseek_key:
        return {
            "provider": "openai_compat",
            "api_key": deepseek_key,
            "base_url": os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            "brand_model": os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
            "synthesis_model": os.environ.get("DEEPSEEK_MODEL", "deepseek-chat"),
        }

    # Priority 3: Qwen
    qwen_key = os.environ.get("QWEN_API_KEY")
    if qwen_key:
        return {
            "provider": "openai_compat",
            "api_key": qwen_key,
            "base_url": os.environ.get(
                "QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1"
            ),
            "brand_model": os.environ.get("QWEN_MODEL", "qwen-plus"),
            "synthesis_model": os.environ.get("QWEN_MODEL", "qwen-plus"),
        }

    # Priority 4: GLM-4-Flash (free tier)
    glm_key = os.environ.get("GLM_API_KEY")
    if glm_key:
        return {
            "provider": "openai_compat",
            "api_key": glm_key,
            "base_url": os.environ.get("GLM_BASE_URL", "https://open.bigmodel.cn/api/paas/v4"),
            "brand_model": os.environ.get("GLM_MODEL", "glm-4-flash"),
            "synthesis_model": os.environ.get("GLM_MODEL", "glm-4-flash"),
        }

    raise RuntimeError(
        "No LLM API key found. Set one of: DEEPSEEK_API_KEY, ANTHROPIC_API_KEY, "
        "QWEN_API_KEY, or GLM_API_KEY"
    )


LLM_CONFIG = _get_llm_config()
print(f"[LLM] Using provider: {LLM_CONFIG['provider']}, model: {LLM_CONFIG['brand_model']}")


class LlmCallError(Exception):
    """Structured error for LLM call failures.

    Carries enough context that the caller can decide whether to retry,
    fall back to a baseline, or propagate. ``status_code`` is the upstream
    HTTP status (or 0 for network/timeout); ``snippet`` is the first chunk
    of the response body when available; ``timed_out`` distinguishes
    AbortError-class failures from real upstream rejections.
    """

    def __init__(self, message, *, status_code=0, snippet="", model="", timed_out=False):
        super().__init__(message)
        self.status_code = status_code
        self.snippet = snippet
        self.model = model
        self.timed_out = timed_out


# Single point of timeout config so cron and ad-hoc runs share behavior.
# 60s matches the previous behavior; expose as env to allow tuning per
# deployment without a code change.
LLM_TIMEOUT_SEC = float(os.environ.get("LLM_TIMEOUT_SEC", "60"))


def _call_llm(prompt: str, model: str, max_tokens: int = 1000) -> str:
    """Call the configured LLM and return the text response.

    Raises :class:`LlmCallError` on any failure — HTTP non-2xx, network
    error, timeout, or malformed response shape. Callers that want to
    degrade gracefully (e.g. ``generate_brand_insight``) catch it and
    return a baseline; callers that should fail loud (e.g. the workspace
    synthesis) let it bubble to the cron supervisor.

    Previous behavior allowed bare httpx.HTTPStatusError / KeyError /
    TimeoutException to propagate, which crashed the orchestrator stage
    and left the user with a Brief 404 and no diagnostic — just a missing
    weekly_briefs row. The structured error gives the operator something
    to grep in the cron log instead.
    """

    # Cost telemetry (#146): time the call + capture token usage from
    # the response + write one ai_call_log row. Wrapping happens here
    # (single point) so all four provider paths get the same treatment
    # without each branch needing its own try/except.
    provider = LLM_CONFIG["provider"]
    caller = "narrative_pipeline._call_llm"
    started = time.time()

    def _log_success(input_tokens, output_tokens):
        log_ai_call(
            workspace_id=_ACTIVE_WORKSPACE_ID,
            caller=caller, provider=provider, model=model,
            input_tokens=input_tokens, output_tokens=output_tokens,
            duration_ms=int((time.time() - started) * 1000),
            success=True,
        )

    def _log_failure(exc):
        log_ai_call(
            workspace_id=_ACTIVE_WORKSPACE_ID,
            caller=caller, provider=provider, model=model,
            duration_ms=int((time.time() - started) * 1000),
            success=False, error_message=str(exc),
        )

    if provider == "anthropic":
        try:
            from anthropic import Anthropic

            client = Anthropic(api_key=LLM_CONFIG["api_key"])
            response = client.messages.create(
                model=model,
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
            # Find the first text block; future tool_use blocks shouldn't crash us.
            for block in response.content or []:
                if getattr(block, "type", None) == "text" and getattr(block, "text", None):
                    # Anthropic SDK exposes .usage.input_tokens / .output_tokens
                    usage = getattr(response, "usage", None)
                    _log_success(
                        getattr(usage, "input_tokens", None) if usage else None,
                        getattr(usage, "output_tokens", None) if usage else None,
                    )
                    return block.text.strip()
            err = LlmCallError("Anthropic response missing text block", model=model)
            _log_failure(err)
            raise err
        except LlmCallError:
            raise
        except Exception as exc:
            _log_failure(exc)
            raise LlmCallError(
                f"Anthropic call failed: {exc}",
                model=model,
            ) from exc

    # OpenAI-compatible API (DeepSeek, Qwen, GLM)
    url = f"{LLM_CONFIG['base_url'].rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {LLM_CONFIG['api_key']}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
    }

    try:
        resp = httpx.post(url, headers=headers, json=payload, timeout=LLM_TIMEOUT_SEC)
    except httpx.TimeoutException as exc:
        err = LlmCallError(
            f"LLM timed out after {LLM_TIMEOUT_SEC}s",
            status_code=0, model=model, timed_out=True,
        )
        _log_failure(err)
        raise err from exc
    except httpx.HTTPError as exc:
        err = LlmCallError(
            f"LLM transport error: {exc}",
            status_code=0, model=model,
        )
        _log_failure(err)
        raise err from exc

    if resp.status_code >= 400:
        snippet = (resp.text or "")[:200]
        err = LlmCallError(
            f"LLM HTTP {resp.status_code}: {snippet}",
            status_code=resp.status_code, snippet=snippet, model=model,
        )
        _log_failure(err)
        raise err

    try:
        data = resp.json()
        text = data["choices"][0]["message"]["content"].strip()
        # OpenAI-compatible providers return usage in data["usage"].
        # DeepSeek, Qwen, GLM all follow this convention.
        usage = data.get("usage") or {}
        _log_success(
            usage.get("prompt_tokens"),
            usage.get("completion_tokens"),
        )
        return text
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        snippet = (resp.text or "")[:200]
        err = LlmCallError(
            f"LLM response shape mismatch: {exc}",
            status_code=resp.status_code, snippet=snippet, model=model,
        )
        _log_failure(err)
        raise err from exc


# ---------------------------------------------------------------------------
# Per-brand insight (cheap, high-volume call)
# ---------------------------------------------------------------------------

def generate_brand_insight(brand_name: str, scores: dict, profile: dict) -> str:
    """Generate a 2-3 sentence insight for a single brand."""

    prompt = f"""You are a competitive intelligence analyst for the Chinese consumer goods market.

Given this competitor data, write a 2-3 sentence strategic insight in Chinese (简体中文).
Be specific and actionable. Reference the actual numbers.

Brand: {brand_name}
Momentum Score: {scores.get('momentum', 'N/A')}/100
Threat Index: {scores.get('threat', 'N/A')}/100
WTP Score: {scores.get('wtp', 'N/A')}/100
Followers: {profile.get('followers', 'N/A')}
Avg Price: ¥{profile.get('avg_price', 'N/A')}
Top engagement metrics: {json.dumps(profile.get('engagement_metrics', {}), ensure_ascii=False)}

Write ONLY the insight paragraph, no headers or bullet points."""

    # Step 1 (zh) — the primary insight. If this fails we degrade to a
    # baseline string so the cron orchestrator doesn't crash on a single
    # brand. The baseline is intentionally honest about being a fallback
    # so reviewers can spot it in the analytics_results table.
    try:
        zh_text = _call_llm(prompt, LLM_CONFIG["brand_model"], max_tokens=300)
    except LlmCallError as exc:
        print(
            f"[narrative] brand_insight zh failed for '{brand_name}': "
            f"status={exc.status_code} timed_out={exc.timed_out} model={exc.model} :: {exc}"
        )
        baseline_zh = (
            f"{brand_name} 的策略洞察暂时不可用 (LLM 调用失败)。"
            "等待下次抓取后将自动重新生成。"
        )
        return json.dumps(
            {
                "zh": baseline_zh,
                "en": (
                    f"Strategic insight for {brand_name} is temporarily "
                    "unavailable (LLM call failed); will regenerate on the "
                    "next scrape."
                ),
                "_fallback": True,
            },
            ensure_ascii=False,
        )

    # Step 2 (en) — translation. If this fails we still return the zh
    # text on its own (the runtime translate-on-demand layer in
    # backend/server.js will pick it up on first English read).
    try:
        en_text = _call_llm(
            f"Translate the following Chinese competitive intelligence insight "
            f"into fluent English. Return ONLY the translated text, no explanation.\n\n{zh_text}",
            LLM_CONFIG["brand_model"], max_tokens=300,
        )
        return json.dumps({"zh": zh_text, "en": en_text.strip()}, ensure_ascii=False)
    except LlmCallError as exc:
        print(
            f"[narrative] brand_insight en-translation failed for '{brand_name}': "
            f"status={exc.status_code} timed_out={exc.timed_out} :: {exc}"
        )
        return zh_text


# ---------------------------------------------------------------------------
# Cross-brand strategic synthesis (premium call)
# ---------------------------------------------------------------------------

def generate_workspace_narrative(workspace: dict, competitors_data: list) -> dict:
    """
    Generate cross-brand strategic narrative and action items.

    Returns: { narrative: str, action_items: [{ title, description, dept, priority }] }
    """

    # Build competitor summary for the prompt
    comp_summaries = []
    for comp in competitors_data:
        comp_summaries.append(
            f"- {comp['brand_name']}: 势能{comp['momentum']}, 威胁{comp['threat']}, "
            f"支付意愿{comp['wtp']}, 均价¥{comp.get('avg_price', '?')}, "
            f"粉丝{comp.get('followers', '?')}"
        )

    competitor_block = "\n".join(comp_summaries)
    brand_name = workspace.get("brand_name", "Our Brand")
    category = workspace.get("brand_category", "女包")
    price_range = workspace.get("brand_price_range") or {}
    price_str = f"¥{price_range.get('min', '?')}-{price_range.get('max', '?')}"

    prompt = f"""You are a senior competitive intelligence strategist advising a Chinese {category} brand.

Our brand: {brand_name} (price range: {price_str})

Competitors being tracked:
{competitor_block}

Based on this competitive landscape, provide:

1. A strategic narrative (3-5 sentences in Chinese/简体中文) summarizing the key competitive dynamics.
   - Who is the biggest threat and why?
   - Where are the opportunities?
   - What trend is most important to watch?

2. Exactly 3-5 action items, each with:
   - title (concise, 10 words max)
   - description (1 sentence explaining why and what to do)
   - dept (one of: 电商部, 品牌部, 产品部, 抖音运营部, 市场部)
   - priority (high, medium, or low)

Respond in this exact JSON format, no markdown, no explanation outside the JSON:
{{
  "narrative": "...",
  "action_items": [
    {{"title": "...", "description": "...", "dept": "...", "priority": "high"}},
    ...
  ]
}}"""

    # Wrap so an LLM blip on the synthesis call doesn't crash the
    # orchestrator stage (which would leave the user with a Brief 404
    # and no diagnostic). The cron is invoked with --brands-only today,
    # so this path is rare — but the failure mode it produces is severe
    # (whole stage aborts), which is exactly when a graceful degrade is
    # most valuable.
    try:
        raw = _call_llm(prompt, LLM_CONFIG["synthesis_model"], max_tokens=1000)
    except LlmCallError as exc:
        print(
            f"[narrative] workspace synthesis failed for '{brand_name}': "
            f"status={exc.status_code} timed_out={exc.timed_out} :: {exc}"
        )
        return {
            "narrative": (
                f"工作区策略综合暂时不可用 (LLM 调用失败)。"
                "本周简报基于现有数据，下次抓取将重试。"
            ),
            "action_items": [],
            "_fallback": True,
        }

    # Parse JSON response (handle potential markdown wrapping)
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]

    try:
        result = json.loads(raw)
        return {
            "narrative": result.get("narrative", ""),
            "action_items": result.get("action_items", []),
        }
    except json.JSONDecodeError:
        # JSON parse failure — keep raw text as narrative, drop action_items.
        # Still better than a stack trace; flag so downstream knows it's
        # degraded structure.
        return {
            "narrative": raw[:500],
            "action_items": [],
            "_parse_failed": True,
        }


# ---------------------------------------------------------------------------
# Pipeline orchestration
# ---------------------------------------------------------------------------

def run_narrative_for_workspace(workspace_id: str, brands_only: bool = False):
    """Generate narratives for a workspace.

    `brands_only=True` skips the workspace-level cross-brand synthesis
    (analysis_narratives table) — that data is no longer consumed by the
    V3 frontend (the Brief verdict + moves replaced it). Per-brand
    insights still write to analysis_results.ai_narrative which IS
    consumed by /ci/analytics' AI brand insights panel. Saves one LLM
    call per workspace per cron run.
    """
    # Stamp the workspace into every ai_call_log row emitted by _call_llm
    # during this pipeline run (#146 cost telemetry).
    set_active_workspace(workspace_id)
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # Get workspace
            cur.execute("SELECT * FROM workspaces WHERE id = %s", (workspace_id,))
            workspace = cur.fetchone()
            if not workspace:
                print(f"[WARN] Workspace {workspace_id} not found")
                return

            # Get competitors with their scores
            cur.execute(
                """
                SELECT wc.brand_name, wc.tier,
                    (SELECT score FROM analysis_results ar
                     WHERE ar.workspace_id = %s AND ar.competitor_name = wc.brand_name
                     AND ar.metric_type = 'momentum' ORDER BY ar.analyzed_at DESC LIMIT 1) as momentum,
                    (SELECT score FROM analysis_results ar
                     WHERE ar.workspace_id = %s AND ar.competitor_name = wc.brand_name
                     AND ar.metric_type = 'threat' ORDER BY ar.analyzed_at DESC LIMIT 1) as threat,
                    (SELECT score FROM analysis_results ar
                     WHERE ar.workspace_id = %s AND ar.competitor_name = wc.brand_name
                     AND ar.metric_type = 'wtp' ORDER BY ar.analyzed_at DESC LIMIT 1) as wtp
                FROM workspace_competitors wc
                WHERE wc.workspace_id = %s
            """,
                (workspace_id, workspace_id, workspace_id, workspace_id),
            )
            competitors = cur.fetchall()

            if not competitors:
                print(f"[INFO] No competitors for workspace {workspace_id}")
                return

            # Get latest profiles for enrichment — VALID_PROFILE_FILTER skips
            # auth-walled / silent-zero scrape rows that would feed the
            # narrative LLM with false "this brand is dead" signals (W3 fix).
            competitors_data = []
            for comp in competitors:
                cur.execute(
                    f"""
                    SELECT * FROM scraped_brand_profiles
                    WHERE brand_name = %s AND {VALID_PROFILE_FILTER}
                    ORDER BY scraped_at DESC LIMIT 1
                """,
                    (comp["brand_name"],),
                )
                profile = cur.fetchone() or {}

                comp_data = {
                    "brand_name": comp["brand_name"],
                    "momentum": float(comp["momentum"] or 50),
                    "threat": float(comp["threat"] or 50),
                    "wtp": float(comp["wtp"] or 50),
                    "avg_price": profile.get("avg_price"),
                    "followers": profile.get("follower_count"),
                    "engagement_metrics": profile.get("engagement_metrics", {}),
                }
                competitors_data.append(comp_data)

            print(
                f"[NARRATIVE] Generating for {len(competitors_data)} competitors "
                f"in workspace {workspace_id}"
            )

            # Step 1: Per-brand insights
            for comp_data in competitors_data:
                try:
                    scores = {
                        "momentum": comp_data["momentum"],
                        "threat": comp_data["threat"],
                        "wtp": comp_data["wtp"],
                    }
                    insight = generate_brand_insight(
                        comp_data["brand_name"],
                        scores,
                        comp_data,
                    )

                    # Store per-brand insight in analysis_results.
                    # NOTE (W2 audit, 2026-05-03): score=0 is INTENTIONAL —
                    # brand_insight is a narrative metric, not a numeric one.
                    # The real content lives in `ai_narrative`. Frontend
                    # CIAnalytics renders it via the "AI brand insights"
                    # panel (PR #29), NOT in the metric grid. If you see
                    # this metric showing as "0/100" in the UI, that's a
                    # frontend display bug — fix the renderer, don't change
                    # the score value here.
                    cur.execute(
                        """
                        INSERT INTO analysis_results
                            (workspace_id, competitor_name, metric_type, metric_version, score, ai_narrative)
                        VALUES (%s, %s, 'brand_insight', 'v1.0', 0, %s)
                    """,
                        (workspace_id, comp_data["brand_name"], insight),
                    )

                    print(f"  [Brand] {comp_data['brand_name']}: {insight[:60]}...")
                except Exception as e:
                    print(f"  [ERROR] Brand insight for {comp_data['brand_name']}: {e}")

            # Step 2: Cross-brand synthesis — skipped when brands_only=True
            # because the resulting analysis_narratives row is orphaned in V3.
            if not brands_only:
                try:
                    result = generate_workspace_narrative(dict(workspace), competitors_data)

                    # Store in analysis_narratives
                    cur.execute(
                        """
                        INSERT INTO analysis_narratives
                            (workspace_id, narrative, action_items)
                        VALUES (%s, %s, %s::jsonb)
                    """,
                        (
                            workspace_id,
                            result["narrative"],
                            json.dumps(result["action_items"], ensure_ascii=False),
                        ),
                    )

                    print(f"  [Synthesis] Narrative: {result['narrative'][:80]}...")
                    print(f"  [Synthesis] {len(result['action_items'])} action items generated")
                except Exception as e:
                    print(f"  [ERROR] Synthesis narrative: {e}")
            else:
                print("  [SKIP] Workspace-level synthesis skipped (brands_only=True)")

            conn.commit()
            print(f"[DONE] Narratives saved for workspace {workspace_id}")
    finally:
        conn.close()


def run_all_workspaces(brands_only: bool = False):
    """Generate narratives for all workspaces."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT id FROM workspaces")
            workspaces = cur.fetchall()
        for ws in workspaces:
            run_narrative_for_workspace(ws["id"], brands_only=brands_only)
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Generate CI narratives via LLM")
    parser.add_argument("--workspace-id", help="Generate for a specific workspace")
    parser.add_argument("--all", action="store_true", help="Generate for all workspaces")
    parser.add_argument(
        "--brands-only", action="store_true",
        help="Skip the workspace-level cross-brand synthesis (analysis_narratives). "
             "Per-brand brand_insight rows still get written. Use this in cron to "
             "avoid wasting LLM calls on orphaned data.",
    )
    args = parser.parse_args()

    if args.workspace_id:
        run_narrative_for_workspace(args.workspace_id, brands_only=args.brands_only)
    elif args.all:
        run_all_workspaces(brands_only=args.brands_only)
    else:
        print("Specify --workspace-id UUID or --all")
        sys.exit(1)


if __name__ == "__main__":
    main()
