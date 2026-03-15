"""Cost tracking: record and query LLM and action costs."""

from __future__ import annotations

from shared.schemas import CostRecord


class CostTracker:
    """Records per-request cost events and provides aggregated summaries.

    Every LLM call and billable action produces a CostRecord that is
    stored for reporting and billing.
    """

    def record(self, cost: CostRecord) -> None:
        """Record a single cost event.

        Args:
            cost: The cost record to persist.
        """
        raise NotImplementedError

    def get_summary(self, tenant_id: str, period: str) -> dict:
        """Get an aggregated cost summary for a tenant and period.

        Args:
            tenant_id: Tenant identifier.
            period: Time period (e.g. "2024-01", "2024-Q1").

        Returns:
            Summary dictionary with totals, breakdowns by agent/model.
        """
        raise NotImplementedError

    def get_agent_costs(self, agent_id: str) -> list[CostRecord]:
        """Get all cost records for a specific agent.

        Args:
            agent_id: Agent identifier.

        Returns:
            List of CostRecord entries.
        """
        raise NotImplementedError
