"""
Launch frequency pipeline (metric_type: "launch_frequency").

Reframed for social data: instead of tracking e-commerce product launches,
we track new content/note appearances as a proxy for brand activity cadence.
On XHS, a new note IS the brand's public-facing "launch" — new product
showcases, campaign posts, collection reveals all appear as notes.

Data sources:
  - scraped_products (= XHS notes): first scraped_at = "launch date"
  - scraped_brand_profiles.content_metrics: total_notes over time

Score formula:
  - Content launch frequency (40pts): new notes per week
  - Acceleration (30pts): is the pace increasing or decreasing?
  - Consistency (30pts): steady cadence = strong brand discipline

Usage:
  python -m services.competitor_intel.pipelines.launch_tracker_pipeline --workspace-id UUID
  python -m services.competitor_intel.pipelines.launch_tracker_pipeline --all
"""

import argparse
import json
import math
import sys
import traceback
from collections import Counter
from ..db_bridge import get_conn

METRIC_VERSION = "v1.1"


def run_for_workspace(workspace_id: str):
    """Compute launch frequency metrics for all competitors in a workspace."""
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

            total = len(competitors)
            print(f"[LAUNCH] Analyzing {total} competitors in workspace {workspace_id}")

            for idx, comp in enumerate(competitors):
                brand = comp["brand_name"]

                # Strategy 1: Count distinct content/notes first-seen per week
                cur.execute(
                    """
                    SELECT product_id, product_name, MIN(scraped_at) AS first_seen
                    FROM scraped_products
                    WHERE brand_name = %s
                    AND scraped_at > NOW() - INTERVAL '90 days'
                    GROUP BY product_id, product_name
                    ORDER BY first_seen DESC
                    """,
                    (brand,),
                )
                notes = cur.fetchall()

                # Strategy 2: If no product/note data, use profile content_metrics snapshots
                if not notes:
                    cur.execute(
                        """
                        SELECT content_metrics, engagement_metrics, scraped_at
                        FROM scraped_brand_profiles
                        WHERE brand_name = %s
                        ORDER BY scraped_at DESC LIMIT 10
                        """,
                        (brand,),
                    )
                    profiles = cur.fetchall()

                    if len(profiles) >= 2:
                        # Compute note growth between snapshots as launch proxy
                        deltas = []
                        for i in range(len(profiles) - 1):
                            newer = profiles[i]
                            older = profiles[i + 1]
                            nm = newer.get("engagement_metrics") or newer.get("content_metrics") or {}
                            om = older.get("engagement_metrics") or older.get("content_metrics") or {}
                            new_notes = nm.get("total_notes") or 0
                            old_notes = om.get("total_notes") or 0
                            if new_notes > old_notes:
                                deltas.append(new_notes - old_notes)

                        if deltas:
                            avg_new_per_snapshot = sum(deltas) / len(deltas)
                            # Rough estimate: snapshots are ~daily, so per-week ≈ avg * 7
                            est_per_week = avg_new_per_snapshot * 7

                            freq_score = min(40, (est_per_week / 5.0) * 40)
                            score = max(0, min(100, round(freq_score + 15 + 15)))  # neutral accel + consistency

                            raw_inputs = {
                                "total_launches_90d": int(sum(deltas)),
                                "avg_per_week": round(est_per_week, 2),
                                "acceleration_pct": 0.0,
                                "consistency_cv": 0.5,
                                "n_weeks_tracked": len(deltas),
                                "recent_launches": [],
                                "weekly_breakdown": {},
                                "data_source": "profile_delta",
                            }

                            cur.execute(
                                """
                                INSERT INTO analysis_results
                                    (workspace_id, competitor_name, metric_type,
                                     metric_version, score, raw_inputs)
                                VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                                """,
                                (workspace_id, brand, "launch_frequency", METRIC_VERSION,
                                 score, json.dumps(raw_inputs, ensure_ascii=False)),
                            )
                            print(f"  [{idx+1}/{total}] {brand}: launch_score={score} (profile delta)")
                            continue

                    # No data at all
                    cur.execute(
                        """
                        INSERT INTO analysis_results
                            (workspace_id, competitor_name, metric_type,
                             metric_version, score, raw_inputs)
                        VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                        """,
                        (workspace_id, brand, "launch_frequency", METRIC_VERSION,
                         0, json.dumps({"error": "no_content_data"})),
                    )
                    print(f"  [{idx+1}/{total}] {brand}: launch_score=0 (no data)")
                    continue

                # ── Primary path: note-level first-seen data ──

                # Count launches per week
                week_counts = Counter()
                for n in notes:
                    first_seen = n["first_seen"]
                    iso_year, iso_week, _ = first_seen.isocalendar()
                    week_key = f"{iso_year}-W{iso_week:02d}"
                    week_counts[week_key] += 1

                sorted_weeks = sorted(week_counts.keys())
                weekly_values = [week_counts[w] for w in sorted_weeks]
                n_weeks = len(weekly_values)

                total_launches = sum(weekly_values)
                avg_per_week = total_launches / max(n_weeks, 1)

                # Recent items for display
                recent_launches = [
                    {
                        "name": (n["product_name"] or "")[:50],
                        "date": n["first_seen"].isoformat()[:10],
                    }
                    for n in notes[:10]
                ]

                # Acceleration: compare last 4 weeks avg vs previous period avg
                if n_weeks >= 8:
                    recent_4 = sum(weekly_values[-4:]) / 4
                    prev_4 = sum(weekly_values[-8:-4]) / 4
                    acceleration = ((recent_4 - prev_4) / max(prev_4, 0.5)) * 100
                elif n_weeks > 4:
                    recent_4 = sum(weekly_values[-4:]) / 4
                    prev_rest = sum(weekly_values[:-4]) / (n_weeks - 4)
                    acceleration = ((recent_4 - prev_rest) / max(prev_rest, 0.5)) * 100
                elif n_weeks == 4:
                    # Only 4 weeks — not enough history to measure acceleration
                    acceleration = 0.0
                else:
                    acceleration = 0.0

                # Consistency: coefficient of variation
                if n_weeks >= 2:
                    mean = sum(weekly_values) / n_weeks
                    variance = sum((x - mean) ** 2 for x in weekly_values) / n_weeks
                    std_dev = math.sqrt(variance)
                    cv = (std_dev / mean) if mean > 0 else 0
                else:
                    cv = 0.0

                # ── Scoring ──────────────────────────────────────
                freq_score = min(40, (avg_per_week / 5.0) * 40)

                if acceleration > 0:
                    accel_score = min(30, (acceleration / 20.0) * 30)
                else:
                    accel_score = max(0, 15 + (acceleration / 40.0) * 15)

                if cv <= 0.3:
                    consistency_score = 30
                elif cv >= 1.5:
                    consistency_score = 0
                else:
                    consistency_score = 30 * (1 - (cv - 0.3) / 1.2)

                score = max(0, min(100, round(freq_score + accel_score + consistency_score)))

                raw_inputs = {
                    "total_launches_90d": total_launches,
                    "avg_per_week": round(avg_per_week, 2),
                    "acceleration_pct": round(acceleration, 1),
                    "consistency_cv": round(cv, 3),
                    "n_weeks_tracked": n_weeks,
                    "recent_launches": recent_launches,
                    "weekly_breakdown": {w: week_counts[w] for w in sorted_weeks[-12:]},
                    "data_source": "note_firstseen",
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
                        "launch_frequency",
                        METRIC_VERSION,
                        score,
                        json.dumps(raw_inputs, ensure_ascii=False),
                    ),
                )

                print(
                    f"  [{idx+1}/{total}] {brand}: launch_score={score}, "
                    f"total={total_launches}, avg/wk={avg_per_week:.1f}, "
                    f"accel={acceleration:.1f}%, cv={cv:.2f}"
                )

            conn.commit()
            print(f"[DONE] Launch frequency analysis saved for workspace {workspace_id}")

    except Exception as e:
        print(f"[ERROR] Launch tracker pipeline failed: {e}")
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
    parser = argparse.ArgumentParser(description="Run CI launch frequency pipeline")
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
