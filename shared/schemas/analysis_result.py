"""Schemas for the document analysis engine output."""

from __future__ import annotations

from pydantic import BaseModel


class VolumeMetrics(BaseModel):
    """Volume-based metrics extracted from business documents."""
    orders_per_month: int | None = None
    shipments_per_month: int | None = None
    invoices_per_month: int | None = None
    manual_entries_per_day: int | None = None


class TimingMetrics(BaseModel):
    """Timing-based metrics — where time is wasted."""
    avg_order_processing_hours: float | None = None
    avg_approval_wait_hours: float | None = None
    avg_delivery_lead_days: float | None = None
    avg_reconciliation_hours_per_week: float | None = None


class ErrorMetrics(BaseModel):
    """Error/rework metrics."""
    data_entry_error_rate: float | None = None
    order_error_rate: float | None = None
    rework_hours_per_week: float | None = None
    missed_deadlines_per_month: int | None = None


class DocumentInsight(BaseModel):
    """A single insight extracted from document analysis."""
    category: str  # e.g., "bottleneck", "waste", "opportunity"
    department: str
    finding: str
    estimated_cost_rmb_monthly: float | None = None
    confidence: float  # 0.0 - 1.0


class AnalysisResult(BaseModel):
    """Complete output from the document analysis engine."""
    engagement_id: str
    documents_analyzed: int
    volume_metrics: VolumeMetrics
    timing_metrics: TimingMetrics
    error_metrics: ErrorMetrics
    insights: list[DocumentInsight] = []
    narrative_summary: str = ""
