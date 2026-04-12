"""
Consumer mindshare pipeline (metric_type: "consumer_mindshare").

Reframed for social data: measures how strongly consumers associate with
and engage around a brand, using XHS/Douyin social signals instead of
traditional e-commerce review data.

Data sources (all from daily scraper):
  - scraped_brand_profiles.engagement_metrics → total_likes, total_notes
  - scraped_brand_profiles.raw_dimensions.d6 → sentiment_keywords (positive/negative)
  - scraped_brand_profiles.raw_dimensions.d3 → top_notes (UGC engagement)
  - scraped_products (= XHS notes) → comment count as "review" proxy

Score formula:
  - Social engagement share (35pts): this brand's likes as % of all tracked competitors
  - UGC conversation volume (30pts): total notes/content mentioning the brand
  - Sentiment signal (20pts): ratio of positive vs negative sentiment keywords
  - Comment depth (15pts): avg comments per note (deeper = stronger mindshare)

Usage:
  python -m services.competitor_intel.pipelines.mindshare_pipeline --workspace-id UUID
  python -m services.competitor_intel.pipelines.mindshare_pipeline --all
"""

import argparse
import json
import sys
import traceback
from ..db_bridge import get_conn

METRIC_VERSION = "v1.1"


def run_for_workspace(workspace_id: str):
    """Compute consumer mindshare metrics for all competitors in a workspace."""
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

            # First pass: collect total likes per brand for relative share
            brand_engagement = {}
            for comp in competitors:
                brand = comp["brand_name"]
                cur.execute(
                    """
                    SELECT engagement_metrics, content_metrics, raw_dimensions
                    FROM scraped_brand_profiles
                    WHERE brand_name = %s
                    ORDER BY scraped_at DESC LIMIT 1
                    """,
                    (brand,),
                )
                profile = cur.fetchone()
                if profile:
                    em = profile.get("engagement_metrics") or {}
                    brand_engagement[brand] = {
                        "total_likes": em.get("total_likes") or 0,
                        "total_notes": em.get("total_notes") or 0,
                        "profile": profile,
                    }
                else:
                    brand_engagement[brand] = {
                        "total_likes": 0, "total_notes": 0, "profile": None,
                    }

            total_likes_all = sum(v["total_likes"] for v in brand_engagement.values()) or 1
            max_notes_all = max((v["total_notes"] for v in brand_engagement.values()), default=1) or 1

            total = len(competitors)
            print(f"[MINDSHARE] Analyzing {total} competitors (total_likes_all={total_likes_all})")

            for idx, comp in enumerate(competitors):
                brand = comp["brand_name"]
                be = brand_engagement[brand]
                profile = be["profile"]

                if not profile:
                    cur.execute(
                        """
                        INSERT INTO analysis_results
                            (workspace_id, competitor_name, metric_type,
                             metric_version, score, raw_inputs)
                        VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                        """,
                        (workspace_id, brand, "consumer_mindshare", METRIC_VERSION,
                         0, json.dumps({"error": "no_profile_data"})),
                    )
                    print(f"  [{idx+1}/{total}] {brand}: mindshare_score=0 (no data)")
                    continue

                total_likes = be["total_likes"]
                total_notes = be["total_notes"]

                # Engagement share: this brand's likes as % of all competitors
                engagement_share = (total_likes / total_likes_all) * 100

                # UGC volume: total notes relative to top competitor
                ugc_volume_ratio = total_notes / max_notes_all

                # Sentiment analysis from raw_dimensions.d6
                raw_dims = profile.get("raw_dimensions") or {}
                d6 = raw_dims.get("d6") or {}
                sentiment_keywords = d6.get("sentiment_keywords") or []
                positive_kw = d6.get("positive_keywords") or []
                negative_kw = d6.get("negative_keywords") or []

                # If we have structured positive/negative, use those
                # Otherwise try to split from combined list
                n_positive = len(positive_kw) if positive_kw else 0
                n_negative = len(negative_kw) if negative_kw else 0
                n_total_kw = n_positive + n_negative

                if n_total_kw > 0:
                    sentiment_ratio = n_positive / n_total_kw  # 1.0 = all positive
                else:
                    sentiment_ratio = 0.5  # neutral default

                # Comment depth: avg comments per note (from scraped_products = XHS notes)
                cur.execute(
                    """
                    SELECT COALESCE(AVG(review_count), 0) AS avg_comments,
                           COUNT(*) AS note_count
                    FROM scraped_products
                    WHERE brand_name = %s
                    AND scraped_at > NOW() - INTERVAL '30 days'
                    AND review_count IS NOT NULL AND review_count > 0
                    """,
                    (brand,),
                )
                comment_row = cur.fetchone()
                avg_comments = float(comment_row["avg_comments"]) if comment_row else 0
                note_count = int(comment_row["note_count"]) if comment_row else 0

                # Top UGC content from raw_dimensions.d3
                d3 = raw_dims.get("d3") or {}
                top_notes = d3.get("top_notes") or []
                top_ugc = [
                    {"title": n.get("title", "")[:40], "likes": n.get("likes", 0)}
                    for n in top_notes[:5]
                ]

                # ── Scoring ──────────────────────────────────────
                # Social engagement share (35pts)
                engagement_score = min(35, (engagement_share / 30) * 35)  # 30%+ share = full

                # UGC conversation volume (30pts)
                ugc_score = min(30, ugc_volume_ratio * 30)

                # Sentiment signal (20pts): 100% positive = 20, 50/50 = 10, all negative = 0
                sentiment_score = sentiment_ratio * 20

                # Comment depth (15pts): avg 50+ comments/note = full marks
                comment_score = min(15, (avg_comments / 50) * 15)

                score = max(0, min(100, round(engagement_score + ugc_score + sentiment_score + comment_score)))

                raw_inputs = {
                    "engagement_share_pct": round(engagement_share, 1),
                    "total_likes": total_likes,
                    "total_notes": total_notes,
                    "sentiment_ratio": round(sentiment_ratio, 2),
                    "positive_keywords": positive_kw[:10] if positive_kw else [],
                    "negative_keywords": negative_kw[:10] if negative_kw else [],
                    "avg_comments_per_note": round(avg_comments, 1),
                    "notes_with_comments": note_count,
                    "top_ugc": top_ugc,
                }

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
                        "consumer_mindshare",
                        METRIC_VERSION,
                        score,
                        json.dumps(raw_inputs, ensure_ascii=False),
                    ),
                )

                print(
                    f"  [{idx+1}/{total}] {brand}: mindshare_score={score}, "
                    f"share={engagement_share:.1f}%, sentiment={sentiment_ratio:.2f}, "
                    f"avg_comments={avg_comments:.1f}"
                )

            conn.commit()
            print(f"[DONE] Consumer mindshare analysis saved for workspace {workspace_id}")

    except Exception as e:
        print(f"[ERROR] Mindshare pipeline failed: {e}")
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
    parser = argparse.ArgumentParser(description="Run CI consumer mindshare pipeline")
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
