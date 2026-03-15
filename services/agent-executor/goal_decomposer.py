"""Goal decomposition: break high-level business goals into executable tasks."""

from __future__ import annotations

from shared.schemas import GoalDecomposition


class GoalDecomposer:
    """Decomposes natural-language business goals into task trees.

    Uses an LLM to interpret a user's goal, identify required steps,
    and produce a GoalDecomposition with dependency ordering.
    """

    def decompose(self, goal: str, tenant_id: str) -> GoalDecomposition:
        """Decompose a business goal into executable tasks.

        Args:
            goal: Natural-language description of the goal.
            tenant_id: Tenant identifier for context loading.

        Returns:
            A GoalDecomposition containing the task tree.
        """
        raise NotImplementedError
