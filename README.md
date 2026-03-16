# Rebase

> The Intelligence & Operations Layer for SMBs — making ERP data actually useful through AI virtual employees.

US & China Dual Market · 5-Layer Product Stack

---

## Team

| | **Joanna** (Co-Founder) | **William** (Co-Founder, CTO) |
|---|---|---|
| **Role** | Product vision, strategy, go-to-market | Technical architecture, platform engineering |
| **Owns** | What we build & why — product direction, agent design, client experience | How we build it — system architecture, core infrastructure, technical decisions |
| **Technical spike** | Agent prototyping — virtual employees that dog-food the platform | Diagnostics tool + ERP connectors — the first product clients touch |
| **Current focus** | Layer 2 intelligence demo + virtual employee prototypes | Diagnostics pipeline: intake → analysis → report |

> For detailed task tracking and sprint plans, see **[ROADMAP.md](ROADMAP.md)**.

---

## The Core Insight

Every well-run business needs four layers:

| Layer | What It Does | Enterprise (SAP) | Typical SMB Today | Our Product |
|-------|-------------|-------------------|-------------------|-------------|
| **Decision** | Strategic oversight, goal-setting | C-suite with dashboards + BI | The boss, running on gut feeling | Morning briefing, decision queue, ROI dashboard |
| **Intelligence** | Data → insights, benchmarks, recommendations | Analytics teams, Tableau, data warehouses | **MISSING.** No analytics, no benchmarks. Monthly Excel at best. | Benchmark library, anomaly detection, proactive recs — from existing ERP data |
| **Operations** | Automate workflows, coordinate handoffs, enforce SOPs | BPO teams, MuleSoft, ServiceNow | **MISSING.** Each employee does tasks their own way. Handoffs via chat. | Virtual employees with intent packs — automated, coordinated, 24/7 |
| **Data** | Transaction records, customer data, financials | SAP, Salesforce — deeply configured | Kingdee, Yonyou, QuickBooks — basic but functional | **UNCHANGED.** We connect to their existing tools. Zero migration. |

**SMBs have the data layer but are missing the intelligence and operations layers entirely. We add those two missing layers on top of their existing ERP — through AI virtual employees instead of software implementations.**

---

## Ideal Customer Profile

| Attribute | Description |
|-----------|-------------|
| **Decision maker** | Owner, GM, COO — P&L authority, knows the business is inefficient |
| **Company size** | 15–200 employees, $1M–$50M revenue |
| **ERP system** | Kingdee, Yonyou, QuickBooks, Xero, or structured spreadsheets |
| **Digital maturity** | Has basic transaction recording but NO analytics, NO workflow automation |
| **Industries** | Manufacturing, trading/distribution, e-commerce, professional services |
| **Markets** | US & China dual market |
| **Core frustration** | "We have Kingdee but it just stores invoices. Nobody looks at the reports." |

---

## 5-Layer Product Architecture

### Layer 1: Educate — AI Readiness for Decision Makers
> Before deployment, help decision makers understand what their data could reveal.

Industry-specific AI playbooks, workflow workshops, self-assessment tool, peer roundtables.

### Layer 2: Diagnose — Turn ERP Data Into Operational X-Ray
> Connect to Kingdee/QuickBooks, analyze transaction patterns, show insights the boss has never seen.

ERP data analysis, operational pattern mining, AI interview bot, benchmark comparison, restructuring blueprint.

### Layer 3: Deploy — Virtual Employees with Intent Packs
> Named AI agents that add the missing operations layer, connected to the client's ERP.

| Name | Dept | What They Do | ERP Integration |
|------|------|-------------|-----------------|
| **William (威廉)** | Finance | Invoice processing, PO matching, payment scheduling, anomaly flagging | Reads/writes Kingdee, QuickBooks, Yonyou |
| **Joanna (乔安娜)** | Marketing | Content execution, campaign reporting, competitor monitoring | Pulls revenue/product data from ERP |
| **Rachel (瑞秋)** | HR | Recruitment, onboarding, payroll data prep, employee inquiries | Syncs with Kingdee/Yonyou payroll |
| **Kevin (凯文)** | Sales | Lead qualification, CRM hygiene, pipeline reporting, follow-ups | Connects orders in ERP to sales pipeline |
| **Derek (德瑞克)** | IT | Help desk, account provisioning, system monitoring | Monitors ERP health, manages access |

Key capabilities: intent packs (reusable workflow modules), shadow mode (2-4 weeks alongside humans), overnight operations (process backlogs while business sleeps → morning briefing), computer-use agents (for legacy ERPs without APIs).

### Layer 4: Optimize — Cross-Department Orchestration
> Cross-department event bus, business goal interpreter, proactive intelligence from ERP data, continuous benchmarking.

### Layer 5: Scale — Industry-Packaged Platform
> Self-serve onboarding, industry knowledge packages, virtual employee marketplace, partner/reseller channel.

---

## Current Work

### William — Layer 2 Diagnostics (Client Entry Point)

| # | Piece | Status | Description |
|---|-------|--------|-------------|
| 1 | **AI Intake Agent** | Ready for Dify build | 15-20 min AI conversation → structured JSON |
| 2 | **Document Analysis Engine** | Stubs defined | Classify docs, extract fields, calculate metrics |
| 3 | **Report Generator** | Stubs defined | Auto-generated HTML findings report |

### Joanna — Virtual Employee Prototypes + Frontend

| # | Piece | Status | Description |
|---|-------|--------|-------------|
| 1 | **3-Screen Visualization Dashboard** | Done | Department map, before/after AI toggle, ROI summary |
| 2 | **Product Structure Agent** (Layer 2 demo) | v0.1 Done | Upload ERP exports → auto-analyze portfolio, inventory, purchasing recs |
| 3 | **Joanna Virtual Employee** (XHS Marketing) | TODO | One-button Xiaohongshu content creator with brand voice |
| 4 | **Image Generator** (Marketing toolkit) | TODO | Luxury-brand quality marketing visuals |

