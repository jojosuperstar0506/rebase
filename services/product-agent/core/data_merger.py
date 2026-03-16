"""Merge 3 ERP Excel files into a unified product dataset.

Handles the grain mismatch: sales data is at 款式编码 (base code) level,
while inventory and bestseller data are at full SKU level (with color/variant suffix).
"""

from __future__ import annotations

from typing import Optional

import pandas as pd

try:
    from .column_mapper import detect_file_type, rename_columns
    from .normalizer import (
        normalize_material, normalize_bag_type, classify_price_tier,
        grade_efficiency, assess_inventory_health,
    )
    from ..models.schemas import FileType
except ImportError:
    from core.column_mapper import detect_file_type, rename_columns
    from core.normalizer import (
        normalize_material, normalize_bag_type, classify_price_tier,
        grade_efficiency, assess_inventory_health,
    )
    from models.schemas import FileType


def read_and_classify_files(
    file_paths: list[str] | None = None,
    file_buffers: list[tuple[str, any]] | None = None,
) -> dict[FileType, pd.DataFrame]:
    """Read Excel files and auto-classify them by type.

    Accepts either file paths (for CLI/testing) or file buffers
    (for Streamlit/FastAPI upload).

    Returns dict mapping FileType to normalized DataFrame.
    """
    classified: dict[FileType, pd.DataFrame] = {}

    sources = []
    if file_paths:
        for path in file_paths:
            df = pd.read_excel(path)
            sources.append((path, df))
    elif file_buffers:
        for name, buf in file_buffers:
            df = pd.read_excel(buf)
            sources.append((name, df))

    for name, df in sources:
        file_type = detect_file_type(df)
        if file_type != FileType.UNKNOWN:
            df_renamed = rename_columns(df, file_type)
            classified[file_type] = df_renamed
        else:
            print(f"Warning: Could not classify file '{name}'. Skipping.")

    return classified


def _extract_base_code(sku_code: str) -> str:
    """Extract base product code from full SKU code.

    Full SKU: 1526L3031A1DS → base code: 1526L3031
    The suffix (A1DS) represents colorway/size variant.

    Strategy: take everything up to the first alpha character
    after the main code pattern, or truncate to common prefix length.
    """
    if not isinstance(sku_code, str):
        return str(sku_code)

    # Common pattern: digits + letter + digits (e.g., 1526L3031)
    # followed by variant suffix
    import re
    match = re.match(r"^(\d+[A-Z]\d+)", sku_code)
    if match:
        return match.group(1)

    # Fallback: return first 9 characters (common base code length)
    return sku_code[:9] if len(sku_code) > 9 else sku_code


