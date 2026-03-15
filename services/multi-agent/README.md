# Multi-Agent Coordination

**Owner:** TBD (Platform Services)

## Scope

Manages the lifecycle of multiple cooperating agents. Provides a registry
for agent discovery, a shared blackboard for fact exchange, conflict
mediation when agents compete for resources, and collaborative planning
across agent boundaries.

## Key Dependencies

- `shared.schemas` -- `AgentSpec`, `AgentStatus`, `AgentCapability`
- Redis -- blackboard key-value store and pub/sub
- FastAPI -- HTTP API layer

## API Surface

| Method | Path | Description |
|--------|------|-------------|
| POST | `/agents` | Register a new agent |
| GET | `/agents` | List all registered agents |
| GET | `/agents/{agent_id}` | Get agent details and status |
| POST | `/blackboard/{tenant_id}` | Post a fact to the blackboard |
| GET | `/blackboard/{tenant_id}/{key}` | Read a fact from the blackboard |

## Modules

- `registry.py` -- agent registration and capability discovery
- `mediator.py` -- conflict resolution with business rules
- `blackboard.py` -- shared fact store with TTL and subscriptions
- `planner.py` -- multi-agent plan creation and negotiation
- `api.py` -- FastAPI router (all endpoints return 501 until implemented)
