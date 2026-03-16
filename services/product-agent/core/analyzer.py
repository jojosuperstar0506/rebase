"""Core analysis engine — 4 business objectives.

1) What products to make (contribution analysis, gap analysis)
2) Why products don't sell (return rate segmentation, slow-mover autopsy)
3) Live inventory health (库销比, aging, consumption velocity)
4) How much to order (target WOS, open-to-buy model)
"""

from __future__ import annotations

from typing import Optional
import uuid

import pandas as pd

try:
    from ..models.schemas import (
        AnalysisResult, AnalysisSummary, DimensionBreakdown, CrossTabCell,
        EfficiencyGrade, InventoryHealthItem, PurchaseRecommendation,
    )
except ImportError:
    from models.schemas import (
        AnalysisResult, AnalysisSummary, DimensionBreakdown, CrossTabCell,
        EfficiencyGrade, InventoryHealthItem, PurchaseRecommendation,
    )


# Target weeks-of-supply (in months) by material
TARGET_WOS: dict[str, float] = {
    "PU": 2.0,
    "真皮": 2.5,
    "头层皮": 3.0,
    "复合二层皮": 2.5,
    "PVC": 2.5,
    "超纤": 2.0,
    "尼龙": 2.0,
    "帆布": 2.0,
    "其他": 2.0,
}


def run_full_analysis(merged_df: pd.DataFrame) -> AnalysisResult:
    """Run the complete 4-objective analysis on merged data.

    Args:
        merged_df: Output from data_merger.merge_datasets()

    Returns:
        AnalysisResult with all sections populated.
    """
    analysis_id = str(uuid.uuid4())[:8]

    summary = _compute_summary(merged_df)
    dimensions = _compute_dimension_breakdowns(merged_df)
    cross_tabs = _compute_cross_tabs(merged_df)
    grades = _compute_efficiency_grades(merged_df)
    inventory = _compute_inventory_health(merged_df)
    purchases = _compute_purchase_recommendations(merged_df)
    insights = _generate_key_insights(merged_df, summary, grades)

    return AnalysisResult(
        analysis_id=analysis_id,
        summary=summary,
        dimension_breakdowns=dimensions,
        cross_tabs=cross_tabs,
        efficiency_grades=grades,
        inventory_health=inventory,
        purchase_recommendations=purchases,
        key_insights=insights,
    )


def _compute_summary(df: pd.DataFrame) -> AnalysisSummary:
    """Compute top-level KPIs."""
    total_net_rev = df["net_revenue"].sum()
    total_margin = df.get("estimated_margin", pd.Series([0])).sum()

    # Find top SKU
    top_idx = df["net_revenue"].idxmax() if len(df) > 0 else None
    top_sku = df.loc[top_idx, "sku_code"] if top_idx is not None else None
    top_rev = df.loc[top_idx, "net_revenue"] if top_idx is not None else 0

    return AnalysisSummary(
        total_skus=len(df),
        active_skus=int((df["net_volume"] > 0).sum()),
        total_sales_volume=int(df["sales_volume"].sum()),
        total_return_volume=int(df["return_volume"].sum()),
        overall_return_rate=(
            df["return_volume"].sum() / df["sales_volume"].sum()
            if df["sales_volume"].sum() > 0 else 0
        ),
        total_net_revenue=round(total_net_rev, 2),
        total_estimated_margin=round(total_margin, 2),
        overall_margin_rate=(
            total_margin / total_net_rev if total_net_rev > 0 else 0
        ),
        total_current_stock=int(df.get("current_stock", pd.Series([0])).sum()),
        avg_stock_months=(
            df["stock_to_sales_ratio"].mean()
            if "stock_to_sales_ratio" in df.columns else None
        ),
        grade_a_count=int((df["efficiency_rating"] == "A·明星款").sum()),
        grade_d_count=int((df["efficiency_rating"] == "D·淘汰候选").sum()),
        top_sku_code=top_sku,
        top_sku_revenue=round(top_rev, 2),
    )


