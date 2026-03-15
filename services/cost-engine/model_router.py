"""Model routing: select the optimal LLM for a given task."""

from __future__ import annotations


class ModelRouter:
    """Selects the best LLM model based on task type and complexity.

    Balances cost, latency, and quality by routing simple tasks to
    cheaper models and complex tasks to more capable ones.
    """

    def select_model(self, task_type: str, complexity: str) -> str:
        """Select the optimal model for a task.

        Args:
            task_type: Category of task (e.g. "extraction", "reasoning").
            complexity: Complexity level (e.g. "low", "medium", "high").

        Returns:
            Model identifier string (e.g. "deepseek-v3", "qwen-72b").
        """
        raise NotImplementedError

    def get_available_models(self) -> list[str]:
        """List all models currently available for routing.

        Returns:
            List of model identifier strings.
        """
        raise NotImplementedError
