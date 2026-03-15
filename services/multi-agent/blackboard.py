"""Shared blackboard for inter-agent fact exchange."""

from __future__ import annotations

from typing import Callable


class Blackboard:
    """Shared key-value store for agents to post and read facts.

    Backed by Redis with optional TTL.  Supports pub/sub-style
    subscriptions so agents can react to new facts.
    """

    def post(self, tenant_id: str, key: str, value: dict, ttl_seconds: int | None = None) -> None:
        """Post a fact to the blackboard.

        Args:
            tenant_id: Tenant identifier (namespace).
            key: Fact key.
            value: Fact payload.
            ttl_seconds: Optional time-to-live in seconds.
        """
        raise NotImplementedError

    def read(self, tenant_id: str, key: str) -> dict | None:
        """Read a fact from the blackboard.

        Args:
            tenant_id: Tenant identifier.
            key: Fact key.

        Returns:
            The fact payload, or None if not found / expired.
        """
        raise NotImplementedError

    def subscribe(self, tenant_id: str, pattern: str, callback: Callable) -> None:
        """Subscribe to facts matching a key pattern.

        Args:
            tenant_id: Tenant identifier.
            pattern: Glob-style key pattern (e.g. "inventory.*").
            callback: Function called when a matching fact is posted.
        """
        raise NotImplementedError

    def list_facts(self, tenant_id: str) -> dict:
        """List all current facts for a tenant.

        Args:
            tenant_id: Tenant identifier.

        Returns:
            Dictionary of all active facts keyed by their key.
        """
        raise NotImplementedError
