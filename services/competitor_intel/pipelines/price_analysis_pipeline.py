"""
Price positioning pipeline (metric_type: "price_positioning").

Reframed for social data: since our primary data sources (XHS/Douyin) don't
have real product prices, this pipeline analyzes pricing signals from:
  1. scraped_brand_profiles.avg_price + price_range (if populated)
  2. scraped_brand_profiles.raw_dimensions.d5 (Douyin shop products with prices)
  3. scraped_products entries that DO have prices (Douyin shop, SYCM imports)
  4. Falls back to profile-level pricing signals when product-level data is sparse

Score formula:
  - Price level vs category (35pts): where this brand sits relative to competitors
  - Price range breadth (25pts): broader = more market coverage
  - Discount signal (20pts): original_price vs price gap (where available)
  - Data confidence (20pts): how much real pricing data we have

Usage:
  python -m services.competitor_intel.pipelines.price_analysis_pipeline --workspace-id UUID
  python -m services.competitor_intel.pipelines.price_analysis_pipeline --all
"""

import argparse
import json
import sys
import traceback
from collections import Counter
from ..db_bridge import get_conn

METRIC_VERSION = "v1.2"

# Price bands (RMB) — common for Chinese e-commerce
PRICE_BANDS = [
    ("0-50", 0, 50),
    ("50-100", 50, 100),
    ("100-200", 100, 200),
    ("200-500", 200, 500),
    ("500-1000", 500, 1000),
    ("1000-2000", 1000, 2000),
    ("2000+", 2000, 999999),
]


def classify_price_band(price: float) -> str:
    for label, lo, hi in PRICE_BANDS:
        if lo <= price < hi:
            return label
    return "2000+"