def _compute_dimension_breakdowns(df: pd.DataFrame) -> list[DimensionBreakdown]:
    """Compute single-dimension breakdowns for material, bag type, price tier."""
    results = []
    total_net_rev = df["net_revenue"].sum()

    dimensions = {
        "材质": "material",
        "包型": "bag_type",
        "价格带": "price_tier",
    }

    for dim_name, col in dimensions.items():
        if col not in df.columns:
            continue

        grouped = df.groupby(col).agg(
            sku_count=("sku_code", "count"),
            sales_volume=("sales_volume", "sum"),
            return_volume=("return_volume", "sum"),
            net_volume=("net_volume", "sum"),
            net_revenue=("net_revenue", "sum"),
            estimated_margin=("estimated_margin", "sum"),
            retail_price=("retail_price", "mean"),
        ).reset_index()

        for _, row in grouped.iterrows():
            return_rate = (
                row["return_volume"] / row["sales_volume"]
                if row["sales_volume"] > 0 else 0
            )
            margin_rate = (
                row["estimated_margin"] / row["net_revenue"]
                if row["net_revenue"] > 0 else 0
            )
            rev_share = (
                row["net_revenue"] / total_net_rev
                if total_net_rev > 0 else 0
            )

            results.append(DimensionBreakdown(
                dimension_name=dim_name,
                dimension_value=str(row[col]),
                sku_count=int(row["sku_count"]),
                sku_share=round(row["sku_count"] / len(df), 4),
                sales_volume=int(row["sales_volume"]),
                return_volume=int(row["return_volume"]),
                return_rate=round(return_rate, 4),
                net_volume=int(row["net_volume"]),
                net_revenue=round(row["net_revenue"], 2),
                revenue_share=round(rev_share, 4),
                estimated_margin=round(row["estimated_margin"], 2),
                margin_rate=round(margin_rate, 4),
                avg_price=round(row["retail_price"], 2),
            ))

    return results


def _compute_cross_tabs(df: pd.DataFrame) -> list[CrossTabCell]:
    """Compute cross-tab matrices: material × price_tier, material × bag_type."""
    results = []

    cross_combos = [
        ("material", "price_tier", "net_revenue", "净销售额"),
        ("material", "price_tier", "return_rate", "退货率"),
        ("material", "bag_type", "net_volume", "净销量"),
    ]

    for row_col, col_col, metric_col, metric_label in cross_combos:
        if row_col not in df.columns or col_col not in df.columns:
            continue

        if metric_col == "return_rate":
            # Special: compute return rate per cell
            pivot = df.groupby([row_col, col_col]).apply(
                lambda g: g["return_volume"].sum() / g["sales_volume"].sum()
                if g["sales_volume"].sum() > 0 else 0,
                include_groups=False,
            ).reset_index(name="value")
        else:
            pivot = df.groupby([row_col, col_col])[metric_col].sum().reset_index(name="value")

        for _, row in pivot.iterrows():
            results.append(CrossTabCell(
                row_label=str(row[row_col]),
                col_label=str(row[col_col]),
                value=round(float(row["value"]), 4),
                metric=metric_label,
            ))

    return results


def _compute_efficiency_grades(df: pd.DataFrame) -> list[EfficiencyGrade]:
    """Summarize efficiency grading distribution."""
    if "efficiency_rating" not in df.columns:
        return []

    total_net_rev = df["net_revenue"].sum()
    results = []

    grade_criteria = {
        "A·明星款": "净销量≥200, 退货率<35%, 毛利>0",
        "B·稳定款": "净销量≥50, 退货率<40%, 毛利>0",
        "C·观察款": "净销量≥10, 毛利>0",
        "D·淘汰候选": "净销量<10 或 亏损",
    }

    for rating, criteria in grade_criteria.items():
        mask = df["efficiency_rating"] == rating
        subset = df[mask]
        rev = subset["net_revenue"].sum()

        results.append(EfficiencyGrade(
            rating=rating,
            criteria=criteria,
            sku_count=int(mask.sum()),
            sku_share=round(mask.sum() / len(df), 4) if len(df) > 0 else 0,
            total_net_revenue=round(rev, 2),
            revenue_share=round(rev / total_net_rev, 4) if total_net_rev > 0 else 0,
            avg_return_rate=round(
                subset["return_rate"].mean(), 4
            ) if len(subset) > 0 else 0,
        ))

    return results


def _compute_inventory_health(df: pd.DataFrame) -> list[InventoryHealthItem]:
    """Assess inventory health for all SKUs with stock data."""
    if "current_stock" not in df.columns:
        return []

    # Only include SKUs with inventory data
    inv_df = df[df["current_stock"] > 0].copy()
    results = []

    for _, row in inv_df.iterrows():
        # Historical 库销比 (based on annual average)
        hist_months = row.get("stock_to_sales_ratio")

        # Recent 库销比 (based on recent weekly daily sales)
        recent_months = None
        wds = row.get("weekly_daily_sales", 0)
        if wds > 0:
            recent_months = row["current_stock"] / (wds * 30)

        results.append(InventoryHealthItem(
            sku_code=str(row["sku_code"]),
            product_name=row.get("product_name"),
            material=row.get("material"),
            current_stock=int(row["current_stock"]),
            weekly_daily_sales=float(wds),
            days_remaining=row.get("days_remaining"),
            stock_months_historical=(
                round(hist_months, 1) if hist_months is not None else None
            ),
            stock_months_recent=(
                round(recent_months, 1) if recent_months is not None else None
            ),
            status=str(row.get("inventory_status", "未知")),
        ))

    return results


