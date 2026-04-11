"""
Product ranking pipeline (metric_type: "trending_products").
Reads from scraped_products, ranks by sales_volume, detects new launches
and declining products, computes catalog freshness.

Usage:
  python -m services.competitor_intel.pipelines.product_ranking_pipeline --workspace-id UUID
  python -m services.competitor_intel.pipelines.product_ranking_pipeline --all
"""

import argparse
import json
import sys
import traceback
from ..db_bridge import get_conn

METRIC_VERSION = "v1.0"

# New launch window: products first seen within this many days
NEW_LAUNCH_DAYS = 14

# Decline threshold: if latest sales < previous * this factor, it's declining
DECLINE_THRESHOLD = 0.7  # 30% drop


def run_for_workspace(workspace_id: str):
    """Compute product ranking metrics for all competitors in a workspace."""
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
            print(f"[RANKING] Analyzing {total} competitors in workspace {workspace_id}")

            for idx, comp in enumerate(competitors):
                brand = comp["brand_name"]

                # Get all recent products sorted by sales_volume DESC
                cur.execute(
                    """
                    SELECT DISTINCT ON (product_id)
                        product_id, product_name, price, sales_volume,
                        category, scraped_at
                    FROM scraped_products
                    WHERE brand_name = %s
                    AND scraped_at > NOW() - INTERVAL '30 days'
                    ORDER BY product_id, scraped_at DESC
                    """,
                    (brand,),
                )
                latest_products = cur.fetchall()

                # Sort by sales_volume descending
                latest_products.sort(
                    key=lambda p: int(p.get("sales_volume") or 0), reverse=True
                )

                # Top products (top 10)
                top_products = []
                for p in latest_products[:10]:
                    top_products.append({
                        "name": p.get("product_name", ""),
                        "price": float(p["price"]) if p.get("price") else None,
                        "sales": int(p["sales_volume"]) if p.get("sales_volume") else 0,
                    })

                # Detect new launches: products first scraped within NEW_LAUNCH_DAYS
                cur.execute(
                    """
                    SELECT product_id, product_name, price, sales_volume,
                           MIN(scraped_at) AS first_seen
                    FROM scraped_products
                    WHERE brand_name = %s
                    GROUP BY product_id, product_name, price, sales_volume
                    HAVING MIN(scraped_at) > NOW() - INTERVAL '%s days'
                    """,
                    (brand, NEW_LAUNCH_DAYS),
                )
                new_launch_rows = cur.fetchall()
                new_launches = [
                    {
                        "name": r.get("product_name", ""),
                        "price": float(r["price"]) if r.get("price") else None,
                        "sales": int(r["sales_volume"]) if r.get("sales_volume") else 0,
                    }
                    for r in new_launch_rows
                ]

                # Detect declining products: compare latest vs previous snapshot
                declining = []
                for p in latest_products:
                    pid = p.get("product_id")
                    if not pid:
                        continue
                    cur.execute(
                        """
                        SELECT sales_volume, scraped_at
                        FROM scraped_products
                        WHERE brand_name = %s AND product_id = %s
                        ORDER BY scraped_at DESC
                        LIMIT 2
                        """,
                        (brand, pid),
                    )
                    snapshots = cur.fetchall()
                    if len(snapshots) >= 2:
                        latest_vol = int(snapshots[0].get("sales_volume") or 0)
                        prev_vol = int(snapshots[1].get("sales_volume") or 0)
                        if prev_vol > 0 and latest_vol < prev_vol * DECLINE_THRESHOLD:
                            declining.append({
                                "name": p.get("product_name", ""),
                                "price": float(p["price"]) if p.get("price") else None,
                                "sales": latest_vol,
                                "previous_sales": prev_vol,
                                "drop_pct": round(
                                    ((prev_vol - latest_vol) / prev_vol) * 100, 1
                                ),
                            })

                # Catalog freshness: % of products that are new launches
                total_products = len(latest_products)
                freshness_pct = round(
                    (len(new_launches) / total_products * 100) if total_products > 0 else 0,
                    1,
                )

                # Score (0-100):
                # - Catalog freshness contributes up to 40 pts (100% fresh = 40)
                # - Top product performance contributes up to 40 pts
                # - Low decline rate contributes up to 20 pts
                freshness_score = min(40, freshness_pct * 0.4)

                # Top product performance: based on top product sales volume
                top_sales = top_products[0]["sales"] if top_products else 0
                # 10000 units = max performance score
                performance_score = min(40, (top_sales / 10000) * 40)

                # Decline penalty: fewer declining products = higher score
                if total_products > 0:
                    decline_ratio = len(declining) / total_products
                    stability_score = max(0, 20 - (decline_ratio * 40))
                else:
                    stability_score = 10  # neutral when no data

                score = max(0, min(100, round(
                    freshness_score + performance_score + stability_score
                )))

                raw_inputs = {
                    "top_products": top_products,
                    "new_launches": new_launches,
                    "declining": declining[:10],  # cap at 10
                    "catalog_freshness_pct": freshness_pct,
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
                        "trending_products",
                        METRIC_VERSION,
                        score,
                        json.dumps(raw_inputs, ensure_ascii=False),
                    ),
                )

                print(
                    f"  [{idx+1}/{total}] {brand}: ranking_score={score}, "
                    f"products={total_products}, new={len(new_launches)}, "
                    f"declining={len(declining)}, freshness={freshness_pct}%"
                )

            conn.commit()
            print(f"[DONE] Product ranking analysis saved for workspace {workspace_id}")

    except Exception as e:
        print(f"[ERROR] Product ranking pipeline failed: {e}")
        traceback.print_exc()
    finally:
        conn.close()


def run_all_workspaces():
    """Run product ranking analysis for all workspaces."""
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
    parser = argparse.ArgumentParser(description="Run CI product ranking pipeline")
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