def run_for_workspace(workspace_id: str):
    """Compute price positioning metrics for all competitors in a workspace."""
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

            # Get user's own price range for relative positioning
            user_price_range = workspace.get("brand_price_range") or ""
            user_mid_price = None
            if "-" in str(user_price_range):
                try:
                    parts = str(user_price_range).replace("¥", "").replace(",", "").split("-")
                    user_mid_price = (float(parts[0]) + float(parts[1])) / 2
                except (ValueError, IndexError):
                    pass

            # First pass: collect all known prices for category median
            all_avg_prices = []
            brand_price_data = {}

            for comp in competitors:
                brand = comp["brand_name"]

                # Strategy 1: Get product-level prices (if any real priced products exist)
                cur.execute(
                    """
                    SELECT price, original_price
                    FROM scraped_products
                    WHERE brand_name = %s AND price IS NOT NULL AND price > 0
                    AND scraped_at > NOW() - INTERVAL '30 days'
                    """,
                    (brand,),
                )
                priced_products = cur.fetchall()
                product_prices = [float(p["price"]) for p in priced_products if p.get("price")]
                original_prices = [
                    float(p["original_price"]) for p in priced_products
                    if p.get("original_price") and float(p["original_price"]) > 0
                ]

                # Strategy 2: Get profile-level pricing (avg_price, price_range)
                cur.execute(
                    """
                    SELECT avg_price, price_range, raw_dimensions
                    FROM scraped_brand_profiles
                    WHERE brand_name = %s
                    ORDER BY scraped_at DESC LIMIT 1
                    """,
                    (brand,),
                )
                profile = cur.fetchone()

                profile_avg_price = None
                profile_price_range = None

                if profile:
                    if profile.get("avg_price") and float(profile["avg_price"]) > 0:
                        profile_avg_price = float(profile["avg_price"])
                    pr = profile.get("price_range") or {}
                    if pr.get("min") and pr.get("max"):
                        profile_price_range = {
                            "min": float(pr["min"]),
                            "max": float(pr["max"]),
                        }

                    # Strategy 3: Check Douyin shop products in raw_dimensions.d5
                    raw_dims = profile.get("raw_dimensions") or {}
                    d5 = raw_dims.get("d5") or {}
                    shop_products = d5.get("top_selling_products") or []
                    for sp in shop_products:
                        p = sp.get("price")
                        if p:
                            try:
                                product_prices.append(float(str(p).replace("¥", "").replace(",", "")))
                            except (ValueError, TypeError):
                                pass

                # Determine best avg price estimate
                if product_prices:
                    avg_price = sum(product_prices) / len(product_prices)
                    data_source = "product_scrape"
                elif profile_avg_price:
                    avg_price = profile_avg_price
                    data_source = "profile_avg"
                elif profile_price_range:
                    avg_price = (profile_price_range["min"] + profile_price_range["max"]) / 2
                    data_source = "profile_range"
                else:
                    avg_price = None
                    data_source = "none"

                brand_price_data[brand] = {
                    "product_prices": product_prices,
                    "original_prices": original_prices,
                    "avg_price": avg_price,
                    "profile_avg_price": profile_avg_price,
                    "profile_price_range": profile_price_range,
                    "data_source": data_source,
                }

                if avg_price:
                    all_avg_prices.append(avg_price)

            category_median = sorted(all_avg_prices)[len(all_avg_prices) // 2] if all_avg_prices else None

            total = len(competitors)
            print(f"[PRICE] Analyzing {total} competitors (category_median={category_median})")

            for idx, comp in enumerate(competitors):
                brand = comp["brand_name"]
                pd = brand_price_data[brand]

                if not pd["avg_price"]:
                    cur.execute(
                        """
                        INSERT INTO analysis_results
                            (workspace_id, competitor_name, metric_type,
                             metric_version, score, raw_inputs)
                        VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                        """,
                        (workspace_id, brand, "price_positioning", METRIC_VERSION,
                         0, json.dumps({"error": "no_price_data", "data_source": "none"})),
                    )
                    print(f"  [{idx+1}/{total}] {brand}: price_score=0 (no price data)")
                    continue

                avg_price = pd["avg_price"]
                product_prices = pd["product_prices"]

                # Price band distribution (if product-level data exists)
                if product_prices:
                    band_counts = Counter(classify_price_band(p) for p in product_prices)
                    band_distribution = {b: band_counts.get(b, 0) for b, _, _ in PRICE_BANDS}
                    min_price = min(product_prices)
                    max_price = max(product_prices)
                    n_products = len(product_prices)
                    bands_with_products = sum(1 for v in band_distribution.values() if v > 0)
                elif pd["profile_price_range"]:
                    min_price = pd["profile_price_range"]["min"]
                    max_price = pd["profile_price_range"]["max"]
                    band_distribution = {}
                    n_products = 0
                    bands_with_products = 0
                    # Estimate bands from range
                    for label, lo, hi in PRICE_BANDS:
                        if min_price < hi and max_price >= lo:
                            bands_with_products += 1
                            band_distribution[label] = 1
                        else:
                            band_distribution[label] = 0
                else:
                    min_price = avg_price
                    max_price = avg_price
                    band_distribution = {b: 0 for b, _, _ in PRICE_BANDS}
                    band_label = classify_price_band(avg_price)
                    band_distribution[band_label] = 1
                    n_products = 0
                    bands_with_products = 1

                # Premium ratio: is this brand above category median?
                premium_ratio = 0.0
                if category_median and category_median > 0:
                    if product_prices:
                        premium_count = sum(1 for p in product_prices if p > category_median)
                        premium_ratio = premium_count / len(product_prices)
                    else:
                        premium_ratio = 1.0 if avg_price > category_median else 0.0

                # Discount depth (from original prices, if available)
                avg_discount_depth = 0.0
                if pd["original_prices"] and product_prices:
                    discounts = []
                    for pp, op in zip(product_prices, pd["original_prices"]):
                        if op > pp:
                            discounts.append((op - pp) / op)
                    if discounts:
                        avg_discount_depth = sum(discounts) / len(discounts)

                # Position vs user
                position_vs_user = None
                if user_mid_price and user_mid_price > 0:
                    position_vs_user = round(((avg_price - user_mid_price) / user_mid_price) * 100, 1)

                # ── Scoring ──────────────────────────────────────
                # Price level vs category (35pts): premium positioning gets more points
                if category_median and category_median > 0:
                    price_ratio = avg_price / category_median
                    # Above median: 20-35pts. At median: 17pts. Below: 0-17pts.
                    if price_ratio >= 1.5:
                        level_score = 35
                    elif price_ratio >= 1.0:
                        level_score = 17 + (price_ratio - 1.0) * 36  # 1.0→17, 1.5→35
                    else:
                        level_score = max(0, price_ratio * 17)  # 0→0, 1.0→17
                else:
                    level_score = 17  # neutral if no benchmark

                # Price range breadth (25pts): wider range = more coverage
                if max_price > min_price and min_price > 0:
                    breadth = (max_price - min_price) / min_price
                    breadth_score = min(25, (breadth / 3.0) * 25)  # 3x range = full marks
                else:
                    breadth_score = 5  # single price point = minimal

                # Discount signal (20pts): lower discount = stronger pricing power
                discount_score = max(0, 20 * (1 - avg_discount_depth / 0.5))

                # Data confidence (20pts): more real data = higher confidence
                if pd["data_source"] == "product_scrape" and n_products >= 10:
                    confidence_score = 20
                elif pd["data_source"] == "product_scrape":
                    confidence_score = 15
                elif pd["data_source"] == "profile_avg":
                    confidence_score = 10
                elif pd["data_source"] == "profile_range":
                    confidence_score = 8
                else:
                    confidence_score = 0

                score = max(0, min(100, round(level_score + breadth_score + discount_score + confidence_score)))

                # Derive price_level label for frontend badge
                if avg_price >= 2000:
                    price_level = "luxury"
                elif avg_price >= 500:
                    price_level = "premium"
                elif avg_price >= 100:
                    price_level = "mid-range"
                else:
                    price_level = "entry"

                raw_inputs = {
                    "avg_price": round(avg_price, 2),
                    "min_price": round(min_price, 2),
                    "max_price": round(max_price, 2),
                    "price_band_distribution": band_distribution,
                    "price_bands": band_distribution,  # alias for frontend PriceMap.tsx
                    "premium_ratio": round(premium_ratio * 100, 1),
                    "avg_discount_depth": round(avg_discount_depth * 100, 1),
                    "discount_depth": round(avg_discount_depth, 4),  # 0-1 ratio for PriceMap.tsx
                    "price_level": price_level,
                    "category_median": round(category_median, 2) if category_median else None,
                    "position_vs_user": position_vs_user,
                    "n_products": n_products,
                    "data_source": pd["data_source"],
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
                        "price_positioning",
                        METRIC_VERSION,
                        score,
                        json.dumps(raw_inputs, ensure_ascii=False),
                    ),
                )

                print(
                    f"  [{idx+1}/{total}] {brand}: price_score={score}, "
                    f"avg=¥{avg_price:.0f}, premium={premium_ratio*100:.0f}%, "
                    f"source={pd['data_source']}, products={n_products}"
                )

            conn.commit()
            print(f"[DONE] Price positioning analysis saved for workspace {workspace_id}")

    except Exception as e:
        print(f"[ERROR] Price analysis pipeline failed: {e}")
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
    parser = argparse.ArgumentParser(description="Run CI price positioning pipeline")
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