def _compute_purchase_recommendations(df: pd.DataFrame) -> list[PurchaseRecommendation]:
    """Generate purchasing recommendations by material category."""
    if "material" not in df.columns:
        return []

    results = []
    grouped = df.groupby("material").agg(
        current_stock=("current_stock", "sum") if "current_stock" in df.columns else ("sku_code", "count"),
        avg_monthly_sales=("avg_monthly_sales", "sum"),
        avg_price=("retail_price", "mean"),
        cost_estimate=("cost_estimate", "mean"),
    ).reset_index()

    for _, row in grouped.iterrows():
        material = str(row["material"])
        target_wos = TARGET_WOS.get(material, 2.0)
        monthly_sales = row["avg_monthly_sales"]
        current = int(row.get("current_stock", 0))

        # Recommended order = (target months × monthly sales) - current stock
        target_stock = monthly_sales * target_wos
        order_qty = max(0, int(target_stock - current))
        order_cost = order_qty * row.get("cost_estimate", 0)

        rationale = f"目标库销比{target_wos}个月"
        if current > target_stock * 1.5:
            rationale += "，当前库存偏高，暂不建议补货"
            order_qty = 0
            order_cost = 0
        elif current < target_stock * 0.3:
            rationale += "，库存不足，建议优先补货"

        results.append(PurchaseRecommendation(
            category=material,
            target_wos_months=target_wos,
            current_stock=current,
            avg_monthly_sales=round(monthly_sales, 1),
            recommended_order_qty=order_qty,
            estimated_order_cost=round(order_cost, 2),
            rationale=rationale,
        ))

    return results


def _generate_key_insights(
    df: pd.DataFrame,
    summary: AnalysisSummary,
    grades: list[EfficiencyGrade],
) -> list[str]:
    """Generate top 5 actionable insights from the data."""
    insights = []

    # 1. Return rate insight
    if summary.overall_return_rate > 0.30:
        insights.append(
            f"整体退货率{summary.overall_return_rate:.1%}偏高。"
            f"建议按材质/价格带细分，找出退货率最高的组合优先改善。"
        )

    # 2. SKU concentration
    if summary.total_skus > 0:
        d_pct = summary.grade_d_count / summary.total_skus
        if d_pct > 0.50:
            insights.append(
                f"D级(淘汰候选)SKU占比{d_pct:.0%}({summary.grade_d_count}个)。"
                f"建议清理长尾SKU，释放库存资金集中投入A/B级产品。"
            )

    # 3. Top SKU dependency
    if summary.top_sku_revenue > 0 and summary.total_net_revenue > 0:
        top_share = summary.top_sku_revenue / summary.total_net_revenue
        if top_share > 0.10:
            insights.append(
                f"头部SKU {summary.top_sku_code} 贡献了{top_share:.1%}的净销售额。"
                f"单品依赖度高，建议开发同品类替代款分散风险。"
            )

    # 4. Material insight
    if "material" in df.columns:
        mat_returns = df.groupby("material").apply(
            lambda g: g["return_volume"].sum() / g["sales_volume"].sum()
            if g["sales_volume"].sum() > 0 else 0,
            include_groups=False,
        )
        worst_mat = mat_returns.idxmax()
        worst_rate = mat_returns.max()
        if worst_rate > 0.35:
            insights.append(
                f"{worst_mat}材质退货率达{worst_rate:.1%}，远高于均值。"
                f"建议检查品质/定价匹配度，或降低该材质SKU占比。"
            )

    # 5. Inventory insight
    if "stock_to_sales_ratio" in df.columns:
        overstocked = df[df.get("stock_to_sales_ratio", pd.Series()) > 6]
        if len(overstocked) > 0:
            stuck_value = (overstocked["current_stock"] * overstocked["cost_estimate"]).sum()
            insights.append(
                f"{len(overstocked)}个SKU库销比超过6个月(严重积压)，"
                f"预计占用资金约¥{stuck_value:,.0f}。建议尽快清仓或打折处理。"
            )

    # Ensure at least one insight
    if not insights:
        insights.append(
            f"共分析{summary.total_skus}个SKU，"
            f"净销售额¥{summary.total_net_revenue:,.0f}，"
            f"A级明星款{summary.grade_a_count}个。"
        )

    return insights[:5]
