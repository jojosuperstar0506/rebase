"""
Scoring pipeline for CI vFinal.
Reads scraped data from PostgreSQL, computes metrics, writes results back.

Usage:
  python -m services.competitor_intel.scoring_pipeline --workspace-id UUID
  python -m services.competitor_intel.scoring_pipeline --all
"""

import argparse
import json
import sys
from .db_bridge import get_conn

METRIC_VERSION = "v1.0"


def compute_scores_for_workspace(workspace_id: str):
    """Compute all scores for all competitors in a workspace."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # Get workspace info (for the user's own brand baseline)
            cur.execute("SELECT * FROM workspaces WHERE id = %s", (workspace_id,))
            workspace = cur.fetchone()
            if not workspace:
                print(f"[WARN] Workspace {workspace_id} not found")
                return

            # Get all competitors for this workspace
            cur.execute(
                "SELECT * FROM workspace_competitors WHERE workspace_id = %s",
                (workspace_id,),
            )
            competitors = cur.fetchall()

            if not competitors:
                print(f"[INFO] No competitors for workspace {workspace_id}")
                return

            print(
                f"[SCORE] Computing scores for {len(competitors)} competitors "
                f"in workspace {workspace_id}"
            )

            for comp in competitors:
                brand = comp["brand_name"]

                # Get latest scraped profile for this brand (any platform)
                cur.execute(
                    """
                    SELECT * FROM scraped_brand_profiles
                    WHERE brand_name = %s
                    ORDER BY scraped_at DESC LIMIT 1
                    """,
                    (brand,),
                )
                profile = cur.fetchone()

                # Get scraped products for this brand
                cur.execute(
                    """
                    SELECT * FROM scraped_products
                    WHERE brand_name = %s
                    AND scraped_at > NOW() - INTERVAL '30 days'
                    ORDER BY scraped_at DESC
                    """,
                    (brand,),
                )
                products = cur.fetchall()

                # Compute scores
                momentum = compute_momentum(profile, products)
                threat = compute_threat(profile, products, workspace)
                wtp = compute_wtp(profile, products)

                # Save each score
                for metric_type, score, raw_inputs in [
                    ("momentum", momentum["score"], momentum),
                    ("threat", threat["score"], threat),
                    ("wtp", wtp["score"], wtp),
                ]:
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
                            metric_type,
                            METRIC_VERSION,
                            score,
                            json.dumps(raw_inputs),
                        ),
                    )

                print(
                    f"  {brand}: momentum={momentum['score']}, "
                    f"threat={threat['score']}, wtp={wtp['score']}"
                )

            conn.commit()
            print(f"[DONE] Scores saved for workspace {workspace_id}")
    finally:
        conn.close()


def compute_momentum(profile: dict, products: list) -> dict:
    """
    Momentum Score (0-100): How fast is this brand growing?

    Inputs:
    - Follower count (proxy for brand reach)
    - Content volume (total notes/videos)
    - Engagement metrics (likes, comments)
    - Product count (catalog size)

    When we have temporal data (multiple snapshots), this will use growth rates.
    For now, uses absolute values normalized to 0-100.
    """
    if not profile:
        return {"score": 50, "reason": "no_data", "inputs": {}}

    followers = profile.get("follower_count") or 0
    engagement = profile.get("engagement_metrics") or {}
    total_likes = engagement.get("total_likes") or 0
    total_notes = engagement.get("total_notes") or 0
    product_count = len(products)

    # Normalize each factor to 0-100
    # These thresholds are calibrated for the Chinese handbag market
    follower_score = min(100, (followers / 100000) * 100)  # 100k = max
    content_score = min(100, (total_notes / 500) * 100)  # 500 notes = max
    engagement_score = min(100, (total_likes / 200000) * 100)  # 200k likes = max
    catalog_score = min(100, (product_count / 50) * 100)  # 50 products = max

    # Weighted average
    score = round(
        follower_score * 0.30
        + content_score * 0.25
        + engagement_score * 0.30
        + catalog_score * 0.15
    )

    return {
        "score": max(0, min(100, score)),
        "follower_score": round(follower_score),
        "content_score": round(content_score),
        "engagement_score": round(engagement_score),
        "catalog_score": round(catalog_score),
        "inputs": {
            "followers": followers,
            "total_notes": total_notes,
            "total_likes": total_likes,
            "product_count": product_count,
        },
    }


def compute_threat(profile: dict, products: list, workspace: dict) -> dict:
    """
    Threat Index (0-100): How much should the user worry about this competitor?

    Inputs:
    - Price overlap with user's brand
    - Market presence (followers, content volume)
    - Category overlap

    Higher = more threatening to the user's market position.
    """
    if not profile:
        return {"score": 50, "reason": "no_data", "inputs": {}}

    user_price_range = workspace.get("brand_price_range") or {}
    user_min = float(user_price_range.get("min", 200))
    user_max = float(user_price_range.get("max", 600))
    user_mid = (user_min + user_max) / 2

    comp_avg_price = float(profile.get("avg_price") or 0)
    followers = profile.get("follower_count") or 0
    engagement = profile.get("engagement_metrics") or {}
    total_likes = engagement.get("total_likes") or 0

    # Price overlap score: closer to user's price range = higher threat
    if comp_avg_price == 0:
        price_overlap = 50  # Unknown price = moderate threat
    else:
        price_distance = abs(comp_avg_price - user_mid) / max(user_mid, 1)
        price_overlap = max(0, 100 - (price_distance * 100))  # 0 distance = 100 overlap

    # Market presence score
    presence_score = min(100, (followers / 80000) * 100)

    # Engagement intensity
    engagement_score = min(100, (total_likes / 150000) * 100)

    # Product range overlap (how many products compete in user's price range)
    competing_products = 0
    for p in products:
        price = float(p.get("price") or 0)
        if user_min * 0.7 <= price <= user_max * 1.3:  # 30% buffer
            competing_products += 1
    product_overlap = min(100, (competing_products / 10) * 100)

    score = round(
        price_overlap * 0.35
        + presence_score * 0.25
        + engagement_score * 0.20
        + product_overlap * 0.20
    )

    return {
        "score": max(0, min(100, score)),
        "price_overlap": round(price_overlap),
        "presence_score": round(presence_score),
        "engagement_score": round(engagement_score),
        "product_overlap": round(product_overlap),
        "inputs": {
            "comp_avg_price": comp_avg_price,
            "user_price_range": f"{user_min}-{user_max}",
            "followers": followers,
            "competing_products": competing_products,
        },
    }


def compute_wtp(profile: dict, products: list) -> dict:
    """
    Willingness-to-Pay Score (0-100): How much price premium does this brand command?

    Version 1.0 methodology:
    - Compare brand's avg price to category average
    - Weight by sales performance (higher sales at higher price = higher WTP)
    - Adjust for material quality signals

    This will evolve. All scores are tagged with METRIC_VERSION.
    """
    if not profile or not products:
        return {"score": 50, "reason": "no_data", "version": METRIC_VERSION, "inputs": {}}

    comp_avg_price = float(profile.get("avg_price") or 0)

    # Calculate from actual product data if available
    prices = [float(p["price"]) for p in products if p.get("price")]
    volumes = [int(p["sales_volume"] or 0) for p in products if p.get("sales_volume")]

    if prices:
        comp_avg_price = sum(prices) / len(prices)
    avg_volume = sum(volumes) / len(volumes) if volumes else 0

    # Category baseline (Chinese women's bags market)
    # Will be dynamically computed from landscape data in future versions
    CATEGORY_AVG_PRICE = 350  # RMB
    CATEGORY_AVG_VOLUME = 2000  # units/month

    if comp_avg_price == 0:
        return {"score": 50, "reason": "no_price_data", "version": METRIC_VERSION, "inputs": {}}

    # Price premium: how much above/below category average
    price_premium = (comp_avg_price - CATEGORY_AVG_PRICE) / CATEGORY_AVG_PRICE

    # Sales outperformance: selling more or less than category average
    if CATEGORY_AVG_VOLUME > 0 and avg_volume > 0:
        sales_outperformance = (avg_volume - CATEGORY_AVG_VOLUME) / CATEGORY_AVG_VOLUME
    else:
        sales_outperformance = 0

    # WTP logic:
    # High price + high volume = very high WTP (brand commands premium AND sells well)
    # High price + low volume = moderate WTP (premium but niche)
    # Low price + high volume = low WTP (competing on price)
    # Low price + low volume = very low WTP

    if price_premium > 0 and sales_outperformance > 0:
        raw = 70 + (price_premium * 30) + (sales_outperformance * 20)
    elif price_premium > 0:
        raw = 50 + (price_premium * 25)
    elif sales_outperformance > 0:
        raw = 30 + (sales_outperformance * 20)
    else:
        raw = 20 + max(0, price_premium * 10)

    score = max(0, min(100, round(raw)))

    return {
        "score": score,
        "version": METRIC_VERSION,
        "price_premium": round(price_premium * 100, 1),
        "sales_outperformance": round(sales_outperformance * 100, 1),
        "inputs": {
            "avg_price": round(comp_avg_price),
            "avg_volume": round(avg_volume),
            "category_avg_price": CATEGORY_AVG_PRICE,
            "category_avg_volume": CATEGORY_AVG_VOLUME,
            "product_count": len(products),
        },
    }


def compute_all_workspaces():
    """Run scoring for all workspaces that have competitors."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT id FROM workspaces")
            workspaces = cur.fetchall()

        for ws in workspaces:
            compute_scores_for_workspace(ws["id"])
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Run CI scoring pipeline")
    parser.add_argument("--workspace-id", help="Score a specific workspace")
    parser.add_argument("--all", action="store_true", help="Score all workspaces")
    args = parser.parse_args()

    if args.workspace_id:
        compute_scores_for_workspace(args.workspace_id)
    elif args.all:
        compute_all_workspaces()
    else:
        print("Specify --workspace-id UUID or --all")
        sys.exit(1)


if __name__ == "__main__":
    main()
