"""Inter-Agent Communication Protocol (IACP) — structured messages between agents.

Agents communicate via typed messages, NOT free-text LLM output.
This prevents hallucination drift in multi-agent chains.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class MessageType(str, Enum):
    REQUEST = "request"      # Ask another agent to do something
    RESPONSE = "response"    # Reply to a request
    DELEGATE = "delegate"    # Hand off a sub-task entirely
    NOTIFY = "notify"        # Broadcast an event (no response expected)
    NEGOTIATE = "negotiate"  # Propose a plan for joint approval
    ESCALATE = "escalate"    # Request human decision
    CANCEL = "cancel"        # Abort a previously sent request/delegation


class MessagePriority(str, Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"


class RetryPolicy(BaseModel):
    """What to do if no response is received."""
    max_retries: int = 3
    backoff_seconds: float = 5.0
    fallback_action: str | None = None  # e.g., "escalate", "use_alternative"


class AgentRef(BaseModel):
    """Reference to an agent."""
    agent_id: str
    agent_type: str


class IACPMessage(BaseModel):
    """A single message in the inter-agent communication protocol."""
    message_id: str
    correlation_id: str  # links related messages in a conversation
    sender: AgentRef
    receiver: AgentRef | None = None  # None = broadcast
    message_type: MessageType
    priority: MessagePriority = MessagePriority.NORMAL
    payload: dict = {}  # typed per message_type in practice
    context: dict = {}  # current workflow, task, business goal
    deadline: datetime | None = None
    retry_policy: RetryPolicy | None = None
    timestamp: datetime | None = None