---

## Monorepo Structure

```
.
├── services/
│   ├── diagnostics/                 # Layer 2 — AI diagnostic product (William)
│   │   ├── intake-agent/            #   Dify chatbot: prompts, web embed, tests
│   │   ├── self-serve/              #   Instant dashboard API
│   │   ├── analysis-engine/         #   Doc classifier, extractor, metrics, insights
│   │   ├── report-generator/        #   HTML report generation + templates
│   │   ├── calculator/              #   AI workforce ROI calculator
│   │   └── api.py                   #   FastAPI router
│   ├── product-agent/               # Layer 2 intelligence demo (Joanna) — v0.1 working
│   │   ├── core/                    #   Analysis engine, column mapper, normalizer
│   │   ├── models/                  #   Pydantic schemas
│   │   ├── test_data/               #   Mock data generator
│   │   └── app.py                   #   Streamlit UI
│   ├── workflow-engine/             # Layer 4 — orchestration (stub)
│   ├── agent-executor/              # Layer 3 — virtual employee runtime (stub)
│   ├── multi-agent/                 # Layer 4 — multi-agent coordination (stub)
│   └── cost-engine/                 # Layer 4 — cost tracking and ROI (stub)
│
├── shared/schemas/                  # Shared Pydantic models + JSON schemas
├── gateway/                         # API gateway (FastAPI)
├── frontend/                        # React + Vite + TypeScript
├── infra/                           # Docker, deployment config
├── docs/                            # FRD, architecture docs
├── .env.example                     # Environment variable template
├── CLAUDE.md                        # Development guidelines
├── ROADMAP.md                       # Sprint plan + task ownership
└── README.md                        # This file
```

---

## Tech Stack

| Tool | Role |
|------|------|
| **FastAPI** | API framework (all backend services) |
| **Dify** | Chatflow platform (intake agent) |
| **DeepSeek V3** | Primary LLM — production analysis, classification |
| **Qwen (通义千问)** | Backup LLM — Chinese language tasks |
| **GLM-4-Flash** | Dev/testing LLM — free tier |
| **React + Vite + TypeScript** | Frontend |
| **Streamlit** | Internal tool UIs (Product Agent) |
| **PostgreSQL** | Client data storage |
| **Redis** | Cache, session state |
| **Neo4j** | Workflow graphs |
| **Temporal.io** | Durable workflow orchestration |
| **Alibaba Cloud** | Cloud hosting (HK → Guangzhou) |
| **Kingdee / Yonyou / QuickBooks** | ERP connectors (planned) |

---

## Cloud Strategy

```
Phase 1 (Now):   Alibaba Cloud Hong Kong — no ICP, launch in days
Phase 2 (Scale): Add Guangzhou — PIPL compliance, enterprise-ready
```

All config is region-agnostic via environment variables. See `.env.example`.

---

## Revenue Model

| Layer | Revenue Stream | Pricing |
|-------|---------------|---------|
| Layer 1: Educate | Workshops, playbooks, self-assessment | Free – $299 |
| Layer 2: Diagnose | ERP-connected diagnostic + blueprint | $5K–$12K |
| Layer 3: Deploy | Virtual employee subscriptions | $500–$2,000/mo per agent |
| Layer 4: Optimize | Premium orchestration tier | 20–40% premium |
| Layer 5: Scale | Self-serve platform | $2K–$12K/month |

### Milestones

| When | Revenue | Clients | Proof |
|------|---------|---------|-------|
| Month 6 | $5K–$8K MRR | 1–2 | Client paying for virtual employee |
| Month 10 | $20K–$40K MRR | 5–8 | Renewals, proactive intelligence working |
| Month 12 | $40K–$100K MRR | 10–15 | Repeatable sales, benchmark library |
| Month 18 | $120K–$250K MRR | 20–30 | Cross-department orchestration |
| Month 24 | $350K–$600K MRR | 50+ | Self-serve, enterprise pilot conversations |

---

## Competitive Positioning

| Category | Examples | How We Differ |
|----------|---------|---------------|
| Enterprise AI (a16z thesis) | Lio, Tessera, Factor Labs | Same architecture for SMBs on Kingdee/QuickBooks. Different market, price, entry point. |
| Digital employee platforms | Sintra, Noca, Relevance AI | We connect to actual ERP data. Intelligence layer from real transaction records. |
| SMB ERP vendors adding AI | Kingdee AI, Yonyou AI, Intuit AI | We provide the full intelligence + operations layer they'll never build. |
| General AI agent platforms | CrewAI, Dify, Coze | Business-outcome focused. Named virtual employees. Connected to financial data. |
| Management consulting | McKinsey, Deloitte | Our diagnostic is data-driven, our recs come with implementation, our benchmarks compound. |

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

### Product Structure Agent
```bash
cd services/product-agent
pip install -r requirements.txt
streamlit run app.py          # Start on :8501
```

---

## Development Rules

1. **Never hardcode** external URLs, API keys, or region-specific config. Always use `.env`. See `CLAUDE.md`.
2. **Shared schemas** in `shared/schemas/` are the contracts between services.
3. **ROADMAP.md** is the single source of truth for task ownership and sprint progress.
4. **README.md** and **ROADMAP.md** must stay in sync. See `CLAUDE.md` for consistency rules.

### Branches
- `main` — stable, reviewed
- `william/*` or `will/*` — William's working branches
- `joanna/*` or `claude/*` — Joanna's working branches
