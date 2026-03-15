"""Process mining: ingest operational logs and reconstruct workflow graphs."""

from __future__ import annotations

from shared.schemas import WorkflowGraph


class ProcessMiner:
    """Mines business-process workflows from operational log data.

    Ingests raw logs (ERP exports, system audit trails, manual records)
    and reconstructs the underlying workflow graph using process-mining
    algorithms.
    """

    def ingest_logs(self, tenant_id: str, logs: list[dict]) -> None:
        """Ingest raw operational logs for a tenant.

        Args:
            tenant_id: Tenant identifier.
            logs: List of log entries (format TBD per connector).
        """
        raise NotImplementedError

    def reconstruct_workflow(self, tenant_id: str) -> WorkflowGraph:
        """Reconstruct a workflow graph from previously ingested logs.

        Args:
            tenant_id: Tenant identifier.

        Returns:
            A WorkflowGraph representing the discovered process.
        """
        raise NotImplementedError
