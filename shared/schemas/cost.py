"""Schemas for cost tracking, ROI projection, and billing."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class CostRecord(BaseModel):
    """A single cost event (one LLM call or action)."""
    request_id: str
    tenant_id: str
    agent_id: str | None = None
    task_id: str | None = None
    model_used: str
    input_tokens: int = 0
    output_tokens: int = 0
    cost_rmb: float = 0.0
    latency_ms: int = 0
    timestamp: datetime | None = None


class ROIProjection(BaseModel):
    """ROI projection for a customer engagement."""
    engagement_id: str
    tenant_id: str
    # Current state (manual)
    manual_hours_per_month: float = 0
    manual_cost_rmb_per_month: float = 0
    # Projected state (automated)
    automated_hours_per_month: float = 0
    platform_cost_rmb_per_month: float = 0
    # Savings
    hours_saved_per_month: float = 0
    net_savings_rmb_per_month: float = 0
    payback_months: float = 0


class BillingEventType(str, Enum):
    AGENT_EXECUTION = "agent_execution"
    DOCUMENT_ANALYSIS = "document_analysis"
    DIAGNOSIS_REPORT = "diagnosis_report"
    API_CALL = "api_call"


class BillingEvent(BaseModel):
    """A billable event for a customer."""
    event_id: str
    tenant_id: str
    event_type: BillingEventType
    description: str = ""
    amount_rmb: float = 0.0
    timestamp: datetime | None = None
