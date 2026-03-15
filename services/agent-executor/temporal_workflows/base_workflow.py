"""Base Temporal workflow for agent task execution."""

from __future__ import annotations


class BaseAgentWorkflow:
    """Base Temporal workflow for executing agent tasks.

    Subclass this to define domain-specific workflows that benefit
    from Temporal's durable execution guarantees.
    """

    async def run(self, task_id: str, payload: dict) -> dict:
        """Main workflow entry point.

        Args:
            task_id: Identifier of the task being executed.
            payload: Workflow-specific input data.

        Returns:
            Dictionary with workflow results.
        """
        raise NotImplementedError

    async def handle_error(self, task_id: str, error: Exception) -> dict:
        """Handle an error during workflow execution.

        Args:
            task_id: Identifier of the task that errored.
            error: The exception that occurred.

        Returns:
            Dictionary describing the recovery action taken.
        """
        raise NotImplementedError
