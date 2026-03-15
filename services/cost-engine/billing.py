"""Billing engine: create billable events and generate invoices."""

from __future__ import annotations

from shared.schemas import BillingEvent


class BillingEngine:
    """Manages billable events and invoice generation.

    Collects billing events from across the platform and produces
    per-tenant invoices for a given billing period.
    """

    def create_event(self, event: BillingEvent) -> None:
        """Record a billable event.

        Args:
            event: The billing event to record.
        """
        raise NotImplementedError

    def get_invoice(self, tenant_id: str, period: str) -> dict:
        """Generate an invoice for a tenant and billing period.

        Args:
            tenant_id: Tenant identifier.
            period: Billing period (e.g. "2024-01").

        Returns:
            Invoice dictionary with line items, totals, and metadata.
        """
        raise NotImplementedError
