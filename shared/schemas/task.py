"""Schemas for task decomposition and execution results."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    WAITING = "waiting"
    COMPLETED = "completed"
    FAILED = "failed"
    ESCALATED = "escalated"


class Task(BaseModel):
    """A single executable task, possibly part of a goal decomposition."""
    task_id: str
    goal: str
    description: str = ""
    status: TaskStatus = TaskStatus.PENDING
    assigned_agent_id: str | None = None
    parent_task_id: str | None = None
    subtask_ids: list[str] = []
    dependencies: list[str] = []  # task_ids that must complete first
    checkpoint_data: dict = {}
    retry_count: int = 0
    max_retries: int = 3


class TaskResult(BaseModel):
    """Result of a completed task execution."""
    task_id: str
    status: TaskStatus
    output: dict = {}
    error_message: str | None = None
    duration_seconds: float = 0
    cost_tokens_input: int = 0
    cost_tokens_output: int = 0


class GoalDecomposition(BaseModel):
    """A business goal decomposed into executable tasks."""
    goal_id: str
    original_goal: str  # natural language goal from user
    tenant_id: str
    root_task_id: str
    tasks: list[Task] = []
