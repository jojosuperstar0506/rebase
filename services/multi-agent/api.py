"""FastAPI router for the multi-agent service."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="", tags=["multi-agent"])


@router.post("/agents")
async def register_agent(body: dict) -> dict:
    """Register a new agent in the registry."""
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/agents")
async def list_agents() -> dict:
    """List all registered agents."""
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: str) -> dict:
    """Get details and status of a specific agent."""
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/blackboard/{tenant_id}")
async def post_fact(tenant_id: str, body: dict) -> dict:
    """Post a fact to the shared blackboard."""
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/blackboard/{tenant_id}/{key}")
async def read_fact(tenant_id: str, key: str) -> dict:
    """Read a fact from the shared blackboard."""
    raise HTTPException(status_code=501, detail="Not implemented")
