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

import httpx

from .db_bridge import get_conn


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


def _call_llm(prompt: str, model: str, max_tokens: int = 1000) -> str:
    """Call the configured LLM and return the text response."""

    if LLM_CONFIG["provider"] == "anthropic":
        # Use Anthropic SDK format
        from anthropic import Anthropic

        client = Anthropic(api_key=LLM_CONFIG["api_key"])
        response = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text.strip()

    else:
        # OpenAI-compatible API (DeepSeek, Qwen, GLM)
        url = f"{LLM_CONFIG['base_url']}/chat/completions"
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

        resp = httpx.post(url, headers=headers, json=payload, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()


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

    return _call_llm(prompt, LLM_CONFIG["brand_model"], max_tokens=300)


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

    raw = _call_llm(prompt, LLM_CONFIG["synthesis_model"], max_tokens=1000)

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
        # If JSON parsing fails, use the raw text as narrative
        return {
            "narrative": raw[:500],
            "action_items": [],
        }


# ---------------------------------------------------------------------------
# Pipeline orchestration
# ---------------------------------------------------------------------------

def run_narrative_for_workspace(workspace_id: str):
    """Generate all narratives for a workspace."""
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

            # Get latest profiles for enrichment
            competitors_data = []
            for comp in competitors:
                cur.execute(
                    """
                    SELECT * FROM scraped_brand_profiles
                    WHERE brand_name = %s ORDER BY scraped_at DESC LIMIT 1
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

                    # Store per-brand insight in analysis_results
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

            # Step 2: Cross-brand synthesis
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

            conn.commit()
            print(f"[DONE] Narratives saved for workspace {workspace_id}")
    finally:
        conn.close()


def run_all_workspaces():
    """Generate narratives for all workspaces."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT id FROM workspaces")
            workspaces = cur.fetchall()
        for ws in workspaces:
            run_narrative_for_workspace(ws["id"])
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Generate CI narratives via LLM")
    parser.add_argument("--workspace-id", help="Generate for a specific workspace")
    parser.add_argument("--all", action="store_true", help="Generate for all workspaces")
    args = parser.parse_args()

    if args.workspace_id:
        run_narrative_for_workspace(args.workspace_id)
    elif args.all:
        run_all_workspaces()
    else:
        print("Specify --workspace-id UUID or --all")
        sys.exit(1)


if __name__ == "__main__":
    main()
