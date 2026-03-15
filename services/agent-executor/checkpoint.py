"""Checkpoint management for task execution state."""

from __future__ import annotations


class CheckpointManager:
    """Saves and restores task execution state for crash recovery.

    Backed by Redis or a durable store so that in-progress tasks
    can resume after agent restarts.
    """

    def save(self, task_id: str, state: dict) -> None:
        """Persist a checkpoint for a running task.

        Args:
            task_id: Identifier of the task.
            state: Serializable state dictionary.
        """
        raise NotImplementedError

    def load(self, task_id: str) -> dict | None:
        """Load the most recent checkpoint for a task.

        Args:
            task_id: Identifier of the task.

        Returns:
            The saved state dictionary, or None if no checkpoint exists.
        """
        raise NotImplementedError

    def clear(self, task_id: str) -> None:
        """Remove the checkpoint for a completed or cancelled task.

        Args:
            task_id: Identifier of the task.
        """
        raise NotImplementedError
