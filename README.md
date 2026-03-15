# Rebase

> AI-powered platform helping Chinese SMBs automate inter-departmental workflows — starting with diagnostics, scaling to autonomous agents.

---

## Team

| | **Joanna** (Co-Founder) | **William** (Co-Founder, CTO) |
|---|---|---|
| **Role** | Product vision, strategy, go-to-market | Technical architecture, platform engineering |
| **Owns** | What we build & why — product direction, agent design, client experience | How we build it — system architecture, core infrastructure, technical decisions |
| **Technical spike** | Agent prototyping — 3 internal "virtual employees" | Diagnostics tool — the first product clients touch |
| **Current focus** | FRD + agent prototypes + frontend/cloud | Diagnostics pipeline: intake → analysis → report |

> For detailed task tracking and sprint plans, see **[ROADMAP.md](ROADMAP.md)**.

---

## What We're Building

An AI platform that gives SMB owners an honest look at their operations — starting with an automated diagnostic product, then expanding into workflow discovery, autonomous agent execution, and multi-agent collaboration.

### The 4 Pillars

| Phase | Pillar | Service | Status |
|-------|--------|---------|--------|
| 1 | Workflow Discovery & Diagnosis | `services/diagnostics/` | Active — William building |
| 2 | Autonomous Agent Execution | `services/agent-executor/` | Scaffolded |
| 3 | Multi-Agent Collaboration | `services/multi-agent/` | Scaffolded |
| 4 | Cost Optimization | `services/cost-engine/` | Scaffolded |

### The Client Experience (Phase 1 — Diagnostics)

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
│   ├── workflow-engine/             # Workflow graph definitions (stub)
│   ├── agent-executor/              # Autonomous task execution (stub)
│   ├── multi-agent/                 # Multi-agent orchestration (stub)
│   └── cost-engine/                 # Cost tracking and ROI (stub)
│
├── shared/                          # Shared contracts across services
│   └── schemas/                     #   Pydantic models + JSON schemas
│
├── gateway/                         # API gateway (FastAPI)
├── frontend/                        # React + Vite + TypeScript
│   └── src/
│       ├── pages/DiagnosticDashboard.tsx  # 3-screen visualization (live on Vercel)
│       └── data/mockVisualization.ts      # Demo data for dashboard
│
├── infra/                           # Docker, deployment config
├── docs/                            # FRD, architecture docs
├── .env.example                     # Environment variable template
├── CLAUDE.md                        # Development guidelines (read by Claude Code)
├── ROADMAP.md                       # Sprint plan + task ownership
└── README.md                        # This file
```

---

## Current Work

### William — Diagnostics Tool (Client Entry Point)

The diagnostics service is the first product being built. Three pieces:

| # | Piece | Status | Description |
|---|-------|--------|-------------|
| 1 | **AI Intake Agent** | Ready for Dify build | 15-20 min AI conversation collecting company profile, pain points, document uploads → structured JSON |
| 2 | **Document Analysis Engine** | Stubs defined | Classify docs, extract fields, calculate metrics, generate narrative insights |
| 3 | **Report Generator** | Stubs defined | Auto-generated HTML findings report with charts, waste calculations, ROI projections |

**What's built so far:**
- Master system prompt with 5-phase conversation structure
- 5 vertical-specific modules (export, construction, distribution, industrial, property)
- JSON output schema for the analysis pipeline
- Branded web embed page (EN/CN)
- Mock test conversation with expected output

### Joanna — Agent Prototypes + Frontend

| # | Piece | Status | Description |
|---|-------|--------|-------------|
| 1 | **3-Screen Visualization Dashboard** | Done | Department map, before/after AI toggle, ROI summary — [live on Vercel](https://frontend-sand-beta-37.vercel.app) |
| 2 | **Product Structure Agent** | TODO | Inventory tracking, reorder decisions, supplier analysis |
| 3 | **Marketing Agent (XHS)** | TODO | One-button Xiaohongshu content creator with brand voice |
| 4 | **Image Generator Agent** | TODO | Luxury-brand quality marketing visuals |

---

## Tech Stack

| Tool | Role |
|------|------|
| **FastAPI** | API framework (all backend services) |
| **Dify** | Chatflow platform (intake agent) |
| **DeepSeek V3** | Primary LLM — ¥0.25/M tokens |
| **Qwen (通义千问)** | Backup LLM — free tier available |
| **GLM-4-Flash** | Dev/testing LLM — free |
| **React + Vite + TypeScript** | Frontend |
| **PostgreSQL** | Client data storage |
| **Redis** | Cache, session state |
| **Neo4j** | Workflow graphs |
| **Temporal.io** | Durable workflow orchestration |
| **Alibaba Cloud (Hong Kong)** | Cloud hosting |

---

## Cloud Strategy

```
Phase 1 (Now):   Alibaba Cloud Hong Kong — no ICP, launch in days
Phase 2 (Scale): Add Guangzhou — PIPL compliance, enterprise-ready
```

All config is region-agnostic via environment variables. See `.env.example`.

**Estimated cost: ~¥400-900/mo starting out.**

---

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+

### Backend
```bash
cp .env.example .env          # Copy env template, fill in your values
pip install -e ".[dev]"       # Install Python dependencies
python -m gateway.main        # Start API gateway on :8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev                   # Start dev server on :5173
```

### For the Intake Agent (Dify)
1. Read `services/diagnostics/intake-agent/dify-chatflow-guide.md`
2. System prompt: `services/diagnostics/intake-agent/prompts/master-system-prompt.md`
3. Test with: `services/diagnostics/intake-agent/test-conversations/mock-export-manufacturer.md`

---

## Development Rules

1. **Never hardcode** external URLs, API keys, or region-specific config. Always use `.env`. See `CLAUDE.md`.
2. **Shared schemas** in `shared/schemas/` are the contracts between services. All services must conform.
3. **ROADMAP.md** is the single source of truth for task ownership and sprint progress.

### Branches
- `main` — stable, reviewed
- `william/*` or `will/*` — William's working branches
- `joanna/*` or `claude/*` — Joanna's working branches
