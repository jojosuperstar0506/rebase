"""Fuzzy column matching for 聚水潭 and other ERP Excel exports.

Handles shifting column names between exports by matching on keyword
patterns rather than exact strings. Auto-detects which file type
(sales/inventory/bestseller) based on column signatures.
"""

from __future__ import annotations

import re
from typing import Optional

import pandas as pd

try:
    from ..models.schemas import FileType
except ImportError:
    from models.schemas import FileType


# --- Column keyword mappings ---
# Each canonical field maps to a list of regex patterns that match
# common variations in Chinese ERP exports.

SALES_COLUMN_MAP: dict[str, list[str]] = {
    "sku_code": [r"款式编码", r"商品编码", r"货号", r"SKU"],
    "product_name": [r"商品名称", r"产品名称", r"品名"],
    "category": [r"产品分类", r"商品分类", r"类别", r"品类"],
    "bag_type": [r"包型", r"系列", r"款式类型", r"类型名称"],
    "retail_price": [r"基本售价", r"售价", r"销售单价", r"零售价"],
    "sales_volume": [r"销售数量", r"销量", r"销售件数"],
    "return_volume": [r"退货数量", r"退货", r"退货件数"],
    "net_volume": [r"净销量", r"净销售数量"],
    "gross_revenue": [r"^销售额", r"销售金额"],
    "net_revenue": [r"净销售额", r"净销售金额", r"净额"],
    "shipping_cost": [r"运费支出", r"运费", r"物流费"],
}

INVENTORY_COLUMN_MAP: dict[str, list[str]] = {
    "sku_code": [r"货号", r"商品编码", r"SKU编码", r"款式编码"],
    "product_name": [r"商品名称", r"产品名称", r"品名"],
    "memo_code": [r"助记码", r"简码", r"记忆码"],
    "current_stock": [r"库存", r"可用库存", r"聚水潭库存", r"现有库存", r"在库数"],
    "weekly_daily_sales": [r"周日均", r"日均销量", r"日均", r"周日均销量"],
    "days_remaining": [r"剩余天数", r"可售天数", r"库存天数"],
    "recent_returns_4w": [r"近4周退货", r"退货.*4周", r"近四周退货"],
    "purchase_order": [r"采购订", r"采购在途", r"在途"],
    "purchase_owed": [r"采购欠", r"欠货"],
}

BESTSELLER_COLUMN_MAP: dict[str, list[str]] = {
    "sku_code": [r"货号", r"商品编码", r"SKU"],
    "product_name": [r"商品名称", r"产品名称", r"品名"],
    "material": [r"材质", r"面料", r"材料"],
    "bag_type": [r"包型", r"款式", r"类型"],
    "retail_price": [r"电商价", r"售价", r"零售价"],
    "dealer_price": [r"省代价", r"批发价", r"代理价"],
    "tag_price": [r"吊牌价", r"标价"],
    "current_stock": [r"库存", r"现库存"],
    "monthly_sales": [r"月销售", r"月销量", r"当月销量", r"销量"],
}

# File type detection signatures: if a file has columns matching these
# patterns, it's likely that file type.
FILE_TYPE_SIGNATURES: dict[FileType, list[str]] = {
    FileType.SALES: [r"净销售额", r"退货数量", r"运费支出", r"净销量"],
    FileType.INVENTORY: [r"助记码", r"周日均", r"剩余天数", r"近4周退货"],
    FileType.BESTSELLER: [r"材质", r"电商价", r"省代价", r"吊牌价"],
}


def _match_column(columns: list[str], patterns: list[str]) -> Optional[str]:
    """Find the first column that matches any of the regex patterns."""
    for col in columns:
        for pattern in patterns:
            if re.search(pattern, str(col)):
                return col
    return None


def detect_file_type(df: pd.DataFrame) -> FileType:
    """Auto-detect which ERP export type this DataFrame represents.

    Scores each file type by how many signature columns are present.
    Returns the type with the highest match score.
    """
    columns = [str(c) for c in df.columns]
    scores: dict[FileType, int] = {}

    for file_type, signatures in FILE_TYPE_SIGNATURES.items():
        score = 0
        for sig_pattern in signatures:
            for col in columns:
                if re.search(sig_pattern, col):
                    score += 1
                    break
        scores[file_type] = score

    best_type = max(scores, key=lambda k: scores[k])
    if scores[best_type] == 0:
        return FileType.UNKNOWN
    return best_type


def map_columns(df: pd.DataFrame, file_type: FileType) -> dict[str, str]:
    """Map DataFrame columns to canonical field names.

    Returns a dict of {canonical_name: actual_column_name}.
    Only includes mappings where a match was found.
    """
    column_map_source = {
        FileType.SALES: SALES_COLUMN_MAP,
        FileType.INVENTORY: INVENTORY_COLUMN_MAP,
        FileType.BESTSELLER: BESTSELLER_COLUMN_MAP,
    }

    source = column_map_source.get(file_type, {})
    columns = [str(c) for c in df.columns]
    mapping: dict[str, str] = {}

    for canonical, patterns in source.items():
        matched = _match_column(columns, patterns)
        if matched:
            mapping[canonical] = matched

    return mapping


def rename_columns(df: pd.DataFrame, file_type: FileType) -> pd.DataFrame:
    """Rename DataFrame columns to canonical names.

    Returns a new DataFrame with standardized column names.
    Columns that don't match any pattern are kept with original names.
    """
    mapping = map_columns(df, file_type)
    reverse_mapping = {v: k for k, v in mapping.items()}
    return df.rename(columns=reverse_mapping)