def merge_datasets(
    classified_files: dict[FileType, pd.DataFrame],
    cost_ratio: float = 0.40,
    months_in_period: int = 12,
) -> pd.DataFrame:
    """Merge sales, inventory, and bestseller data into unified dataset.

    Args:
        classified_files: Dict from read_and_classify_files()
        cost_ratio: Estimated COGS as % of retail price (default 40%)
        months_in_period: Number of months in the sales period (for averaging)

    Returns:
        Merged DataFrame with all computed fields.
    """
    sales_df = classified_files.get(FileType.SALES)
    inventory_df = classified_files.get(FileType.INVENTORY)
    bestseller_df = classified_files.get(FileType.BESTSELLER)

    if sales_df is None:
        raise ValueError("Sales data file is required but was not provided or detected.")

    # --- Start with sales as the base ---
    merged = sales_df.copy()

    # Ensure numeric columns
    numeric_cols = [
        "retail_price", "sales_volume", "return_volume", "net_volume",
        "gross_revenue", "net_revenue", "shipping_cost",
    ]
    for col in numeric_cols:
        if col in merged.columns:
            merged[col] = pd.to_numeric(merged[col], errors="coerce").fillna(0)

    # --- Compute sales-derived metrics ---
    if "net_volume" not in merged.columns or merged["net_volume"].sum() == 0:
        if "sales_volume" in merged.columns and "return_volume" in merged.columns:
            merged["net_volume"] = merged["sales_volume"] - merged["return_volume"]

    if "return_rate" not in merged.columns:
        merged["return_rate"] = merged.apply(
            lambda r: r["return_volume"] / r["sales_volume"]
            if r.get("sales_volume", 0) > 0 else 0,
            axis=1,
        )

    # Cost estimate and margin
    if "retail_price" in merged.columns:
        merged["cost_estimate"] = merged["retail_price"] * cost_ratio

    merged["estimated_margin"] = (
        merged.get("net_revenue", 0)
        - merged.get("net_volume", 0) * merged.get("cost_estimate", 0)
        - merged.get("shipping_cost", 0)
    )

    merged["margin_rate"] = merged.apply(
        lambda r: r["estimated_margin"] / r["net_revenue"]
        if r.get("net_revenue", 0) > 0 else 0,
        axis=1,
    )

    merged["avg_monthly_sales"] = merged["net_volume"] / months_in_period

    # --- Normalize categories ---
    # Material from product category (sales file) or material field (bestseller)
    material_source = "category" if "category" in merged.columns else "material"
    if material_source in merged.columns:
        merged["material_raw"] = merged[material_source]
        merged["material"] = merged[material_source].apply(normalize_material)

    # Bag type
    if "bag_type" in merged.columns:
        merged["bag_type_raw"] = merged["bag_type"]
        merged["bag_type"] = merged["bag_type"].apply(normalize_bag_type)

    # Price tier
    if "retail_price" in merged.columns:
        merged["price_tier"] = merged["retail_price"].apply(classify_price_tier)

    # --- Merge inventory data ---
    if inventory_df is not None:
        inv = inventory_df.copy()

        # Extract base code from inventory SKU for joining
        if "memo_code" in inv.columns:
            inv["base_code"] = inv["memo_code"]
        elif "sku_code" in inv.columns:
            inv["base_code"] = inv["sku_code"].apply(_extract_base_code)

        # Aggregate inventory to base code level
        inv_numeric = ["current_stock", "weekly_daily_sales", "recent_returns_4w"]
        for col in inv_numeric:
            if col in inv.columns:
                inv[col] = pd.to_numeric(inv[col], errors="coerce").fillna(0)

        inv_agg = inv.groupby("base_code", as_index=False).agg({
            col: "sum" for col in inv_numeric if col in inv.columns
        })

        # Add days remaining (use min across variants — most conservative)
        if "days_remaining" in inv.columns:
            inv["days_remaining"] = pd.to_numeric(inv["days_remaining"], errors="coerce")
            days_agg = inv.groupby("base_code")["days_remaining"].min().reset_index()
            inv_agg = inv_agg.merge(days_agg, on="base_code", how="left")

        # Join to merged
        join_key = "sku_code" if "sku_code" in merged.columns else merged.columns[0]
        merged = merged.merge(
            inv_agg, left_on=join_key, right_on="base_code", how="left", suffixes=("", "_inv")
        )

        # Compute inventory health metrics
        if "current_stock" in merged.columns and "avg_monthly_sales" in merged.columns:
            merged["stock_to_sales_ratio"] = merged.apply(
                lambda r: r["current_stock"] / r["avg_monthly_sales"]
                if r.get("avg_monthly_sales", 0) > 0 else None,
                axis=1,
            )

    # --- Merge bestseller data (for material detail) ---
    if bestseller_df is not None:
        bs = bestseller_df.copy()
        if "sku_code" in bs.columns:
            bs["base_code"] = bs["sku_code"].apply(_extract_base_code)

            # Get material detail from bestseller (more granular than sales)
            if "material" in bs.columns:
                mat_detail = bs.groupby("base_code")["material"].first().reset_index()
                mat_detail.columns = ["base_code", "material_detail"]
                join_key = "sku_code" if "sku_code" in merged.columns else merged.columns[0]
                merged = merged.merge(
                    mat_detail, left_on=join_key, right_on="base_code",
                    how="left", suffixes=("", "_bs")
                )
                # Use detailed material where available
                if "material_detail" in merged.columns:
                    merged["material"] = merged.apply(
                        lambda r: normalize_material(r["material_detail"])
                        if pd.notna(r.get("material_detail")) else r.get("material", "其他"),
                        axis=1,
                    )

            # Get dealer price for better cost estimate
            if "dealer_price" in bs.columns:
                cost_detail = bs.groupby("base_code")["dealer_price"].first().reset_index()
                join_key = "sku_code" if "sku_code" in merged.columns else merged.columns[0]
                merged = merged.merge(
                    cost_detail, left_on=join_key, right_on="base_code",
                    how="left", suffixes=("", "_cost")
                )
                # Override cost estimate with actual dealer price where available
                if "dealer_price" in merged.columns:
                    merged["cost_estimate"] = merged.apply(
                        lambda r: r["dealer_price"]
                        if pd.notna(r.get("dealer_price")) and r["dealer_price"] > 0
                        else r.get("cost_estimate", 0),
                        axis=1,
                    )
                    # Recompute margin with better cost
                    merged["estimated_margin"] = (
                        merged["net_revenue"]
                        - merged["net_volume"] * merged["cost_estimate"]
                        - merged.get("shipping_cost", 0)
                    )
                    merged["margin_rate"] = merged.apply(
                        lambda r: r["estimated_margin"] / r["net_revenue"]
                        if r.get("net_revenue", 0) > 0 else 0,
                        axis=1,
                    )

    # --- Efficiency grading ---
    merged["efficiency_rating"] = merged.apply(
        lambda r: grade_efficiency(
            int(r.get("net_volume", 0)),
            float(r.get("return_rate", 0)),
            float(r.get("estimated_margin", 0)),
        ),
        axis=1,
    )

    # --- Inventory health status ---
    if "stock_to_sales_ratio" in merged.columns:
        merged["inventory_status"] = merged.apply(
            lambda r: assess_inventory_health(
                r.get("stock_to_sales_ratio"),
                r.get("weekly_daily_sales", 0),
            ),
            axis=1,
        )

    # --- Revenue share ---
    total_net_rev = merged["net_revenue"].sum()
    if total_net_rev > 0:
        merged["revenue_share"] = merged["net_revenue"] / total_net_rev

    return merged
