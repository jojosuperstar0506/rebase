"""
Detects significant score changes and creates alerts.
Called after every scoring run.

Alert triggers:
- Score jumps >10 points in any metric (warning)
- Score jumps >20 points (critical)

Usage:
  python -m services.competitor_intel.alert_detector --workspace-id UUID
  python -m services.competitor_intel.alert_detector --all
"""

import argparse
import sys

from .db_bridge import get_conn

# Alert thresholds
SCORE_CHANGE_WARNING = 10
SCORE_CHANGE_CRITICAL = 20

METRIC_LABELS = {
    "momentum": {"en": "Momentum", "zh": "增长势能"},
    "threat": {"en": "Threat Index", "zh": "威胁指数"},
    "wtp": {"en": "WTP Score", "zh": "支付意愿"},
}


def _severity_for_change(change):
    return "critical" if abs(change) >= SCORE_CHANGE_CRITICAL else "warning"


def detect_alerts_for_workspace(workspace_id: str):
    """Check for significant score changes in a workspace."""
    conn = get_conn()
    alerts_created = 0

    try:
        with conn.cursor() as cur:
            # Get all competitors
            cur.execute(
                "SELECT brand_name FROM workspace_competitors WHERE workspace_id = %s",
                (workspace_id,),
            )
            competitors = cur.fetchall()

            for comp in competitors:
                brand = comp["brand_name"]

                for metric in ["momentum", "threat", "wtp"]:
                    # Get two most recent scores for this metric
                    cur.execute(
                        """
                        SELECT score, analyzed_at
                        FROM analysis_results
                        WHERE workspace_id = %s AND competitor_name = %s AND metric_type = %s
                        ORDER BY analyzed_at DESC LIMIT 2
                    """,
                        (workspace_id, brand, metric),
                    )
                    scores = cur.fetchall()

                    if len(scores) < 2:
                        continue

                    current = float(scores[0]["score"])
                    previous = float(scores[1]["score"])
                    change = current - previous

                    if abs(change) < SCORE_CHANGE_WARNING:
                        continue

                    # Significant change detected
                    direction = "上升" if change > 0 else "下降"
                    metric_zh = METRIC_LABELS[metric]["zh"]
                    severity = _severity_for_change(change)

                    message = f"{brand}的{metric_zh}{direction}了{abs(change):.0f}分 ({previous:.0f} → {current:.0f})"

                    # Check if we already created this alert recently (within 24h)
                    cur.execute(
                        """
                        SELECT 1 FROM ci_alerts
                        WHERE workspace_id = %s AND competitor_name = %s
                          AND metric_type = %s AND created_at > NOW() - INTERVAL '24 hours'
                        LIMIT 1
                    """,
                        (workspace_id, brand, metric),
                    )

                    if cur.fetchone():
                        continue  # Don't duplicate alerts

                    # Create alert
                    cur.execute(
                        """
                        INSERT INTO ci_alerts
                            (workspace_id, competitor_name, alert_type, metric_type,
                             previous_value, current_value, change_amount, severity, message)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                        (
                            workspace_id,
                            brand,
                            "score_change",
                            metric,
                            previous,
                            current,
                            change,
                            severity,
                            message,
                        ),
                    )
                    alerts_created += 1
                    print(f"  [ALERT] {severity.upper()}: {message}")

            conn.commit()
            print(f"[DONE] {alerts_created} alerts created for workspace {workspace_id}")
    finally:
        conn.close()

    return alerts_created


def detect_all_workspaces():
    """Run alert detection for all workspaces."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT id FROM workspaces")
            workspaces = cur.fetchall()
        total = 0
        for ws in workspaces:
            total += detect_alerts_for_workspace(ws["id"])
        print(f"[TOTAL] {total} alerts across {len(workspaces)} workspaces")
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Detect CI score change alerts")
    parser.add_argument("--workspace-id", help="Check a specific workspace")
    parser.add_argument("--all", action="store_true", help="Check all workspaces")
    args = parser.parse_args()

    if args.workspace_id:
        detect_alerts_for_workspace(args.workspace_id)
    elif args.all:
        detect_all_workspaces()
    else:
        print("Specify --workspace-id UUID or --all")
        sys.exit(1)


if __name__ == "__main__":
    main()
