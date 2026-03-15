"""Agent registry: register, discover, and monitor agent instances."""

from __future__ import annotations

from shared.schemas import AgentSpec, AgentStatus


class AgentRegistry:
    """Central registry for all agent instances in the platform.

    Agents register on startup and deregister on shutdown.  Other
    services use the registry to discover agents by capability.
    """

    def register(self, spec: AgentSpec) -> None:
        """Register a new agent instance.

        Args:
            spec: Full specification of the agent.
        """
        raise NotImplementedError

    def deregister(self, agent_id: str) -> None:
        """Remove an agent from the registry.

        Args:
            agent_id: Identifier of the agent to remove.
        """
        raise NotImplementedError

    def discover(self, capability: str) -> list[AgentSpec]:
        """Find agents that possess a given capability.

        Args:
            capability: Capability name to search for.

        Returns:
            List of matching agent specifications.
        """
        raise NotImplementedError

    def get_status(self, agent_id: str) -> AgentStatus:
        """Get the runtime status of a registered agent.

        Args:
            agent_id: Identifier of the agent.

        Returns:
            Current AgentStatus.
        """
        raise NotImplementedError
