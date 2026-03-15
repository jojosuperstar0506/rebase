# Workflow Engine

**Owner:** TBD (Platform Services)

## Scope

Discovers, models, and analyzes business workflows. Ingests operational logs
(ERP audit trails, system exports) via process mining, reconstructs workflow
DAGs, and performs gap analysis against industry benchmarks to identify
automation opportunities.

## Key Dependencies

- `shared.schemas` -- `WorkflowGraph`, `WorkflowNode`, `WorkflowEdge`
- Neo4j -- graph persistence
- FastAPI -- HTTP API layer

## API Surface

| Method | Path | Description |
|--------|------|-------------|
| POST | `/workflows/{tenant_id}/mine` | Trigger process mining from ingested logs |
| GET | `/workflows/{tenant_id}/{workflow_name}` | Retrieve a stored workflow graph |
| POST | `/workflows/{tenant_id}/analyze` | Run gap analysis on a workflow |

## Modules

- `process_miner.py` -- log ingestion and workflow reconstruction
- `graph_builder.py` -- graph construction, storage, and retrieval
- `gap_analyzer.py` -- gap and benchmark analysis
- `api.py` -- FastAPI router (all endpoints return 501 until implemented)
