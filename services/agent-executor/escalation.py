"""Escalation logic for tasks that cannot be completed autonomously."""

from __future__ import annotations

from shared.schemas import Task


class EscalationManager:
    """Decides when and how to escalate failed or risky tasks to humans.

    Supports multiple escalation channels (WeChat, DingTalk, email)
    and applies configurable rules per tenant.
    """

    def should_escalate(self, task: Task, error: Exception) -> bool:
        """Determine whether a task failure warrants human escalation.

        Args:
            task: The failed task.
            error: The exception that caused the failure.

        Returns:
            True if escalation is warranted.
        """
        raise NotImplementedError

    def escalate(self, task: Task, reason: str, channel: str) -> None:
        """Escalate a task to a human via the specified channel.

        Args:
            task: The task to escalate.
            reason: Human-readable explanation of why escalation is needed.
            channel: Notification channel (e.g. "wechat", "dingtalk", "email").
        """
        raise NotImplementedError
