"""FastAPI router for the cost-engine service."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="", tags=["cost-engine"])


@router.get("/costs/{tenant_id}")
async def get_costs(tenant_id: str) -> dict:
    """Get cost summary for a tenant."""
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/roi/{engagement_id}")
async def get_roi(engagement_id: str) -> dict:
    """Get ROI projection for an engagement."""
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/billing/events")
async def create_billing_event(body: dict) -> dict:
    """Record a new billable event."""
    raise HTTPException(status_code=501, detail="Not implemented")
