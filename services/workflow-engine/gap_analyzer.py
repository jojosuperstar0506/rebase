"""Gap analysis for workflow graphs against best-practice benchmarks."""

from __future__ import annotations

from shared.schemas import WorkflowGraph


class GapAnalyzer:
    """Analyzes workflow graphs for inefficiencies and automation gaps.

    Identifies bottlenecks, redundant steps, and manual tasks that can
    be automated, optionally comparing against vertical-specific
    benchmarks.
    """

    def analyze(self, graph: WorkflowGraph) -> dict:
        """Analyze a workflow graph for gaps and improvement opportunities.

        Args:
            graph: The workflow graph to analyze.

        Returns:
            Dictionary containing identified gaps, scores, and
            recommendations.
        """
        raise NotImplementedError

    def compare_benchmark(self, graph: WorkflowGraph, vertical: str) -> dict:
        """Compare a workflow graph against industry benchmarks.

        Args:
            graph: The workflow graph to compare.
            vertical: Industry vertical (e.g. "manufacturing", "retail").

        Returns:
            Dictionary with benchmark deltas and ranked suggestions.
        """
        raise NotImplementedError
