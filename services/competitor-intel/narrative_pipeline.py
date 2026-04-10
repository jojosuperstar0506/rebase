"""
AI narrative generation for CI vFinal.
Reads scores from analysis_results, generates narratives via Claude, stores in analysis_narratives.

Two-tier model cost:
- Haiku: per-brand dimension insights (~$0.001 per brand)
- Sonnet: cross-brand strategic synthesis (~$0.02 per workspace)
- Total target: <$0.05 per workspace per run

Usage:
  python -m services.competitor_intel.narrative_pipeline --workspace-id UUID
  python -m services.competitor_intel.narrative_pipeline --all
"""

import argparse
import json
import os
import sys

from anthropic import Anthropic

from .db_bridge import get_conn

client = Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

HAIKU_MODEL = "claude-haiku-4-5-20251001"
SONNET_MODEL = "claude-sonnet-4-20250514"


def generate_brand_insight(brand_name: str, scores: dict, profile: dict) -> str:
    """Generate a 2-3 sentence insight for a single brand using Haiku."""

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

    response = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )

    return response.content[0].text.strip()


def generate_workspace_narrative(workspace: dict, competitors_data: list) -> dict:
    """
    Generate cross-brand strategic narrative and action items using Sonnet.

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

    response = client.messages.create(
        model=SONNET_MODEL,
        max_tokens=1000,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()

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

            # Step 1: Per-brand insights via Haiku
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

                    print(f"  [Haiku] {comp_data['brand_name']}: {insight[:60]}...")
                except Exception as e:
                    print(f"  [ERROR] Haiku insight for {comp_data['brand_name']}: {e}")

            # Step 2: Cross-brand synthesis via Sonnet
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

                print(f"  [Sonnet] Narrative: {result['narrative'][:80]}...")
                print(f"  [Sonnet] {len(result['action_items'])} action items generated")
            except Exception as e:
                print(f"  [ERROR] Sonnet narrative: {e}")

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
    parser = argparse.ArgumentParser(description="Generate CI narratives via Claude")
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
