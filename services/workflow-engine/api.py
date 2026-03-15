"""FastAPI router for the workflow-engine service."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/workflows", tags=["workflow-engine"])


@router.post("/{tenant_id}/mine")
async def mine_workflow(tenant_id: str) -> dict:
    """Trigger process mining for a tenant from ingested logs."""
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/{tenant_id}/{workflow_name}")
async def get_workflow(tenant_id: str, workflow_name: str) -> dict:
    """Retrieve a stored workflow graph by tenant and name."""
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/{tenant_id}/analyze")
async def analyze_workflow(tenant_id: str) -> dict:
    """Run gap analysis on a tenant's workflow."""
    raise HTTPException(status_code=501, detail="Not implemented")
