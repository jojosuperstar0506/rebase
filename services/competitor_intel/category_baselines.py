"""
Category-aware scoring baselines.

Single source of truth for per-category numeric baselines AND keyword
vocabularies used by scorers that need to know "what's normal for this
kind of brand."

Replaces:
  1. The hardcoded ¥350 / 2000 units-per-month constants that used to
     live in scoring_pipeline.compute_wtp().
  2. The fashion-only STYLE_KEYWORDS / MATERIAL_KEYWORDS sets that used
     to live in design_vision_pipeline.py — those missed sportswear
     vocabulary ("breathable", "carbon plate"), beauty ("hydrating",
     "non-comedogenic"), etc.

Workspace.brand_category strings come from the frontend (CISettings.tsx
CATEGORIES list): 女包 / 男包 / 箱包配件 / 鞋类 / 服饰 / 其他, plus
sportswear-equivalents we expect from non-OMI customers.

Resolution order (for both baselines and keywords):
  1. exact match on brand_category string
  2. regex/keyword match (e.g., "运动鞋类" matches the sportswear bucket)
  3. fall back to median-of-tracked-competitors (baselines only) or to
     the union of all categories (keywords only)
  4. final fallback: GENERIC defaults — flagged in raw_inputs.reason

Add new categories by appending to CATEGORY_BASELINES — no other file
needs to change.
"""

from typing import Iterable, Optional


# Universal style keywords — apply to nearly any consumer category.
# Each per-category set is unioned with this so we never lose general
# style signal even when the category extension fails.
UNIVERSAL_STYLE_KEYWORDS = frozenset({
    "极简", "简约", "minimalist", "minimal", "简洁",
    "复古", "vintage", "retro",
    "潮流", "trendy", "时尚", "ins风", "网红",
    "经典", "classic", "百搭", "timeless",
    "轻奢", "luxury", "高端", "premium",
})


class CategoryBaseline:
    """
    Numeric reference values + keyword vocabularies for a category.

    Fields:
        avg_price:    typical mid-tier price point in RMB
        avg_volume:   typical monthly units sold for a mid-tier SKU
        label:        human-readable category name (Chinese)
        keywords:     phrases that map free-text brand_category strings here
        style_kw:     style/aesthetic vocabulary specific to this category
                      (unioned with UNIVERSAL_STYLE_KEYWORDS at lookup time)
        material_kw:  material/feature vocabulary specific to this category

    All numeric values are rough order-of-magnitude — they only need to
    be in the right ballpark for WTP / pricing signals to behave sensibly.
    """

    def __init__(self, key: str, avg_price: float, avg_volume: float,
                 label: str, keywords: Iterable[str],
                 style_kw: Iterable[str] = (),
                 material_kw: Iterable[str] = ()):
        self.key = key
        self.avg_price = avg_price
        self.avg_volume = avg_volume
        self.label = label
        self.keywords = tuple(keywords)
        self.style_kw = frozenset(style_kw)
        self.material_kw = frozenset(material_kw)


# ─── Category catalog ────────────────────────────────────────────────────
# Calibrated against typical Chinese e-commerce data (XHS / Tmall / Douyin
# top-100 by category, 2025-2026). Update as we get more real data.

