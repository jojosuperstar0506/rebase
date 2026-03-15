# Rebase

> We empower SMBs business owners to breathe and refocus on what they truly want to do - making greater products for happier customers, not managing the day-to-day mundane tasks.

---

## What We're Building

An AI-powered platform that gives SMB owners an honest look at their current operations and shows them where they could deploy AI tools to fill in the gaps — starting with an automated and personalized diagnostic tool, then expanding into workflow discovery and optimization, autonomous agent execution, and multi-agent collaboration. Essentially, an easy-to-use best-in-class vibe business that co-pilots with SMB onwers without any business ops knowledge and background.

**The client experience (Phase 1 — Diagnostics):**
```
Day 0:  Client talks to an AI analyst, uploads their business documents
Day 1:  Client receives an auto-generated findings report with insights they didn't expect
```

No forms. No waiting. No human in the loop for Day 0-1.

---

## Monorepo Structure

```
.
├── services/                        # All backend services
│   ├── diagnostics/                 # Phase 1 — AI diagnostic product (William)
│   │   ├── intake-agent/            #   Dify chatbot: prompts, web embed, tests
│   │   ├── self-serve/              #   Instant dashboard API
│   │   ├── analysis-engine/         #   Doc classifier, extractor, metrics, insights
│   │   ├── report-generator/        #   HTML report generation + templates
│   │   ├── calculator/              #   AI workforce ROI calculator (JSX)
│   │   └── api.py                   #   FastAPI router for diagnostics
│   ├── workflow-engine/             # Phase 1 — Workflow graph definitions (stub)
│   ├── agent-executor/              # Phase 2 — Autonomous task execution (stub)
│   ├── multi-agent/                 # Phase 3 — Multi-agent orchestration (stub)
│   └── cost-engine/                 # Phase 1 — Cost tracking and ROI (stub)
│
├── shared/                          # Shared contracts across services
│   └── schemas/                     #   Pydantic models + JSON schemas
│       ├── intake_output.json       #   Intake chatbot output format
│       ├── analysis_result.py       #   Analysis pipeline output
│       ├── workflow_graph.py        #   Workflow definitions
│       ├── agent.py                 #   Agent configuration and state
│       ├── task.py                  #   Decomposed task definitions
│       └── cost.py                  #   Cost calculations and projections
│
├── gateway/                         # API gateway (FastAPI)
├── frontend/                        # React frontend
├── infra/                           # Infrastructure config
├── tests/                           # Test suite
├── docs/                            # Documentation
│   ├── frd.md                       #   Functional requirements (summary)
│   └── architecture.md              #   System architecture overview
│
├── archive/                         # Earlier materials (pitch pages, roadmap)
├── Makefile
├── pyproject.toml
└── README.md
```

---

## Services

| # | Service | Owner | Phase | Status | Description |
|---|---------|-------|-------|--------|-------------|
| 1 | **diagnostics** | William | 1 | Active | AI intake agent, document analysis, report generation |
| 2 | **workflow-engine** | TBD | 1 | Stub | Workflow graph definitions and discovery |
| 3 | **cost-engine** | TBD | 1 | Stub | Cost tracking, waste calculations, ROI projections |
| 4 | **agent-executor** | TBD | 2 | Stub | Autonomous task execution |
| 5 | **multi-agent** | TBD | 3 | Stub | Multi-agent orchestration and collaboration |

---

## Diagnostic Product — Current Focus

The diagnostics service is the first product being built. It has 3 pieces:

| # | Piece | Status | Description |
|---|-------|--------|-------------|
| 1 | **AI Intake Agent** | Ready for Dify build | Conversational agent that interviews the client, collects business profile + pain points, accepts document uploads, outputs structured JSON |
| 2 | **Document Analysis Engine** | Stubs defined | Automated pipeline: classify docs, extract fields, calculate metrics, generate narrative insights |
| 3 | **Report Generator** | Stubs defined | Auto-generated HTML findings report with charts, waste calculations, and ROI projections |

### Piece 1: AI Intake Agent

A 15-20 minute conversation where an AI analyst interviews the client about their business. No forms, no questionnaires — just a natural conversation that collects:
- Company profile (headcount, revenue, departments, tools)
- Operational pain points (with specific numbers: hours, frequency, cost)
- Document uploads (orders, invoices, quotations, reports)

**What's built:**
- Master system prompt with 5-phase conversation structure and 10 behavioral rules
- 5 vertical-specific modules (export, construction, distribution, industrial, property)
- JSON output schema for the analysis pipeline
- Branded web embed page with EN/CN support
- Dify chatflow configuration guide
- Mock test conversation with expected JSON output

---

## Quick Start

### For the Intake Agent (Dify)
1. Read `services/diagnostics/intake-agent/dify-chatflow-guide.md`
2. System prompt: `services/diagnostics/intake-agent/prompts/master-system-prompt.md`
3. Test with: `services/diagnostics/intake-agent/test-conversations/mock-export-manufacturer.md`
4. Output format: `services/diagnostics/intake-agent/prompts/output-schema.json`

### For the Backend Services
1. See `docs/architecture.md` for the full system diagram
2. Shared schemas are in `shared/schemas/` — all services must conform to these contracts
3. Each service has its own `api.py` with FastAPI routes (currently stubs except diagnostics)

---

## Tech Stack

| Tool | Role | Why |
|------|------|-----|
| **FastAPI** | API framework | Async, Pydantic-native, auto-generates OpenAPI docs |
| **Dify** | Chatflow platform | Fast to MVP, handles file uploads, visual builder |
| **DeepSeek V3.2** | Primary LLM (production) | $0.25/M input, handles CN+EN well |
| **GLM-4.7-Flash** | LLM (free testing) | Zero cost for development iteration |
| **Pydantic** | Schema validation | Type-safe, JSON-serializable, used by FastAPI |
| **React** | Frontend | Component model, large ecosystem |
| **Static HTML** | Web embed, reports | No framework overhead, prints to PDF |

---

## How We Work

**Will** — Strategy, prompts, conversation flows, client materials, report design

**Joanna** — Dify builds, analysis pipeline, integrations, backend

### Branches
- `main` — stable, reviewed
- `will/*` — Will's working branches
- `joanna/*` — Joanna's working branches

---

## Archive

The `archive/` folder contains earlier work — client pitch pages and the business roadmap. These are still valid but not the current priority. We'll revisit them once the diagnostic product is live.
