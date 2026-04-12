"""
Voice volume pipeline (metric_type: "voice_volume").
Reads from scraped_brand_profiles, compares latest vs previous snapshot
for each brand, and computes growth rates for followers, content, engagement.

Usage:
  python -m services.competitor_intel.pipelines.voice_volume_pipeline --workspace-id UUID
  python -m services.competitor_intel.pipelines.voice_volume_pipeline --all
"""

import argparse
import json
import sys
import traceback
from ..db_bridge import get_conn

METRIC_VERSION = "v1.0"


def safe_growth(current: float, previous: float) -> float:
    """Compute percentage growth rate, handling zero/None."""
    if not previous or previous == 0:
        if current and current > 0:
            return 100.0  # New presence = 100% growth
        return 0.0
    return round(((current - previous) / previous) * 100, 2)


def run_for_workspace(workspace_id: str):
    """Compute voice volume metrics for all competitors in a workspace."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # Get workspace
            cur.execute("SELECT * FROM workspaces WHERE id = %s", (workspace_id,))
            workspace = cur.fetchone()
            if not workspace:
                print(f"[WARN] Workspace {workspace_id} not found")
                return

            # Get competitors
            cur.execute(
                "SELECT * FROM workspace_competitors WHERE workspace_id = %s",
                (workspace_id,),
            )
            competitors = cur.fetchall()

            if not competitors:
                print(f"[INFO] No competitors for workspace {workspace_id}")
                return

            total = len(competitors)
            print(f"[VOICE] Analyzing {total} competitors in workspace {workspace_id}")

            # Collect all brand follower totals for voice share calculation
            brand_followers = {}

            for comp in competitors:
                brand = comp["brand_name"]
                cur.execute(
                    """
                    SELECT * FROM scraped_brand_profiles
                    WHERE brand_name = %s
                    ORDER BY scraped_at DESC LIMIT 1
                    """,
                    (brand,),
                )
                latest = cur.fetchone()
                brand_followers[brand] = (latest.get("follower_count") or 0) if latest else 0

            total_followers = sum(brand_followers.values()) or 1  # avoid div by zero

            for idx, comp in enumerate(competitors):
                brand = comp["brand_name"]

                # Get latest and previous profiles for this brand
                cur.execute(
                    """
                    SELECT * FROM scraped_brand_profiles
                    WHERE brand_name = %s
                    ORDER BY scraped_at DESC LIMIT 2
                    """,
                    (brand,),
                )
                profiles = cur.fetchall()

                latest = profiles[0] if len(profiles) >= 1 else None
                previous = profiles[1] if len(profiles) >= 2 else None

                if not latest:
                    # No data at all
                    raw_inputs = {
                        "growth_rate": 0,
                        "voice_share_pct": 0,
                        "platform_breakdown": {},
                        "follower_growth": 0,
                        "content_growth": 0,
                        "engagement_growth": 0,
                    }
                    cur.execute(
                        """
                        INSERT INTO analysis_results
                            (workspace_id, competitor_name, metric_type,
                             metric_version, score, raw_inputs)
                        VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                        """,
                        (workspace_id, brand, "voice_volume", METRIC_VERSION,
                         0, json.dumps(raw_inputs)),
                    )
                    print(f"  [{idx+1}/{total}] {brand}: voice_score=0 (no data)")
                    continue

                # Extract metrics from latest
                latest_followers = latest.get("follower_count") or 0
                latest_engagement = latest.get("engagement_metrics") or {}
                latest_likes = latest_engagement.get("total_likes") or 0
                latest_content = latest.get("content_metrics") or {}
                latest_notes = latest_content.get("total_notes") or latest_engagement.get("total_notes") or 0

                # Extract metrics from previous (if exists)
                if previous:
                    prev_followers = previous.get("follower_count") or 0
                    prev_engagement = previous.get("engagement_metrics") or {}
                    prev_likes = prev_engagement.get("total_likes") or 0
                    prev_content = previous.get("content_metrics") or {}
                    prev_notes = prev_content.get("total_notes") or prev_engagement.get("total_notes") or 0
                else:
                    prev_followers = 0
                    prev_likes = 0
                    prev_notes = 0

                # Compute growth rates
                follower_growth = safe_growth(latest_followers, prev_followers)
                content_growth = safe_growth(latest_notes, prev_notes)
                engagement_growth = safe_growth(latest_likes, prev_likes)

                # Overall growth rate (weighted)
                overall_growth = round(
                    follower_growth * 0.30
                    + content_growth * 0.30
                    + engagement_growth * 0.40,
                    2,
                )

                # Voice share: this brand's followers as % of all tracked competitors
                voice_share_pct = round((brand_followers[brand] / total_followers) * 100, 2)

                # Platform breakdown
                platform = latest.get("platform") or "unknown"
                platform_breakdown = {
                    platform: {
                        "followers": latest_followers,
                        "likes": latest_likes,
                        "notes": latest_notes,
                        "follower_growth": follower_growth,
                        "content_growth": content_growth,
                        "engagement_growth": engagement_growth,
                    }
                }

                # Score (0-100): weighted growth rate, clamped
                # Map growth percentages to 0-100 score
                # 0% growth = 50 (neutral), +50% = 100 (max), -50% = 0 (min)
                def growth_to_score(g):
                    return max(0, min(100, round(50 + g)))

                score = round(
                    growth_to_score(follower_growth) * 0.30
                    + growth_to_score(content_growth) * 0.30
                    + growth_to_score(engagement_growth) * 0.40
                )
                score = max(0, min(100, score))

                raw_inputs = {
                    "growth_rate": overall_growth,
                    "voice_share_pct": voice_share_pct,
                    "platform_breakdown": platform_breakdown,
                    "follower_growth": follower_growth,
                    "content_growth": content_growth,
                    "engagement_growth": engagement_growth,
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
                        "voice_volume",
                        METRIC_VERSION,
                        score,
                        json.dumps(raw_inputs, ensure_ascii=False),
                    ),
                )

                print(
                    f"  [{idx+1}/{total}] {brand}: voice_score={score}, "
                    f"follower_growth={follower_growth}%, "
                    f"content_growth={content_growth}%, "
                    f"engagement_growth={engagement_growth}%, "
                    f"share={voice_share_pct}%"
                )

            conn.commit()
            print(f"[DONE] Voice volume analysis saved for workspace {workspace_id}")

    except Exception as e:
        print(f"[ERROR] Voice volume pipeline failed: {e}")
        traceback.print_exc()
    finally:
        conn.close()


def run_all_workspaces():
    """Run voice volume analysis for all workspaces."""
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
    parser = argparse.ArgumentParser(description="Run CI voice volume pipeline")
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