CATEGORY_BASELINES: list[CategoryBaseline] = [
    # ── Bags + leather goods (the original OMI category) ─────────────────
    CategoryBaseline(
        key="womens_bags",
        avg_price=350, avg_volume=2000, label="女包",
        keywords=("女包", "女士包", "女款包", "women's bag", "women bag", "ladies bag"),
        style_kw={
            "可爱", "sweet", "甜美", "少女", "cute",
            "文艺", "artsy", "bohemian", "波西米亚",
            "轻熟", "ol", "通勤",
        },
        material_kw={
            "真皮", "leather", "头层牛皮", "皮质", "牛皮",
            "帆布", "canvas",
            "尼龙", "nylon",
            "pu", "合成皮",
            "编织", "woven", "草编",
            "金属", "metal", "链条",
        },
    ),
    CategoryBaseline(
        key="mens_bags",
        avg_price=420, avg_volume=1500, label="男包",
        keywords=("男包", "男士包", "men's bag", "men bag"),
        style_kw={"商务", "office", "通勤", "职场", "professional", "户外"},
        material_kw={"真皮", "leather", "牛皮", "尼龙", "nylon", "帆布", "canvas",
                     "防水", "waterproof"},
    ),
    CategoryBaseline(
        key="luggage_accessories",
        avg_price=280, avg_volume=2500, label="箱包配件",
        keywords=("箱包", "配件", "luggage", "accessories"),
        style_kw={"商务", "户外", "outdoor", "旅行", "travel"},
        material_kw={"abs", "pc", "polycarbonate", "尼龙", "nylon",
                     "聚酯", "polyester", "防水", "waterproof"},
    ),
    # ── Sportswear (the Nike workspace) ──────────────────────────────────
    CategoryBaseline(
        key="sportswear",
        avg_price=799, avg_volume=1200, label="运动鞋服",
        keywords=("运动鞋", "运动服", "sportswear", "sneakers", "athletic", "运动",
                  "跑鞋", "篮球鞋", "球鞋"),
        style_kw={
            "运动", "sporty", "athletic", "户外", "outdoor",
            "训练", "training", "竞技", "performance",
            "街头", "streetwear", "潮流", "潮鞋",
            "复刻", "限量", "联名",
        },
        material_kw={
            "网面", "mesh", "透气", "breathable",
            "缓震", "cushion", "气垫", "boost", "react",
            "碳板", "carbon plate", "carbon",
            "针织", "knit", "flyknit", "primeknit",
            "防滑", "grip", "橡胶", "rubber",
            "防水", "waterproof", "gore-tex", "goretex",
        },
    ),
    CategoryBaseline(
        key="footwear",
        avg_price=380, avg_volume=1800, label="鞋类",
        keywords=("鞋类", "鞋子", "shoes", "footwear", "靴", "靴子"),
        style_kw={"经典", "百搭", "复古", "潮鞋", "时尚"},
        material_kw={"真皮", "leather", "牛皮", "麂皮", "suede",
                     "橡胶", "rubber", "缓震", "cushion"},
    ),
    # ── Apparel ─────────────────────────────────────────────────────────
    CategoryBaseline(
        key="apparel",
        avg_price=220, avg_volume=4000, label="服饰",
        keywords=("服饰", "服装", "女装", "男装", "apparel", "clothing", "fashion"),
        style_kw={
            "可爱", "甜美", "少女", "ins风", "网红",
            "文艺", "复古", "bohemian", "通勤", "ol", "office",
            "韩系", "日系", "y2k", "美式", "法式",
            "oversize", "宽松", "修身", "slim",
        },
        material_kw={
            "棉", "cotton", "麻", "linen",
            "羊毛", "wool", "cashmere", "羊绒",
            "丝绒", "velvet", "缎面", "satin",
            "雪纺", "chiffon", "蕾丝", "lace",
            "牛仔", "denim", "皮革", "leather",
        },
    ),
    # ── Beauty ──────────────────────────────────────────────────────────
    CategoryBaseline(
        key="beauty",
        avg_price=180, avg_volume=8000, label="美妆",
        keywords=("美妆", "化妆品", "护肤", "彩妆", "beauty", "cosmetics", "skincare"),
        style_kw={
            "高奢", "天然", "natural", "纯净", "clean beauty",
            "韩系", "日系", "法式", "美式",
            "新锐", "国货", "domestic",
        },
        material_kw={
            # Skincare actives & common hero ingredients in CN beauty
            "玻尿酸", "hyaluronic", "ha", "烟酰胺", "niacinamide",
            "视黄醇", "retinol", "维生素c", "vitamin c", "vc",
            "胶原蛋白", "collagen", "神经酰胺", "ceramide",
            "氨基酸", "amino acid", "果酸", "aha", "水杨酸", "bha",
            "敏感肌", "sensitive", "保湿", "hydrating",
            "抗衰", "anti-aging", "美白", "whitening", "brightening",
            "防晒", "sunscreen", "spf",
        },
    ),
    # ── Food + beverage ─────────────────────────────────────────────────
    CategoryBaseline(
        key="food_beverage",
        avg_price=68, avg_volume=10000, label="食品饮料",
        keywords=("食品", "饮料", "零食", "food", "snack", "beverage"),
        style_kw={"健康", "healthy", "低脂", "无糖", "sugar-free", "天然", "natural",
                  "有机", "organic", "国潮", "网红"},
        material_kw={
            "全麦", "whole grain", "蛋白", "protein", "膳食纤维", "fiber",
            "0糖", "0脂", "0卡", "low-cal",
            "谷物", "燕麦", "oat", "巧克力", "chocolate",
            "茶", "tea", "咖啡", "coffee", "果汁", "juice",
        },
    ),
    # ── Electronics / tech ──────────────────────────────────────────────
    CategoryBaseline(
        key="electronics",
        avg_price=899, avg_volume=1000, label="数码",
        keywords=("数码", "电子", "electronics", "tech", "智能"),
        style_kw={"科技", "tech", "极客", "geek", "极简", "minimalist", "商务"},
        material_kw={
            "金属", "metal", "铝合金", "aluminum",
            "玻璃", "glass", "cnc",
            "tpu", "硅胶", "silicone",
            "蓝牙", "bluetooth", "无线", "wireless", "wifi",
            "续航", "battery life", "充电", "fast charge",
        },
    ),
]

