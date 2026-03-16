"""Category standardization for materials, bag types, and price tiers.

Handles the messy reality of Chinese ERP exports where the same thing
has 5 different names across different reports.
"""

from __future__ import annotations

import re
from typing import Optional


# --- Material normalization ---
# Maps raw category/material strings to standardized names.
# Order matters: first match wins.

MATERIAL_RULES: list[tuple[str, str]] = [
    (r"头层皮|头层牛皮|头层", "头层皮"),
    (r"复合二层|二层皮", "复合二层皮"),
    (r"真皮|牛皮|羊皮", "真皮"),
    (r"PU|pu|聚氨酯", "PU"),
    (r"PVC|pvc", "PVC"),
    (r"超纤|超细纤维", "超纤"),
    (r"尼龙|锦纶|nylon", "尼龙"),
    (r"帆布|canvas", "帆布"),
    (r"编织|草编", "编织"),
]


def normalize_material(raw: Optional[str]) -> str:
    """Normalize material string to standard category.

    Handles both direct material fields (e.g., "头层皮") and
    product category fields (e.g., "PU女包", "真皮女包").
    """
    if not raw or not isinstance(raw, str):
        return "其他"

    text = raw.strip()
    for pattern, normalized in MATERIAL_RULES:
        if re.search(pattern, text, re.IGNORECASE):
            return normalized

    return "其他"


# --- Bag type normalization ---
# Consolidates ~43 raw bag type variants into ~15 standard categories.

BAG_TYPE_RULES: list[tuple[str, str]] = [
    (r"手提包|手提袋|手拎", "手提包"),
    (r"单肩|女式单肩|女士单肩", "单肩包"),
    (r"斜挎|斜跨|斜背|邮差", "斜挎包"),
    (r"双肩|背包|书包", "双肩包"),
    (r"托特|tote", "托特包"),
    (r"水桶|桶包|水桶包", "水桶包"),
    (r"链条|链条包", "链条包"),
    (r"腋下|法棍|腋下包", "腋下包"),
    (r"钱包|长夹|短夹|卡包|零钱", "钱包/卡包"),
    (r"化妆|收纳|洗漱", "化妆包"),
    (r"公文|电脑包|商务", "公文包"),
    (r"旅行|行李|旅行包", "旅行包"),
    (r"腰包|胸包|腰带包", "腰包/胸包"),
    (r"手拿|信封|晚宴", "手拿包"),
    (r"购物袋|购物包|环保", "购物袋"),
]

# Series name → bag type mapping (brand-specific)
SERIES_MAPPING: dict[str, str] = {
    "古岩系列": "斜挎包",
    "墨影系列": "斜挎包",
    "云石系列": "单肩包",
    "流光系列": "手提包",
    "织梦系列": "托特包",
}


def normalize_bag_type(raw: Optional[str]) -> str:
    """Normalize bag type string to standard category."""
    if not raw or not isinstance(raw, str):
        return "其他"

    text = raw.strip()

    # Check series mapping first
    for series, bag_type in SERIES_MAPPING.items():
        if series in text:
            return bag_type

    # Then check regex rules
    for pattern, normalized in BAG_TYPE_RULES:
        if re.search(pattern, text, re.IGNORECASE):
            return normalized

    return "其他"


# --- Price tier classification ---

PRICE_TIER_THRESHOLDS = [
    (200, "引流款"),     # < ¥200 — traffic drivers
    (400, "主力款"),     # ¥200-399 — core products
    (600, "利润款"),     # ¥400-599 — margin drivers
    (float("inf"), "形象款"),  # ¥600+ — brand image
]


def classify_price_tier(price: Optional[float]) -> str:
    """Classify retail price into merchandising tier."""
    if price is None or price <= 0:
        return "未分类"

    for threshold, tier_name in PRICE_TIER_THRESHOLDS:
        if price < threshold:
            return tier_name

    return "形象款"


# --- Efficiency grading ---

def grade_efficiency(
    net_volume: int,
    return_rate: float,
    estimated_margin: float,
    a_threshold: int = 200,
    b_threshold: int = 50,
    c_threshold: int = 10,
) -> str:
    """Grade SKU efficiency: A (star), B (stable), C (watch), D (eliminate).

    Args:
        net_volume: Net sales volume (after returns)
        return_rate: Return rate (0-1)
        estimated_margin: Estimated gross margin in RMB
        a_threshold: Min net volume for A grade (default 200, can be lowered)
        b_threshold: Min net volume for B grade
        c_threshold: Min net volume for C grade
    """
    if net_volume >= a_threshold and return_rate < 0.35 and estimated_margin > 0:
        return "A·明星款"
    elif net_volume >= b_threshold and return_rate < 0.40 and estimated_margin > 0:
        return "B·稳定款"
    elif net_volume >= c_threshold and estimated_margin > 0:
        return "C·观察款"
    else:
        return "D·淘汰候选"


def assess_inventory_health(
    stock_months: Optional[float],
    daily_sales_rate: float,
) -> str:
    """Assess inventory health status.

    Args:
        stock_months: Months of supply (库销比)
        daily_sales_rate: Recent daily sales rate
    """
    if daily_sales_rate <= 0 and (stock_months is None or stock_months == 0):
        return "零动销"

    if stock_months is None:
        return "未知"

    if stock_months <= 0.5:
        return "缺货风险"
    elif stock_months <= 3:
        return "健康"
    elif stock_months <= 6:
        return "偏高"
    else:
        return "严重积压"
