"""
Scoring pipeline for CI vFinal.
Reads scraped data from PostgreSQL, computes metrics, writes results back.
Optionally tracks progress via ci_analysis_jobs table when --job-id is provided.

Usage:
  python -m services.competitor_intel.scoring_pipeline --workspace-id UUID
  python -m services.competitor_intel.scoring_pipeline --workspace-id UUID --job-id UUID
  python -m services.competitor_intel.scoring_pipeline --all
"""

import argparse
import json
import math
import sys
import traceback
from typing import Optional
from .db_bridge import get_conn
from .category_baselines import resolve_baseline

METRIC_VERSION = "v1.2"  # bumped for category-aware WTP baselines


def _log_normalize(value, cap: float) -> float:
    """
    Log-scale normalize a value to 0-100.

    Linear normalization broke on wide-range metrics: boutique brands (10K
    followers) and megabrands (10M followers) are 1000x apart but linear
    scaling clamps both to 100 past a low threshold. Log scale preserves
    differentiation across orders of magnitude.

    Formula: log10(value + 1) / log10(cap) * 100, clamped to [0, 100].

    Examples with cap=100M:
      value=100         ->  25.0
      value=10K         ->  50.0
      value=100K        ->  62.5
      value=1M          ->  75.0
      value=10M         ->  87.5
      value=100M        -> 100.0
    """
    try:
        v = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    if v <= 0:
        return 0.0
    return min(100.0, max(0.0, math.log10(v + 1) / math.log10(max(cap, 10)) * 100))


def update_job(job_id: str, **fields):
    """Update ci_analysis_jobs row. No-op if job_id is None.
    Special values: 'NOW()' is treated as SQL NOW() for timestamp columns."""
    if not job_id:
        return
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            sets = []
            vals = []
            for k, v in fields.items():
                if v == "NOW()":
                    sets.append(f"{k} = NOW()")
                else:
                    sets.append(f"{k} = %s")
                    vals.append(v)
            vals.append(job_id)
            cur.execute(
                f"UPDATE ci_analysis_jobs SET {', '.join(sets)} WHERE id = %s",
                vals,
            )
        conn.commit()
    except Exception as e:
        print(f"[WARN] Failed to update job {job_id}: {e}")
    finally:
        conn.close()


