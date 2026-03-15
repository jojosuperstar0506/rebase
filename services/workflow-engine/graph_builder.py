"""Graph building and persistence for workflow DAGs."""

from __future__ import annotations

from shared.schemas import WorkflowGraph


class GraphBuilder:
    """Builds, stores, and loads WorkflowGraph instances.

    Provides the persistence layer for workflow graphs backed by
    Neo4j (or another graph store).
    """

    def build(self, tenant_id: str, workflow_data: dict) -> WorkflowGraph:
        """Build a WorkflowGraph from structured workflow data.

        Args:
            tenant_id: Tenant identifier.
            workflow_data: Dictionary describing nodes, edges, and metadata.

        Returns:
            A validated WorkflowGraph.
        """
        raise NotImplementedError

    def store(self, graph: WorkflowGraph) -> None:
        """Persist a WorkflowGraph to the graph store.

        Args:
            graph: The workflow graph to persist.
        """
        raise NotImplementedError

    def load(self, tenant_id: str, workflow_name: str) -> WorkflowGraph:
        """Load a previously stored WorkflowGraph.

        Args:
            tenant_id: Tenant identifier.
            workflow_name: Name of the workflow to load.

        Returns:
            The requested WorkflowGraph.
        """
        raise NotImplementedError
