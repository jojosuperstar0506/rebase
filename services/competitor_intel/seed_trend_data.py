"""Seed historical score data for testing trend charts."""
import random
import sys
from datetime import datetime, timedelta

from .db_bridge import get_conn


def seed_trends(workspace_id: str, days: int = 30):
    """Insert simulated historical scores for all competitors in a workspace."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # Get competitors
            cur.execute(
                "SELECT brand_name FROM workspace_competitors WHERE workspace_id = %s",
                (workspace_id,),
            )
            competitors = cur.fetchall()

            for comp in competitors:
                brand = comp["brand_name"]
                # Generate base scores
                base_momentum = random.randint(30, 80)
                base_threat = random.randint(20, 75)
                base_wtp = random.randint(25, 70)

                for day_offset in range(days, 0, -1):
                    date = datetime.now() - timedelta(days=day_offset)
                    # Random walk from base
                    m = max(0, min(100, base_momentum + random.randint(-3, 3)))
                    t = max(0, min(100, base_threat + random.randint(-3, 3)))
                    w = max(0, min(100, base_wtp + random.randint(-2, 2)))
                    base_momentum, base_threat, base_wtp = m, t, w

                    for metric, score in [
                        ("momentum", m),
                        ("threat", t),
                        ("wtp", w),
                    ]:
                        cur.execute(
                            """
                            INSERT INTO analysis_results
                                (workspace_id, competitor_name, metric_type, metric_version, score, analyzed_at)
                            VALUES (%s, %s, %s, 'v1.0', %s, %s)
                        """,
                            (workspace_id, brand, metric, score, date),
                        )

            conn.commit()
            print(
                f"[SEED] Seeded {days} days of trend data for {len(competitors)} competitors"
            )
    finally:
        conn.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            "Usage: python -m services.competitor_intel.seed_trend_data WORKSPACE_ID [DAYS]"
        )
        sys.exit(1)
    wid = sys.argv[1]
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    seed_trends(wid, days)
