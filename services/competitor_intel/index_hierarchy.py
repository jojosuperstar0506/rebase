"""
Per-category index hierarchy — which indices are HERO (always visible) vs
SUPPORTING (one click away) for a customer's category.

Decoupled from compute: the same 12 indices are computed for every brand
in every category. This module only governs what the API surfaces as the
3 hero numbers at the top of the dashboard. Customers in different
categories see different indices at the top — but the underlying scores
are comparable across categories.

Adding a category:
  1. Add an entry to CATEGORY_INDEX_HIERARCHY
  2. Either set 'inherits' to '_default' or override `pillars_override`
  3. The remaining 9 fill into supporting

Spec: SPEC-COMPOSITE-INDICES-V1.md §5
"""

INDEX_NAMES = (
    "brand_heat", "brand_nps", "pricing_power_index", "loyalty_index",
    "content_velocity_index", "influencer_footprint", "search_dominance",
    "hero_product_index", "launch_cadence", "trend_capture_index",
    "innovation_score", "promotional_discipline",
)

INDEX_TO_PILLAR = {
    "brand_heat":             "brand_equity",
    "brand_nps":              "brand_equity",
    "pricing_power_index":    "brand_equity",
    "loyalty_index":          "brand_equity",
    "content_velocity_index": "marketing_engine",
    "influencer_footprint":   "marketing_engine",
    "search_dominance":       "marketing_engine",
    "hero_product_index":     "commerce_engine",
    "launch_cadence":         "commerce_engine",
    "trend_capture_index":    "commerce_engine",
    "innovation_score":       "commerce_engine",
    "promotional_discipline": "commerce_engine",
}

# Bilingual labels — backend ships them with each index so the frontend
# doesn't need to maintain its own translation table.
INDEX_LABELS = {
    "brand_heat":             {"zh": "品牌热度",         "en": "Brand Heat"},
    "brand_nps":              {"zh": "品牌净推荐值",     "en": "Brand NPS"},
    "pricing_power_index":    {"zh": "溢价能力指数",     "en": "Pricing Power Index"},
    "loyalty_index":          {"zh": "品牌忠诚度",       "en": "Loyalty Index"},
    "content_velocity_index": {"zh": "内容动能指数",     "en": "Content Velocity Index"},
    "influencer_footprint":   {"zh": "KOL 足迹",         "en": "Influencer Footprint"},
    "search_dominance":       {"zh": "搜索话语权",       "en": "Search Dominance"},
    "hero_product_index":     {"zh": "爆品指数",         "en": "Hero Product Index"},
    "launch_cadence":         {"zh": "上新节奏",         "en": "Launch Cadence"},
    "trend_capture_index":    {"zh": "趋势捕捉",         "en": "Trend Capture"},
    "innovation_score":       {"zh": "创新评分",         "en": "Innovation Score"},
    "promotional_discipline": {"zh": "促销纪律",         "en": "Promotional Discipline"},
}

PILLAR_LABELS = {
    "brand_equity":     {"zh": "品牌资产", "en": "Brand Equity"},
    "marketing_engine": {"zh": "营销引擎", "en": "Marketing Engine"},
    "commerce_engine":  {"zh": "商业引擎", "en": "Commerce Engine"},
}

_DEFAULT_HIERARCHY = {
    "pillars": {
        "brand_equity": {
            "hero": "brand_heat",
            "supporting": ["brand_nps", "pricing_power_index", "loyalty_index"],
        },
        "marketing_engine": {
            "hero": "content_velocity_index",
            "supporting": ["influencer_footprint", "search_dominance"],
        },
        "commerce_engine": {
            "hero": "hero_product_index",
            "supporting": [
                "launch_cadence", "trend_capture_index",
                "innovation_score", "promotional_discipline",
            ],
        },
    },
}

CATEGORY_INDEX_HIERARCHY = {
    "_default": _DEFAULT_HIERARCHY,

    # Joanna's existing brand_category enum — handbags + adjacent
    "女包":       {"inherits": "_default"},
    "男包":       {"inherits": "_default"},
    "箱包配件":   {"inherits": "_default"},
    "服饰":       {"inherits": "_default"},

    # Footwear — sneakerheads care about trends + collabs
    "鞋类": {
        "pillars_override": {
            "commerce_engine": {
                "hero": "hero_product_index",
                "supporting": [
                    "trend_capture_index",
                    "launch_cadence",
                    "innovation_score",
                    "promotional_discipline",
                ],
            },
        },
    },

    # Beauty — efficacy claims drive NPS; formulation novelty drives commerce
    "美妆个护": {
        "pillars_override": {
            "brand_equity": {
                "hero": "brand_nps",
                "supporting": ["brand_heat", "pricing_power_index", "loyalty_index"],
            },
            "commerce_engine": {
                "hero": "hero_product_index",
                "supporting": [
                    "innovation_score",
                    "trend_capture_index",
                    "launch_cadence",
                    "promotional_discipline",
                ],
            },
        },
    },

    # Food & beverage — repeat purchase is the game
    "食品饮料": {
        "pillars_override": {
            "brand_equity": {
                "hero": "loyalty_index",
                "supporting": ["brand_heat", "brand_nps", "pricing_power_index"],
            },
        },
    },

    # Home goods — price + value > novelty
    "家居生活": {
        "pillars_override": {
            "brand_equity": {
                "hero": "pricing_power_index",
                "supporting": ["brand_nps", "brand_heat", "loyalty_index"],
            },
        },
    },

    "其他":       {"inherits": "_default"},
}


def get_hierarchy(brand_category):
    """Return the resolved 3-pillar hierarchy for a category.

    Falls back to _default for unknown categories. Resolves `inherits` and
    `pillars_override` keys so callers always receive a fully-resolved
    {pillars: {...}} dict.
    """
    cfg = CATEGORY_INDEX_HIERARCHY.get(brand_category) or _DEFAULT_HIERARCHY
    if "inherits" in cfg:
        base = CATEGORY_INDEX_HIERARCHY[cfg["inherits"]]
        return {"pillars": dict(base["pillars"])}
    if "pillars_override" in cfg:
        result = {"pillars": {k: dict(v) for k, v in _DEFAULT_HIERARCHY["pillars"].items()}}
        for pillar_name, override in cfg["pillars_override"].items():
            result["pillars"][pillar_name] = dict(override)
        return result
    return {"pillars": dict(cfg["pillars"])}
