"""Task execution with retry and checkpoint support."""

from __future__ import annotations

from shared.schemas import Task, TaskResult


class TaskExecutor:
    """Executes individual tasks, optionally with retry logic.

    Coordinates with CheckpointManager for state persistence and
    EscalationManager when failures exceed retry limits.
    """

    def execute(self, task: Task) -> TaskResult:
        """Execute a single task.

        Args:
            task: The task to execute.

        Returns:
            A TaskResult describing the outcome.
        """
        raise NotImplementedError

    def execute_with_retry(self, task: Task) -> TaskResult:
        """Execute a task with automatic retries on transient failures.

        Args:
            task: The task to execute.

        Returns:
            A TaskResult after all attempts are exhausted or success.
        """
        raise NotImplementedError
