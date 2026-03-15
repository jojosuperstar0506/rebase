# Architecture Overview

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Customer Touchpoints                        │
│   (Dify Chatbot, Self-Serve Dashboard, Reports, Web Embed)      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                        API Gateway                              │
│                    (gateway/ — FastAPI)                          │
└──┬──────────────┬────────────────┬──────────────┬───────────────┘
   │              │                │              │
   ▼              ▼                ▼              ▼
┌────────┐ ┌─────────────┐ ┌────────────┐ ┌────────────┐
│Diagnos-│ │  Workflow    │ │   Agent    │ │   Cost     │
│tics    │ │  Engine      │ │  Executor  │ │  Engine    │
│Service │ │              │ │            │ │            │
└───┬────┘ └──────┬───────┘ └─────┬──────┘ └─────┬──────┘
    │             │               │              │
    └─────────────┴───────┬───────┴──────────────┘
                          │
              ┌───────────▼────────────┐
              │  Multi-Agent Runtime   │
              └───────────┬────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
   ┌──────────┐    ┌────────────┐   ┌──────────┐
   │   LLM    │    │ Connectors │   │   Data   │
   │  Layer   │    │   Layer    │   │  Layer   │
   │(DeepSeek,│    │ (Dify,     │   │(schemas, │
   │ GLM)     │    │  APIs)     │   │ storage) │
   └──────────┘    └────────────┘   └──────────┘
```

## Services

| Service | Directory | Owner | Phase | Status |
|---------|-----------|-------|-------|--------|
| diagnostics | `services/diagnostics/` | William | Phase 1 | Active |
| workflow-engine | `services/workflow-engine/` | TBD | Phase 1 | Stub |
| agent-executor | `services/agent-executor/` | TBD | Phase 2 | Stub |
| multi-agent | `services/multi-agent/` | TBD | Phase 3 | Stub |
| cost-engine | `services/cost-engine/` | TBD | Phase 1 | Stub |

## Shared Contracts

All service boundaries are defined by shared schemas in `shared/schemas/`. Every service must consume and produce data conforming to these contracts.

| Schema | File | Purpose |
|--------|------|---------|
| Intake Output | `intake_output.json` | Structured output from the Dify intake chatbot |
| Analysis Result | `analysis_result.py` | Pydantic model for diagnostic analysis output |
| Workflow Graph | `workflow_graph.py` | Pydantic model for workflow definitions |
| Agent | `agent.py` | Pydantic model for agent configuration and state |
| Task | `task.py` | Pydantic model for decomposed tasks |
| Cost | `cost.py` | Pydantic model for cost calculations and projections |

## Data Flow

### Phase 1 — Diagnostics (current)

```
Intake (Dify chatbot)
  → intake_output.json
    → Analysis Engine (classify → extract → metrics → insights)
      → analysis_result.py
        → Report Generator (HTML report with charts and ROI)
```

### Phase 2+ — Full Platform

```
Goal (client objective)
  → Task Decomposition (workflow-engine breaks goal into steps)
    → Agent Execution (agent-executor runs individual tasks)
      → Multi-Agent Coordination (multi-agent orchestrates parallel work)
        → Cost Optimization (cost-engine tracks spend and ROI)
```

## Tech Stack

| Technology | Role | Why |
|------------|------|-----|
| **FastAPI** | API framework (all services) | Async, Pydantic-native, auto-generates OpenAPI docs |
| **Dify** | Chatflow platform (intake agent) | Fast to MVP, handles file uploads, visual builder |
| **DeepSeek V3.2** | Primary LLM (production) | $0.25/M input tokens, strong CN+EN bilingual |
| **GLM-4.7-Flash** | LLM (free testing) | Zero cost during development iteration |
| **Pydantic** | Schema validation (shared contracts) | Type-safe, JSON-serializable, used by FastAPI |
| **React** | Frontend (self-serve dashboard) | Component model, large ecosystem |
| **Static HTML** | Web embed, reports | No framework overhead, prints cleanly to PDF |
