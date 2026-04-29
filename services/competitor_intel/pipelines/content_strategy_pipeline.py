"""
Content strategy pipeline (metric_type: "content_strategy").

Measures a brand's content output effectiveness using XHS/Douyin social metrics.

Data sources:
  - scraped_brand_profiles.engagement_metrics → total_likes, total_notes
  - scraped_brand_profiles.content_metrics → content_types distribution
  - scraped_brand_profiles.raw_dimensions.d3 → top_notes with per-note engagement
  - scraped_products (= XHS notes) → per-note likes and comments for efficiency calc

Score formula:
  - Content volume (25pts): total notes/posts relative to competitors
  - Engagement efficiency (35pts): avg likes per note (high = content resonates)
  - Content diversity (20pts): variety of content types (reviews, tutorials, hauls, etc.)
  - Posting consistency (20pts): stable output across snapshots

Usage:
  python -m services.competitor_intel.pipelines.content_strategy_pipeline --workspace-id UUID
  python -m services.competitor_intel.pipelines.content_strategy_pipeline --all
"""

import argparse
import json
import math
import sys
import traceback
from ..db_bridge import get_conn

METRIC_VERSION = "v1.3"  # bumped: emit reason='no_data' on the no-notes floor


def run_for_workspace(workspace_id: str):
    """Compute content strategy metrics for all competitors in a workspace."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM workspaces WHERE id = %s", (workspace_id,))
            workspace = cur.fetchone()
            if not workspace:
                print(f"[WARN] Workspace {workspace_id} not found")
                return

            cur.execute(
                "SELECT * FROM workspace_competitors WHERE workspace_id = %s",
                (workspace_id,),
            )
            competitors = cur.fetchall()
            if not competitors:
                print(f"[INFO] No competitors for workspace {workspace_id}")
                return

            # First pass: find max volume for relative comparison
            brand_profiles = {}
            max_notes = 1
            max_likes = 1

            for comp in competitors:
                brand = comp["brand_name"]
                cur.execute(
                    """
                    SELECT * FROM scraped_brand_profiles
                    WHERE brand_name = %s
                    ORDER BY scraped_at DESC LIMIT 5
                    """,
                    (brand,),
                )
                profiles = cur.fetchall()
                brand_profiles[brand] = profiles

                if profiles:
                    latest = profiles[0]
                    em = latest.get("engagement_metrics") or {}
                    cm = latest.get("content_metrics") or {}
                    notes = em.get("total_notes") or cm.get("total_notes") or 0
                    likes = em.get("total_likes") or 0
                    max_notes = max(max_notes, notes)
                    max_likes = max(max_likes, likes)

            total = len(competitors)
            print(f"[CONTENT] Analyzing {total} competitors (max_notes={max_notes})")

            for idx, comp in enumerate(competitors):
                brand = comp["brand_name"]
                profiles = brand_profiles[brand]

                if not profiles:
                    cur.execute(
                        """
                        INSERT INTO analysis_results
                            (workspace_id, competitor_name, metric_type,
                             metric_version, score, raw_inputs)
                        VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                        """,
                        (workspace_id, brand, "content_strategy", METRIC_VERSION,
                         0, json.dumps({"error": "no_profile_data"})),
                    )
                    print(f"  [{idx+1}/{total}] {brand}: content_score=0 (no data)")
                    continue

                latest = profiles[0]
                em = latest.get("engagement_metrics") or {}
                cm = latest.get("content_metrics") or {}
                raw_dims = latest.get("raw_dimensions") or {}

                # Core metrics from profile
                total_notes = em.get("total_notes") or cm.get("total_notes") or 0
                total_likes = em.get("total_likes") or 0
                total_collects = em.get("total_collects") or 0
                total_comments = em.get("total_comments") or 0

                # Engagement per note
                total_engagement = total_likes + total_collects + total_comments
                engagement_per_note = (total_engagement / total_notes) if total_notes > 0 else 0

                # Volume share
                volume_share = (total_notes / max_notes) * 100 if max_notes > 0 else 0

                # Content type diversity from d3 or content_metrics
                content_types = cm.get("content_types") or {}
                d3 = raw_dims.get("d3") or {}
                if not content_types and d3.get("content_types"):
                    content_types = d3["content_types"]
                n_content_types = len(content_types) if isinstance(content_types, dict) else 0

                # Top performing content from d3.top_notes
                top_notes = d3.get("top_notes") or []
                top_content = [
                    {
                        "title": n.get("title", "")[:40],
                        "likes": n.get("likes", 0),
                        "type": n.get("type", ""),
                    }
                    for n in top_notes[:5]
                ]

                # Per-note engagement from scraped_products (more granular)
                cur.execute(
                    """
                    SELECT AVG(sales_volume) AS avg_likes,
                           AVG(review_count) AS avg_comments,
                           COUNT(*) AS n_notes
                    FROM scraped_products
                    WHERE brand_name = %s
                    AND scraped_at > NOW() - INTERVAL '30 days'
                    """,
                    (brand,),
                )
                note_stats = cur.fetchone()
                if note_stats and note_stats["n_notes"] and int(note_stats["n_notes"]) > 0:
                    granular_avg_likes = float(note_stats["avg_likes"] or 0)
                    granular_avg_comments = float(note_stats["avg_comments"] or 0)
                    # Use granular data if available (more accurate than profile-level)
                    if granular_avg_likes > 0:
                        engagement_per_note = granular_avg_likes + granular_avg_comments

                # Posting consistency: compare note counts across snapshots
                cv = 0.5  # default neutral
                avg_delta = 0
                if len(profiles) >= 2:
                    deltas = []
                    for i in range(len(profiles) - 1):
                        nem = profiles[i].get("engagement_metrics") or profiles[i].get("content_metrics") or {}
                        oem = profiles[i + 1].get("engagement_metrics") or profiles[i + 1].get("content_metrics") or {}
                        new_n = nem.get("total_notes") or 0
                        old_n = oem.get("total_notes") or 0
                        delta = max(0, new_n - old_n)
                        deltas.append(delta)

                    if deltas and len(deltas) >= 2:
                        mean_delta = sum(deltas) / len(deltas)
                        var_delta = sum((d - mean_delta) ** 2 for d in deltas) / len(deltas)
                        std_delta = math.sqrt(var_delta)
                        cv = (std_delta / mean_delta) if mean_delta > 0 else 0
                        avg_delta = mean_delta

                # ── Scoring ──────────────────────────────────────
                # Content volume (25pts)
                volume_score = min(25, (total_notes / max_notes) * 25)

                # Engagement efficiency (35pts)
                # 500+ engagement/note = full marks (strong content resonance)
                eff_score = min(35, (engagement_per_note / 500) * 35)

                # Content diversity (20pts): 5+ types = full marks
                diversity_score = min(20, (n_content_types / 5) * 20)

                # Posting consistency (20pts)
                if cv <= 0.3:
                    consistency_score = 20
                elif cv >= 1.5:
                    consistency_score = 0
                else:
                    consistency_score = 20 * (1 - (cv - 0.3) / 1.2)

                score = max(0, min(100, round(volume_score + eff_score + diversity_score + consistency_score)))

                raw_inputs = {
                    "total_notes": total_notes,
                    "total_posts": total_notes,  # alias for frontend ContentLabels.tsx
                    "total_likes": total_likes,
                    "total_collects": total_collects,
                    "total_comments": total_comments,
                    "engagement_per_note": round(engagement_per_note, 1),
                    "engagement_per_post": round(engagement_per_note, 1),  # alias for frontend
                    "volume_share_pct": round(volume_share, 1),
                    "content_types": content_types,
                    "content_type_count": content_types,  # alias for frontend ContentLabels.tsx
                    "n_content_types": n_content_types,
                    "posting_consistency_cv": round(cv, 3),
                    "avg_new_notes_per_snapshot": round(avg_delta, 1),
                    "top_content": top_content,
                    "platform": latest.get("platform") or "unknown",
                }
                # When this brand has zero scraped notes, the score is purely
                # a sum of neutral floors (consistency_score=20 by default,
                # everything else=0) — that's where the '17' default came from.
                # Tag it so domain_aggregation_pipeline excludes it from the
                # marketing_domain rollup. Without this tag every Douyin-only
                # brand contributes a fake 17 and marketing_domain looks
                # identical (51) across competitors.
                if total_notes == 0:
                    raw_inputs["reason"] = "no_data"

                cur.execute(
                    """
                    INSERT INTO analysis_results
                        (workspace_id, competitor_name, metric_type,
                         metric_version, score, raw_inputs)
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                    """,
                    (
                        workspace_id,
                        brand,
                        "content_strategy",
                        METRIC_VERSION,
                        score,
                        json.dumps(raw_inputs, ensure_ascii=False),
                    ),
                )

                print(
                    f"  [{idx+1}/{total}] {brand}: content_score={score}, "
                    f"notes={total_notes}, eng/note={engagement_per_note:.0f}, "
                    f"types={n_content_types}, cv={cv:.2f}"
                )

            conn.commit()
            print(f"[DONE] Content strategy analysis saved for workspace {workspace_id}")

    except Exception as e:
        print(f"[ERROR] Content strategy pipeline failed: {e}")
        traceback.print_exc()
    finally:
        conn.close()


def run_all_workspaces():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT id FROM workspaces")
            workspaces = cur.fetchall()
        for ws in workspaces:
            run_for_workspace(ws["id"])
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Run CI content strategy pipeline")
    parser.add_argument("--workspace-id", help="Analyze a specific workspace")
    parser.add_argument("--all", action="store_true", help="Analyze all workspaces")
    args = parser.parse_args()

    if args.workspace_id:
        run_for_workspace(args.workspace_id)
    elif args.all:
        run_all_workspaces()
    else:
        print("Specify --workspace-id UUID or --all")
        sys.exit(1)


if __name__ == "__main__":
    main()
