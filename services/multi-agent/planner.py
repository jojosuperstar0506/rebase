"""Collaborative planning across multiple agents."""

from __future__ import annotations

from shared.schemas import AgentSpec


class CollaborativePlanner:
    """Creates and negotiates multi-agent plans.

    Given a high-level goal and a set of available agents, produces
    a plan that assigns sub-tasks and coordinates execution order.
    """

    def create_plan(self, goal: str, agents: list[AgentSpec]) -> dict:
        """Create an initial plan assigning tasks to agents.

        Args:
            goal: Natural-language description of the objective.
            agents: Available agents with their capabilities.

        Returns:
            Plan dictionary with task assignments and ordering.
        """
        raise NotImplementedError

    def negotiate(self, plan: dict, agents: list[AgentSpec]) -> dict:
        """Negotiate plan adjustments with participating agents.

        Args:
            plan: The proposed plan.
            agents: Agents involved in the plan.

        Returns:
            Finalized plan after negotiation.
        """
        raise NotImplementedError
