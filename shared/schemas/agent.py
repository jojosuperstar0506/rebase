"""Schemas for agent specification and status tracking."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel


class AgentType(str, Enum):
    PROCUREMENT = "procurement"
    INVENTORY = "inventory"
    FINANCE = "finance"
    HR = "hr"
    SALES = "sales"
    LOGISTICS = "logistics"
    CUSTOM = "custom"


class AgentState(str, Enum):
    IDLE = "idle"
    PLANNING = "planning"
    EXECUTING = "executing"
    WAITING = "waiting"
    ESCALATING = "escalating"
    SUSPENDED = "suspended"


class AgentCapability(BaseModel):
    """A single capability an agent possesses."""
    name: str  # e.g., "create_purchase_order", "check_inventory"
    description: str
    required_permissions: list[str] = []
    supported_connectors: list[str] = []  # e.g., ["yongyou", "kingdee"]


class AgentSpec(BaseModel):
    """Full specification for an agent instance."""
    agent_id: str
    agent_type: AgentType
    tenant_id: str
    name: str
    capabilities: list[AgentCapability] = []
    permissions: list[str] = []
    objectives: list[str] = []  # ranked business goals
    constraints: dict[str, str | float] = {}  # e.g., {"max_po_amount": 50000}
    model: str = "deepseek-v3"  # LLM model to use


class AgentStatus(BaseModel):
    """Runtime status of an agent."""
    agent_id: str
    state: AgentState = AgentState.IDLE
    current_task_id: str | None = None
    tasks_completed: int = 0
    errors_count: int = 0
    uptime_seconds: float = 0
