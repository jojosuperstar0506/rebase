"""Cross-service event definitions for the message bus (RocketMQ)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class BaseEvent(BaseModel):
    """Base class for all platform events."""
    event_id: str
    tenant_id: str
    timestamp: datetime | None = None


# --- Diagnostics events ---

class IntakeCompleted(BaseEvent):
    """Fired when a customer completes the AI intake conversation."""
    engagement_id: str
    vertical: str
    language: str = "cn"


class DocumentUploaded(BaseEvent):
    """Fired when a customer uploads a document for analysis."""
    engagement_id: str
    document_type: str
    file_path: str


class AnalysisReady(BaseEvent):
    """Fired when document analysis completes for an engagement."""
    engagement_id: str
    documents_analyzed: int


class ReportGenerated(BaseEvent):
    """Fired when a diagnostic report is generated."""
    engagement_id: str
    report_url: str


# --- Agent execution events ---

class TaskDispatched(BaseEvent):
    """Fired when a task is assigned to an agent."""
    task_id: str
    agent_id: str
    goal: str


class TaskCompleted(BaseEvent):
    """Fired when an agent finishes a task."""
    task_id: str
    agent_id: str
    success: bool
    duration_seconds: float = 0


class TaskEscalated(BaseEvent):
    """Fired when an agent escalates to human."""
    task_id: str
    agent_id: str
    reason: str


# --- Cost events ---

class CostRecorded(BaseEvent):
    """Fired when a cost event is recorded."""
    request_id: str
    model_used: str
    cost_rmb: float
