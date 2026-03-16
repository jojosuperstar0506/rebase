"""Pydantic models for Product Structure Agent input/output."""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class FileType(str, Enum):
    """Auto-detected Excel file types from ERP exports."""
    SALES = "sales"              # 年度销售数据 (yearly sales)
    INVENTORY = "inventory"      # 现库存快照 (current inventory snapshot)
    BESTSELLER = "bestseller"    # 月度畅销款 (monthly bestsellers)
    UNKNOWN = "unknown"


class MaterialType(str, Enum):
    """Normalized material categories."""
    PU = "PU"
    GENUINE_LEATHER = "真皮/头层皮"
    COMPOSITE_LEATHER = "复合二层皮"
    PVC = "PVC"
    MICROFIBER = "超纤"
    NYLON = "尼龙"
    CANVAS = "帆布"
    OTHER = "其他"


class PriceTier(str, Enum):
    """Price tier classification for merchandising strategy."""
    TRAFFIC = "引流款"      # < ¥200 — drive traffic
    CORE = "主力款"          # ¥200-399 — bread and butter
    PROFIT = "利润款"        # ¥400-599 — margin drivers
    IMAGE = "形象款"         # ¥600+ — brand positioning


class EfficiencyRating(str, Enum):
    """SKU efficiency grading."""
    A_STAR = "A·明星款"       # net_sales >= 200, return_rate < 35%, margin > 0
    B_STABLE = "B·稳定款"    # net_sales >= 50, return_rate < 40%, margin > 0
    C_WATCH = "C·观察款"     # net_sales >= 10, margin > 0
    D_ELIMINATE = "D·淘汰候选"  # everything else


class ProductSKU(BaseModel):
    """Individual SKU with all raw + computed fields."""
    sku_code: str = Field(description="款式编码 or 货号")
    product_name: Optional[str] = None
    material_raw: Optional[str] = Field(default=None, description="Original material from ERP")
    material: Optional[str] = Field(default=None, description="Normalized material category")
    bag_type_raw: Optional[str] = Field(default=None, description="Original bag type from ERP")
    bag_type: Optional[str] = Field(default=None, description="Normalized bag type")
    price_tier: Optional[str] = None
    retail_price: float = Field(default=0, description="售价/电商价")
    cost_estimate: float = Field(default=0, description="Estimated COGS (40% of retail or 省代价)")

    # Sales metrics (from yearly sales file)
    sales_volume: int = Field(default=0, description="销售数量")
    return_volume: int = Field(default=0, description="退货数量")
    net_volume: int = Field(default=0, description="净销量 = sales - returns")
    gross_revenue: float = Field(default=0, description="销售额")
    net_revenue: float = Field(default=0, description="净销售额")
    shipping_cost: float = Field(default=0, description="运费支出")

    # Computed metrics
    return_rate: float = Field(default=0, description="退货率 = returns / sales")
    estimated_margin: float = Field(default=0, description="估算毛利")
    margin_rate: float = Field(default=0, description="估算毛利率")
    avg_monthly_sales: float = Field(default=0, description="月均净销量")
    revenue_share: float = Field(default=0, description="Revenue share within total")

    # Inventory metrics (from inventory file)
    current_stock: int = Field(default=0, description="现库存")
    weekly_sales_rate: float = Field(default=0, description="周日均销量")
    days_remaining: Optional[float] = Field(default=None, description="库存可售天数")
    stock_to_sales_ratio: Optional[float] = Field(default=None, description="库销比(月)")
    recent_returns_4w: int = Field(default=0, description="近4周退货数")

    # Grading
    efficiency_rating: Optional[str] = None
    inventory_status: Optional[str] = None  # 健康/偏高/严重积压/零动销


class DimensionBreakdown(BaseModel):
    """Analysis breakdown by a single dimension (material, bag type, price tier)."""
    dimension_name: str = Field(description="e.g., '材质', '包型', '价格带'")
    dimension_value: str = Field(description="e.g., 'PU', '单肩包', '主力款'")
    sku_count: int = 0
    sku_share: float = 0
    sales_volume: int = 0
    return_volume: int = 0
    return_rate: float = 0
    net_volume: int = 0
    net_revenue: float = 0
    revenue_share: float = 0
    estimated_margin: float = 0
    margin_rate: float = 0
    avg_price: float = 0


class CrossTabCell(BaseModel):
    """Single cell in a cross-tab matrix (e.g., material × price tier)."""
    row_label: str
    col_label: str
    value: float = 0
    metric: str = Field(description="What this value represents: revenue, return_rate, volume, etc.")


class EfficiencyGrade(BaseModel):
    """Summary of efficiency grading results."""
    rating: str
    criteria: str
    sku_count: int = 0
    sku_share: float = 0
    total_net_revenue: float = 0
    revenue_share: float = 0
    avg_return_rate: float = 0


class InventoryHealthItem(BaseModel):
    """Inventory health assessment for a single SKU."""
    sku_code: str
    product_name: Optional[str] = None
    material: Optional[str] = None
    current_stock: int = 0
    weekly_daily_sales: float = 0
    days_remaining: Optional[float] = None
    stock_months_historical: Optional[float] = Field(default=None, description="库销比 based on annual avg")
    stock_months_recent: Optional[float] = Field(default=None, description="库销比 based on recent velocity")
    status: str = "未知"  # 健康/偏高/严重积压/零动销/缺货风险


class PurchaseRecommendation(BaseModel):
    """Purchasing recommendation by category."""
    category: str = Field(description="Material or material×bag_type combo")
    target_wos_months: float = Field(description="Target weeks-of-supply in months")
    current_stock: int = 0
    avg_monthly_sales: float = 0
    recommended_order_qty: int = 0
    estimated_order_cost: float = 0
    rationale: str = ""


class AnalysisSummary(BaseModel):
    """Top-level KPIs for the entire analysis."""
    total_skus: int = 0
    active_skus: int = Field(default=0, description="SKUs with net_volume > 0")
    total_sales_volume: int = 0
    total_return_volume: int = 0
    overall_return_rate: float = 0
    total_net_revenue: float = 0
    total_estimated_margin: float = 0
    overall_margin_rate: float = 0
    total_current_stock: int = 0
    avg_stock_months: Optional[float] = None
    grade_a_count: int = 0
    grade_d_count: int = 0
    top_sku_code: Optional[str] = None
    top_sku_revenue: float = 0


class AnalysisResult(BaseModel):
    """Complete analysis output — the main response object."""
    analysis_id: str
    summary: AnalysisSummary
    skus: list[ProductSKU] = []
    dimension_breakdowns: list[DimensionBreakdown] = []
    cross_tabs: list[CrossTabCell] = []
    efficiency_grades: list[EfficiencyGrade] = []
    inventory_health: list[InventoryHealthItem] = []
    purchase_recommendations: list[PurchaseRecommendation] = []
    key_insights: list[str] = []
