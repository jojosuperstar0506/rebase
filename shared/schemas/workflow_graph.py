"""Schemas for workflow graph representation (stored in Neo4j)."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel


class NodeType(str, Enum):
    TASK = "task"
    DECISION = "decision"
    HANDOFF = "handoff"
    APPROVAL = "approval"
    DATA_ENTRY = "data_entry"
    NOTIFICATION = "notification"


class WorkflowNode(BaseModel):
    """A single step in a business workflow."""
    id: str
    name: str
    department: str
    node_type: NodeType = NodeType.TASK
    tool_used: str | None = None  # e.g., "Yongyou U8", "WeChat", "Excel", "paper"
    avg_time_minutes: float | None = None
    cost_per_execution_rmb: float | None = None
    error_rate: float | None = None
    is_manual: bool = True


class WorkflowEdge(BaseModel):
    """A connection between two workflow steps."""
    source_id: str
    target_id: str
    condition: str | None = None  # e.g., "amount > 50000"
    frequency: str | None = None  # e.g., "daily", "per_order"
    avg_wait_minutes: float | None = None


class WorkflowGraph(BaseModel):
    """A complete workflow DAG for a business process."""
    tenant_id: str
    workflow_name: str
    description: str = ""
    nodes: list[WorkflowNode] = []
    edges: list[WorkflowEdge] = []
    version: int = 1