def compute_scores_for_workspace(workspace_id: str, job_id: str = None):
    """Compute all scores for all competitors in a workspace."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # Get workspace info (for the user's own brand baseline)
            cur.execute("SELECT * FROM workspaces WHERE id = %s", (workspace_id,))
            workspace = cur.fetchone()
            if not workspace:
                print(f"[WARN] Workspace {workspace_id} not found")
                update_job(job_id, status="failed", error_message="Workspace not found", completed_at="NOW()")
                return

            # Get all competitors for this workspace
            cur.execute(
                "SELECT * FROM workspace_competitors WHERE workspace_id = %s",
                (workspace_id,),
            )
            competitors = cur.fetchall()

            if not competitors:
                print(f"[INFO] No competitors for workspace {workspace_id}")
                update_job(job_id, status="failed", error_message="No competitors found", completed_at="NOW()")
                return

            total = len(competitors)
            print(
                f"[SCORE] Computing scores for {total} competitors "
                f"in workspace {workspace_id}"
            )

            # Mark job as scoring
            update_job(job_id, status="scoring", started_at="NOW()", total_brands=total)

            # Pre-pass: collect workspace-wide competitor prices/volumes so
            # WTP's median-of-set fallback has data when brand_category is
            # unknown. Each brand's per-brand prices/volumes are still
            # computed separately below for the actual score.
            ws_prices: list = []
            ws_volumes: list = []
            for comp in competitors:
                cur.execute(
                    """
                    SELECT price, sales_volume FROM scraped_products
                    WHERE brand_name = %s AND scraped_at > NOW() - INTERVAL '30 days'
                    """,
                    (comp["brand_name"],),
                )
                for row in cur.fetchall():
                    if row.get("price"):
                        ws_prices.append(float(row["price"]))
                    if row.get("sales_volume"):
                        ws_volumes.append(int(row["sales_volume"]))

            for idx, comp in enumerate(competitors):
                brand = comp["brand_name"]

                # Update progress
                update_job(job_id, completed_brands=idx, current_brand=brand)

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
                wtp = compute_wtp(
                    profile, products,
                    workspace=workspace,
                    workspace_competitor_prices=ws_prices,
                    workspace_competitor_volumes=ws_volumes,
                )

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
                    f"  [{idx+1}/{total}] {brand}: momentum={momentum['score']}, "
                    f"threat={threat['score']}, wtp={wtp['score']}"
                )

            # Mark scoring complete, move to narrating
            update_job(job_id, status="narrating", completed_brands=total, current_brand=None)

            conn.commit()
            print(f"[DONE] Scores saved for workspace {workspace_id}")

            # Mark job complete
            update_job(job_id, status="complete", completed_at="NOW()")

    except Exception as e:
        print(f"[ERROR] Scoring failed: {e}")
        traceback.print_exc()
        update_job(job_id, status="failed", error_message=str(e)[:500], completed_at="NOW()")
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

    # Normalize each factor to 0-100 using log scale so boutique brands
    # (10K followers) and megabrands (100M followers) both get meaningful
    # differentiation. Linear caps collapsed everything past a low threshold
    # to 100 (e.g. Adidas 13.68M and 安踏 6.16M both clamped to 100).
    follower_score = _log_normalize(followers, cap=100_000_000)   # 100M = max
    content_score = _log_normalize(total_notes, cap=10_000)       # 10K posts = max
    engagement_score = _log_normalize(total_likes, cap=1_000_000_000)  # 1B likes = max
    catalog_score = _log_normalize(product_count, cap=500)        # 500 products = max

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

    # Market presence score (log-scaled — see compute_momentum for rationale)
    presence_score = _log_normalize(followers, cap=100_000_000)

    # Engagement intensity (log-scaled)
    engagement_score = _log_normalize(total_likes, cap=1_000_000_000)

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


def compute_wtp(profile: dict, products: list, workspace: Optional[dict] = None,
                workspace_competitor_prices: Optional[list] = None,
                workspace_competitor_volumes: Optional[list] = None) -> dict:
    """
    Willingness-to-Pay Score (0-100): How much price premium does this brand command?

    Methodology:
    - Compare brand's avg price to a CATEGORY-AWARE baseline (v1.2)
    - Weight by sales outperformance vs category baseline
    - Combined into a tier ladder (premium+volume / premium-only / volume-only / weak)

    The baseline comes from category_baselines.resolve_baseline() — driven by
    workspace.brand_category. Falls back to median-of-tracked-competitors when
    category is unknown but we have ≥3 priced competitors. Final fallback is
    a generic baseline (¥350 / 2000) — same as the old hardcoded values, but
    now flagged in raw_inputs.baseline_source for transparency.

    Earlier versions (≤ v1.1) hardcoded ¥350 / 2000 globally. That was correct
    for Chinese handbags but ~3× wrong for sportswear and ~5× wrong for food,
    causing every non-handbag workspace to receive uncalibrated WTP scores.
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

    if comp_avg_price == 0:
        return {"score": 50, "reason": "no_price_data", "version": METRIC_VERSION, "inputs": {}}

    # Category-aware baseline — replaces the old hardcoded ¥350 / 2000.
    brand_category = (workspace or {}).get("brand_category")
    baseline = resolve_baseline(
        brand_category,
        competitor_prices=workspace_competitor_prices,
        competitor_volumes=workspace_competitor_volumes,
    )
    category_avg_price = baseline["avg_price"]
    category_avg_volume = baseline["avg_volume"]

    # Price premium: how much above/below category average
    price_premium = (comp_avg_price - category_avg_price) / category_avg_price

    # Sales outperformance: selling more or less than category average
    if category_avg_volume > 0 and avg_volume > 0:
        sales_outperformance = (avg_volume - category_avg_volume) / category_avg_volume
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
        "baseline_source": baseline["source"],     # 'category' | 'keyword_match' | 'workspace_median' | 'generic_fallback'
        "baseline_category": baseline["label"],    # human-readable e.g. "运动鞋服"
        "inputs": {
            "avg_price": round(comp_avg_price),
            "avg_volume": round(avg_volume),
            "category_avg_price": round(category_avg_price),
            "category_avg_volume": round(category_avg_volume),
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
    parser.add_argument("--job-id", help="Analysis job ID for progress tracking")
    parser.add_argument("--all", action="store_true", help="Score all workspaces")
    args = parser.parse_args()

    if args.workspace_id:
        compute_scores_for_workspace(args.workspace_id, job_id=args.job_id)
    elif args.all:
        compute_all_workspaces()
    else:
        print("Specify --workspace-id UUID or --all")
        sys.exit(1)


if __name__ == "__main__":
    main()
