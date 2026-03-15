# Cost Engine

**Owner:** TBD (Platform Services)

## Scope

Tracks per-request costs across all LLM calls and agent actions, projects
and compares ROI for customer engagements, routes tasks to the optimal
model by cost/quality trade-off, and produces billing events and invoices.

## Key Dependencies

- `shared.schemas` -- `CostRecord`, `ROIProjection`, `BillingEvent`
- TimescaleDB / PostgreSQL -- cost event storage
- FastAPI -- HTTP API layer

## API Surface

| Method | Path | Description |
|--------|------|-------------|
| GET | `/costs/{tenant_id}` | Get cost summary for a tenant |
| GET | `/roi/{engagement_id}` | Get ROI projection for an engagement |
| POST | `/billing/events` | Record a new billable event |

## Modules

- `tracker.py` -- cost recording and aggregated summaries
- `roi_calculator.py` -- ROI projection and actual-vs-projected comparison
- `model_router.py` -- optimal model selection by task type and complexity
- `billing.py` -- billable event recording and invoice generation
- `api.py` -- FastAPI router (all endpoints return 501 until implemented)
