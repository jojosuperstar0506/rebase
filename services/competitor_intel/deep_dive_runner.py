"""
Deep dive runner: full-depth analysis for a single brand.
Chains: update status -> score -> narrate -> detect alerts -> mark complete.

Called from Express via child_process.spawn when frontend requests a deep dive.
If real scrape data isn't available (local agent hasn't run), it runs analysis
on existing data at deep_dive depth.

Usage:
  python -m services.competitor_intel.deep_dive_runner \
    --job-id UUID --workspace-id UUID --brand "Songmont" --platform all
"""

import argparse
import json
import sys
import traceback

from .db_bridge import get_conn


def update_job_status(job_id: str, status: str, error: str = None, summary: dict = None):
    """Update the deep dive job status in PostgreSQL."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            if status == "scraping":
                cur.execute(
                    "UPDATE ci_deep_dive_jobs SET status = %s, started_at = NOW() WHERE id = %s",
                    (status, job_id),
                )
            elif status in ("complete", "failed"):
                cur.execute(
                    "UPDATE ci_deep_dive_jobs SET status = %s, completed_at = NOW(), error_message = %s, result_summary = %s WHERE id = %s",
                    (status, error, json.dumps(summary) if summary else None, job_id),
                )
            else:
                cur.execute(
                    "UPDATE ci_deep_dive_jobs SET status = %s WHERE id = %s",
                    (status, job_id),
                )
        conn.commit()
    finally:
        conn.close()


def run_deep_dive(job_id: str, workspace_id: str, brand_name: str, platform: str):
    """Execute the full deep dive pipeline for one brand."""
    print(f"[DEEP DIVE] Starting for {brand_name} (job {job_id})")

    try:
        # Step 1: Mark as scraping
        update_job_status(job_id, "scraping")

        # Check if we have any scraped data for this brand
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) as cnt FROM scraped_brand_profiles WHERE brand_name = %s",
                    (brand_name,),
                )
                has_data = cur.fetchone()["cnt"] > 0
        finally:
            conn.close()

        if not has_data:
            print(f"[DEEP DIVE] No scraped data for {brand_name}. Waiting for local agent to push data.")
            print(f"[DEEP DIVE] Run the scrape agent: python3 agent.py --brand {brand_name}")
            # Don't fail — proceed with whatever data exists (seed data, etc.)

        # Step 2: Run scoring for this workspace
        update_job_status(job_id, "scoring")
        print(f"[DEEP DIVE] Scoring {brand_name}...")

        from .scoring_pipeline import compute_scores_for_workspace

        compute_scores_for_workspace(workspace_id)

        # Step 3: Run narrative for this workspace
        update_job_status(job_id, "narrating")
        print(f"[DEEP DIVE] Generating narrative for {brand_name}...")

        try:
            from .narrative_pipeline import run_narrative_for_workspace

            run_narrative_for_workspace(workspace_id)
        except Exception as e:
            print(f"[DEEP DIVE] Narrative failed (non-fatal): {e}")

        # Step 4: Run alert detection
        print(f"[DEEP DIVE] Checking for alerts...")
        try:
            from .alert_detector import detect_alerts_for_workspace

            detect_alerts_for_workspace(workspace_id)
        except Exception as e:
            print(f"[DEEP DIVE] Alert detection failed (non-fatal): {e}")

        # Step 5: Build result summary
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                # Get latest scores
                cur.execute(
                    """
                    SELECT metric_type, score FROM analysis_results
                    WHERE workspace_id = %s AND competitor_name = %s
                    ORDER BY analyzed_at DESC
                """,
                    (workspace_id, brand_name),
                )
                scores_rows = cur.fetchall()

                scores = {}
                for row in scores_rows:
                    if row["metric_type"] not in scores:
                        scores[row["metric_type"]] = float(row["score"])
        finally:
            conn.close()

        summary = {
            "brand_name": brand_name,
            "scores": scores,
            "has_profile": has_data,
        }

        # Mark complete
        update_job_status(job_id, "complete", summary=summary)
        print(f"[DEEP DIVE] Complete for {brand_name}: {scores}")

    except Exception as e:
        print(f"[DEEP DIVE] Failed for {brand_name}: {e}")
        traceback.print_exc()
        update_job_status(job_id, "failed", error=str(e))


def main():
    parser = argparse.ArgumentParser(description="Run deep dive analysis")
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--workspace-id", required=True)
    parser.add_argument("--brand", required=True)
    parser.add_argument("--platform", default="all")
    args = parser.parse_args()

    run_deep_dive(args.job_id, args.workspace_id, args.brand, args.platform)


if __name__ == "__main__":
    main()
