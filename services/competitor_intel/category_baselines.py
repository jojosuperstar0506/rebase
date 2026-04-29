"""
Category-aware scoring baselines.

Single source of truth for per-category numeric baselines used by scorers
that need to know "what's normal for this kind of brand." Replaces the
hardcoded ¥350 / 2000 units-per-month constants that used to live in
scoring_pipeline.compute_wtp() and which broke every workspace that
wasn't a Chinese handbag brand.

Workspace.brand_category strings come from the frontend (CISettings.tsx
CATEGORIES list): 女包 / 男包 / 箱包配件 / 鞋类 / 服饰 / 其他, plus
sportswear-equivalents we expect from non-OMI customers.

Resolution order:
  1. exact match on brand_category string
  2. regex/keyword match (e.g., "运动鞋类" matches the sportswear bucket)
  3. fall back to median-of-tracked-competitors when caller provides them
  4. final fallback: GENERIC defaults — flagged in raw_inputs.reason

Add new categories by appending to CATEGORY_BASELINES — no other file
needs to change. Keep the schema flat (avg_price + avg_volume) for now;
expand later if a metric needs more dimensions.
"""

from typing import Iterable, Optional


class CategoryBaseline:
    """
    Numeric reference values for a category.

    Fields:
        avg_price:    typical mid-tier price point in RMB
        avg_volume:   typical monthly units sold for a mid-tier SKU
        label:        human-readable category name (Chinese)
        keywords:     phrases that map free-text brand_category strings here

    All values are rough order-of-magnitude — they only need to be in the
    right ballpark for the WTP / pricing signals to behave sensibly.
    """

    def __init__(self, key: str, avg_price: float, avg_volume: float,
                 label: str, keywords: Iterable[str]):
        self.key = key
        self.avg_price = avg_price
        self.avg_volume = avg_volume
        self.label = label
        self.keywords = tuple(keywords)


# ─── Category catalog ────────────────────────────────────────────────────
# Calibrated against typical Chinese e-commerce data (XHS / Tmall / Douyin
# top-100 by category, 2025-2026). Update as we get more real data.

CATEGORY_BASELINES: list[CategoryBaseline] = [
    CategoryBaseline(
        key="womens_bags",
        avg_price=350,
        avg_volume=2000,
        label="女包",
        keywords=("女包", "女士包", "女款包", "women's bag", "women bag", "ladies bag"),
    ),
    CategoryBaseline(
        key="mens_bags",
        avg_price=420,
        avg_volume=1500,
        label="男包",
        keywords=("男包", "男士包", "men's bag", "men bag"),
    ),
    CategoryBaseline(
        key="luggage_accessories",
        avg_price=280,
        avg_volume=2500,
        label="箱包配件",
        keywords=("箱包", "配件", "luggage", "accessories"),
    ),
    CategoryBaseline(
        key="sportswear",
        avg_price=799,
        avg_volume=1200,
        label="运动鞋服",
        keywords=("运动鞋", "运动服", "sportswear", "sneakers", "athletic", "运动",
                  "跑鞋", "篮球鞋", "球鞋"),
    ),
    CategoryBaseline(
        key="footwear",
        avg_price=380,
        avg_volume=1800,
        label="鞋类",
        keywords=("鞋类", "鞋子", "shoes", "footwear", "靴", "靴子"),
    ),
    CategoryBaseline(
        key="apparel",
        avg_price=220,
        avg_volume=4000,
        label="服饰",
        keywords=("服饰", "服装", "女装", "男装", "apparel", "clothing", "fashion"),
    ),
    CategoryBaseline(
        key="beauty",
        avg_price=180,
        avg_volume=8000,
        label="美妆",
        keywords=("美妆", "化妆品", "护肤", "彩妆", "beauty", "cosmetics", "skincare"),
    ),
    CategoryBaseline(
        key="food_beverage",
        avg_price=68,
        avg_volume=10000,
        label="食品饮料",
        keywords=("食品", "饮料", "零食", "food", "snack", "beverage"),
    ),
    CategoryBaseline(
        key="electronics",
        avg_price=899,
        avg_volume=1000,
        label="数码",
        keywords=("数码", "电子", "electronics", "tech", "智能"),
    ),
]

# Final fallback for unknown categories — broad market avg.
GENERIC_FALLBACK = CategoryBaseline(
    key="generic",
    avg_price=350,
    avg_volume=2000,
    label="通用",
    keywords=("其他", "generic", "other"),
)


def resolve_baseline(
    brand_category: Optional[str],
    competitor_prices: Optional[Iterable[float]] = None,
    competitor_volumes: Optional[Iterable[int]] = None,
) -> dict:
    """
    Get the right baseline for a workspace.

    Resolution order:
      1. Exact key match on brand_category (e.g., "女包" → womens_bags)
      2. Substring/keyword match (e.g., "运动鞋类" → sportswear)
      3. If competitor_prices/volumes are provided AND have ≥3 data points,
         compute median-of-competitors as the baseline (self-tuning path)
      4. GENERIC_FALLBACK with reason='unknown_category'

    Returns a dict with:
        avg_price:    float
        avg_volume:   float
        label:        str
        source:       'category' | 'keyword_match' | 'workspace_median' | 'generic_fallback'
        category_key: str
    """
    cat = (brand_category or "").strip().lower()

    # 1 + 2 — string match
    if cat:
        for b in CATEGORY_BASELINES:
            if cat == b.label.lower() or cat == b.key.lower():
                return _baseline_dict(b, source="category")
        for b in CATEGORY_BASELINES:
            for kw in b.keywords:
                if kw.lower() in cat:
                    return _baseline_dict(b, source="keyword_match")

    # 3 — workspace-median fallback (only if we have enough data points)
    prices = [p for p in (competitor_prices or []) if p and p > 0]
    volumes = [v for v in (competitor_volumes or []) if v and v > 0]
    if len(prices) >= 3:
        median_price = sorted(prices)[len(prices) // 2]
        median_volume = sorted(volumes)[len(volumes) // 2] if len(volumes) >= 3 else GENERIC_FALLBACK.avg_volume
        return {
            "avg_price": float(median_price),
            "avg_volume": float(median_volume),
            "label": "workspace_median",
            "source": "workspace_median",
            "category_key": "workspace_median",
        }

    # 4 — final fallback
    return _baseline_dict(GENERIC_FALLBACK, source="generic_fallback")


def _baseline_dict(b: CategoryBaseline, source: str) -> dict:
    return {
        "avg_price": float(b.avg_price),
        "avg_volume": float(b.avg_volume),
        "label": b.label,
        "source": source,
        "category_key": b.key,
    }


def list_categories() -> list[dict]:
    """Diagnostic helper — return every catalog entry as a dict."""
    return [_baseline_dict(b, source="category") for b in CATEGORY_BASELINES]
