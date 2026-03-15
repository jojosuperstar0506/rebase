# Agent Executor

**Owner:** TBD (Platform Services)

## Scope

Decomposes high-level business goals into executable task trees, runs them
via agents with retry and checkpoint support, and escalates to humans when
autonomous resolution is not possible. Uses Temporal for durable workflow
execution.

## Key Dependencies

- `shared.schemas` -- `Task`, `TaskResult`, `GoalDecomposition`
- Temporal -- durable workflow orchestration
- Redis -- checkpoint persistence
- FastAPI -- HTTP API layer

## API Surface

| Method | Path | Description |
|--------|------|-------------|
| POST | `/tasks` | Submit a new task for execution |
| GET | `/tasks/{task_id}` | Get current task state |
| POST | `/tasks/{task_id}/cancel` | Cancel a running task |
| GET | `/agents/{agent_id}/status` | Get agent runtime status |

## Modules

- `goal_decomposer.py` -- LLM-driven goal-to-task decomposition
- `executor.py` -- task execution with retry logic
- `checkpoint.py` -- state persistence for crash recovery
- `escalation.py` -- human escalation rules and channels
- `temporal_workflows/base_workflow.py` -- base Temporal workflow class
- `api.py` -- FastAPI router (all endpoints return 501 until implemented)