# Final fallback for unknown categories — broad market avg + universal keywords.
GENERIC_FALLBACK = CategoryBaseline(
    key="generic",
    avg_price=350, avg_volume=2000, label="通用",
    keywords=("其他", "generic", "other"),
    style_kw=set(),
    material_kw=set(),
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


def resolve_design_keywords(brand_category: Optional[str]) -> dict:
    """
    Look up style + material keyword sets for a category, used by
    design_vision_pipeline to detect design DNA from hashtags.

    Resolution mirrors resolve_baseline:
      1. Exact / keyword match on brand_category
      2. Unknown category → union of ALL category keywords (most permissive
         option, prevents missing a tag just because we don't know the
         category yet)

    Each category set is unioned with UNIVERSAL_STYLE_KEYWORDS so a
    sportswear brand still gets credit for tags like "潮流" or "极简"
    that apply to most consumer goods.

    Returns:
        {
            "style":    frozenset[str],   # style keywords for this category
            "material": frozenset[str],   # material keywords for this category
            "source":   'category' | 'keyword_match' | 'unknown_union',
            "category_key": str,
        }
    """
    cat = (brand_category or "").strip().lower()

    matched: Optional[CategoryBaseline] = None
    source = "category"
    if cat:
        for b in CATEGORY_BASELINES:
            if cat == b.label.lower() or cat == b.key.lower():
                matched = b
                break
        if matched is None:
            for b in CATEGORY_BASELINES:
                for kw in b.keywords:
                    if kw.lower() in cat:
                        matched = b
                        source = "keyword_match"
                        break
                if matched is not None:
                    break

    if matched:
        return {
            "style":        frozenset(matched.style_kw | UNIVERSAL_STYLE_KEYWORDS),
            "material":     frozenset(matched.material_kw),
            "source":       source,
            "category_key": matched.key,
        }

    # Unknown category — union ALL categories so we don't blind ourselves
    all_style = set(UNIVERSAL_STYLE_KEYWORDS)
    all_material = set()
    for b in CATEGORY_BASELINES:
        all_style |= b.style_kw
        all_material |= b.material_kw
    return {
        "style":        frozenset(all_style),
        "material":     frozenset(all_material),
        "source":       "unknown_union",
        "category_key": "unknown",
    }


def list_categories() -> list[dict]:
    """Diagnostic helper — return every catalog entry as a dict."""
    return [_baseline_dict(b, source="category") for b in CATEGORY_BASELINES]
