"""FastAPI router for the agent-executor service."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="", tags=["agent-executor"])


@router.post("/tasks")
async def create_task(body: dict) -> dict:
    """Submit a new task for agent execution."""
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/tasks/{task_id}")
async def get_task(task_id: str) -> dict:
    """Retrieve the current state of a task."""
    raise HTTPException(status_code=501, detail="Not implemented")


@router.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str) -> dict:
    """Request cancellation of a running task."""
    raise HTTPException(status_code=501, detail="Not implemented")


@router.get("/agents/{agent_id}/status")
async def get_agent_status(agent_id: str) -> dict:
    """Get the runtime status of an agent."""
    raise HTTPException(status_code=501, detail="Not implemented")
