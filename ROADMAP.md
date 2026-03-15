# Rebase — Product Roadmap

> Single source of truth for product progress. Pull this up every session.

**Last updated:** 2026-03-15

---

## Team

| | **Joanna** (Co-Founder) | **William** (Co-Founder, CTO) |
|---|---|---|
| **Role** | Product vision, strategy, go-to-market | Technical architecture, platform engineering |
| **Owns** | What we build & why — product direction, agent design, client experience | How we build it — system architecture, core infrastructure, technical decisions |
| **Technical spike** | Agent prototyping — 3 internal "virtual employees" that dog-food the platform | Diagnostics tool — the first product clients touch, from AI conversation to instant insights |
| **Current focus** | FRD + 3 agent prototypes + frontend/cloud | Building the diagnostics tool as our first landing touchpoint — the AI-powered entry door for every client |

---

## How the Work Splits

```
William (CTO) builds the FRONT DOOR       Joanna builds the AGENTS
(first thing every client touches)         (internal tools that prove the model)

AI intake conversation ────►               Product Structure Agent
Document analysis engine ──►               Marketing Agent (XHS)
Instant insights dashboard ►               Image Generator
Auto-generated report ─────►               (dog-food our own platform)

The diagnostics tool IS the product        Product vision through working code
Client's first "wow" moment               Prompt engineering, output quality
Converts prospects to believers            Proves agents work — we use them ourselves
Owns the client-facing entry point         Owns agent design & go-to-market
```

---

## Where We Are Now (as of 2026-03-15)

| Stream | Owner | Status | Notes |
|--------|-------|--------|-------|
| Diagnostics tool (client entry point) | William | In progress | Architecting intake agent + analysis pipeline — the first thing every client experiences |
| 3-screen visualization dashboard | Joanna | Done | Built & deployed to Vercel — department map, before/after toggle, ROI summary |
| FRD (functional requirements) | Joanna | In progress | Defining overall product features & functions |
| Cloud infrastructure & deployment | Joanna | In progress | Setting up so diagnostics tool can be deployed |
| Agent prototypes ("virtual employees") | Joanna | Starting | Product structure, marketing, image gen |
| Overall product roadmap | Both | Just created | This document |

---

## Phase 1: Diagnostics — Client Entry Point (William Leads)

The diagnostic tool is the first thing clients experience — their "wow" moment. Fully automated Day 0-1. William architects and builds this end-to-end as the platform's front door.

### 1A. AI Intake Agent
> Client talks to AI for 15-20 min, uploads docs, gets structured profile extracted

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Master system prompt (5-phase conversation) | William | Done | In `services/diagnostics/intake-agent/prompts/` |
| 5 vertical-specific modules | William | Done | Export, construction, distribution, industrial, property |
| JSON output schema | William | Done | `intake_output.json` |
| Branded web embed page (EN/CN) | William | Done | |
| Dify chatflow config guide | William | Done | |
| Mock test conversation | William | Done | Export manufacturer scenario |
| Build & deploy Dify chatflow | William | TODO | Bring existing prompt architecture to life as deployed chatflow |
| Validate with 3-5 mock client sessions | William | TODO | Refine AI conversation quality based on results |
| Cloud deployment for intake agent | Joanna | TODO | Part of overall cloud setup |

### 1B. Document Analysis Engine
> Auto-pipeline: classify docs → extract fields → calculate metrics → generate insights

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Architect document classification system | William | TODO | Multi-stage LLM pipeline for doc type recognition |
| Design & build field extraction engine | William | TODO | Per-doc-type extraction (orders, invoices, quotations, complaints) |
| Validation rules (rule-based checks) | William | TODO | |
| Build metrics computation layer | William | TODO | Volume, timing, error, pattern analytics engine |
| Design narrative insight generator | William | TODO | LLM-powered findings synthesis from raw metrics |
| End-to-end integration testing | William | TODO | Full pipeline validation with mock data |

### 1C. Report Generator
> Auto-generated HTML findings report — client receives within 24 hrs

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Design report generation system | William | TODO | HTML/CSS template matching pitch page design language |
| Data injection layer | William | TODO | Analysis output → populates template |
| Build chart/visualization engine | William | TODO | Inline SVG bar charts, histograms |
| Complete ROI calculation engine | William | Partial | Extend existing `ai-workforce-calculator.jsx` with real analysis data |
| Test with mock data + polish | Both | TODO | |

### 1D. Cloud & Deployment
> Get the diagnostics tool live and accessible to clients

**Cloud Strategy: Start Hong Kong → Add Guangzhou Later**

```
Phase 1 (Now):     Alibaba Cloud Hong Kong — launch fast, no ICP paperwork
                    ├── Backend server (ECS — 2 CPU, 4GB RAM, ~¥300/mo)
                    ├── Database (RDS PostgreSQL, ~¥150/mo)
                    ├── File storage (OSS — uploaded docs, ~¥20/mo)
                    └── Access to all AI models (Chinese + international)

Phase 2 (Scale):   Add Alibaba Cloud Guangzhou — enterprise-ready
                    ├── Client data moves to mainland (PIPL compliance)
                    ├── Faster for all mainland users
                    ├── ICP filing shows legitimacy to enterprise clients
                    └── Hong Kong becomes dev/staging environment
```

**Why Hong Kong first:** No ICP filing needed (launch in days, not weeks). Still fast for Southern China clients. Same Alibaba Cloud tools — switching to Guangzhou later is just changing a config file, not rewriting code.

**AI Model APIs (called from backend):**

| Model | Provider | Cost | Use For |
|-------|----------|------|---------|
| DeepSeek V3 | DeepSeek (深度求索) | ¥0.25/M tokens | Main workhorse — intake analysis, doc classification, reports |
| Qwen (通义千问) | Alibaba | Free tier available | Backup, Chinese language tasks |
| GLM-4 | Zhipu AI (智谱) | Free tier | Development/testing |

**Estimated monthly cost (starting out): ~¥400-900/mo** — scales with clients.

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Set up Alibaba Cloud HK account | Joanna | TODO | Sign up, credit card, create project |
| Provision ECS server (Hong Kong) | Joanna | TODO | 2 CPU, 4GB RAM starter instance |
| Set up RDS PostgreSQL | Joanna | TODO | Managed database for client data |
| Set up OSS bucket | Joanna | TODO | Object storage for uploaded documents |
| Get DeepSeek API key | Joanna | TODO | Sign up at deepseek.com |
| Domain name registration | Joanna | TODO | rebase.cn or similar |
| Deploy backend (Docker) | William | TODO | Dockerize FastAPI app, deploy to ECS |
| Start ICP filing (parallel) | Joanna | TODO | Begin paperwork for future mainland move, 1-3 weeks |

### 1E. Product Definition & FRD
> Defining what the overall product is and what it does

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| FRD — diagnostics scope | Joanna | In progress | |
| FRD — workflow discovery scope | Joanna | TODO | |
| FRD — agent execution scope | Joanna | TODO | |
| Feature prioritization (what matters for Client #1) | Joanna | TODO | |
| Industry research — feature/function gaps | Joanna | Ongoing | |

### 1F. Frontend & Visualization
> Client-facing dashboard — already built, needs live data integration

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| 3-screen visualization dashboard | Joanna | Done | Department map, before/after toggle, ROI summary |
| Deploy to Vercel | Joanna | Done | Auto-deploys on push to main |
| Connect dashboard to live diagnostics API | Joanna | TODO | Replace mock data with fetch() calls |
| Agent output display in AgentMonitor page | Joanna | TODO | Show agent name, status, formatted output |

---

## Phase 1.5: Agent Prototypes — Joanna's Technical Spike

> Building 3 internal "virtual employees" that Rebase uses daily. Each agent is an easy-to-use tool that encodes our business assumptions. Joanna prototypes agents end-to-end to create real business value.

**Why these agents matter:**
1. **Dog-fooding** — we use our own product, proving agents work
2. **Technical proof** — each agent demonstrates a different capability (data analysis, content generation, image generation)
3. **Demo artifacts** — investors and clients see "we use these ourselves"
4. **Platform validation** — these agents will eventually run on the platform William is building

**Each agent follows the same pattern:**
```
business_context + data → prompt_template + LLM API → structured_output + action
```

### Agent 1: Product Structure Agent
> Inventory tracking, reorder decisions, product catalog management

| Task | Owner | Status | Sprint | Notes |
|------|-------|--------|--------|-------|
| Define product catalog schema | Joanna | TODO | Sprint 1 | What fields do we track per product? |
| Inventory tracking logic | Joanna | TODO | Sprint 1 | Current stock, burn rate, thresholds |
| Reorder decision engine | Joanna | TODO | Sprint 1 | When to place orders, how much, from whom |
| Supplier/pricing data integration | Joanna | TODO | Sprint 2 | Connect to existing order data |
| One-button "should I reorder?" report | Joanna | TODO | Sprint 2 | Output: reorder recommendations with reasoning |

### Agent 2: Marketing Agent (Xiaohongshu)
> One-button content creator for Xiaohongshu, pre-loaded with our brand voice and business assumptions

| Task | Owner | Status | Sprint | Notes |
|------|-------|--------|--------|-------|
| Define brand voice & tone guidelines | Joanna | TODO | Sprint 2 | What does Rebase sound like on XHS? |
| Content templates per post type | Joanna | TODO | Sprint 2 | Educational, case study, behind-the-scenes, etc. |
| Pre-built business assumptions | Joanna | TODO | Sprint 2 | Target audience, value props, key messages |
| Image + copy generation pipeline | Joanna | TODO | Sprint 2 | One button → ready-to-post XHS content |
| Post scheduling / batch generation | Joanna | TODO | Sprint 3 | Generate a week's content at once |

### Agent 3: World-Class Image Generator
> High-quality image generation for marketing, pitch materials, and client deliverables — luxury brand aesthetic

| Task | Owner | Status | Sprint | Notes |
|------|-------|--------|--------|-------|
| Define use cases & style guide | Joanna | TODO | Sprint 3 | What kinds of images, what luxury aesthetic |
| Model selection & API setup | Joanna | TODO | Sprint 3 | Which image gen model(s) — Midjourney/Flux/DALL-E |
| Prompt templates per use case | Joanna | TODO | Sprint 3 | Marketing visuals, report graphics, social media |
| One-button generation workflow | Joanna | TODO | Sprint 3 | Input context → output polished image matching luxury brands |

---

## Sprint Plan (2-week sprints)

### Sprint 1 (Weeks 1-2): Foundation

**William (CTO):**
| Task | Status | Notes |
|------|--------|-------|
| Architect & wire API gateway | TODO | Design service routing, make `/api/diagnostics/*` production-ready |
| Design & implement intake data pipeline | TODO | `POST /intake` stores Dify output with validation, `GET /intake/{id}` retrieves |
| Build & deploy Dify chatflow | TODO | Bring existing prompt architecture to life as deployed chatflow |
| Validate with mock client sessions | TODO | 3-5 scenarios, refine AI conversation quality |

**Joanna:**
| Task | Status | Notes |
|------|--------|-------|
| **Product Structure Agent v1** | TODO | Define product catalog schema, inventory tracking logic, reorder decision engine |
| Connect frontend dashboard to live API | TODO | Replace mock data with fetch() calls to diagnostics API |
| Cloud provider selection + initial setup | TODO | Get diagnostics tool deployable |
| FRD — diagnostics + workflow discovery scope | In progress | |

### Sprint 2 (Weeks 3-4): Depth

**William (CTO):**
| Task | Status | Notes |
|------|--------|-------|
| Architect document classification system | TODO | Multi-stage LLM pipeline for doc type recognition |
| Design & build field extraction engine | TODO | Per-doc-type extraction (orders, invoices, quotations) |
| Build metrics computation layer | TODO | Volume, timing, error, pattern analytics engine |
| Design narrative insight generator | TODO | LLM-powered findings synthesis from raw metrics |

**Joanna:**
| Task | Status | Notes |
|------|--------|-------|
| **Marketing Agent (XHS) v1** | TODO | Brand voice guidelines + content templates + one-button generation pipeline |
| Product Structure Agent v2 — supplier/pricing integration | TODO | Connect to real order data, refine reorder logic |
| Frontend: AgentMonitor page — show agent outputs | TODO | Each agent as a card with status + output preview |
| FRD — agent execution + cost optimization scope | TODO | |

### Sprint 3 (Weeks 5-6): Polish + Image Gen

**William (CTO):**
| Task | Status | Notes |
|------|--------|-------|
| Design report generation system | TODO | Auto-generated HTML findings report with data injection layer |
| Build chart/visualization engine | TODO | Inline SVG charts (bar, histogram) for reports |
| End-to-end integration architecture | TODO | Full pipeline validation: intake → analysis → report |
| Complete ROI calculation engine | TODO | Extend existing calculator with real analysis data |

**Joanna:**
| Task | Status | Notes |
|------|--------|-------|
| **Image Generator Agent v1** | TODO | API integration, prompt templates for marketing visuals, luxury brand aesthetic |
| Marketing Agent v2 — batch generation + post scheduling | TODO | Generate a week's content at once |
| End-to-end demo flow (frontend) | TODO | Guided: intake → dashboard → agents → report |
| Cloud deployment — get diagnostics live | TODO | Full deployment pipeline |

---

## Handoff Points

| When | What | From → To | Notes |
|------|------|-----------|-------|
| Sprint 2 | Live intake data available | William → Joanna | Joanna's agents can use real client data instead of mocks |
| Sprint 3 | Analysis output available | William → Joanna | Agent outputs can reference real metrics from analysis engine |
| Future | Agent prototypes → execution framework | Joanna → William | William wraps Joanna's 3 agents in Temporal with retry/checkpoint when platform matures |

---

## Phase 2: Workflow Discovery + Agent Execution (Future)

> AI discovers client workflows, decomposes goals into tasks, executes autonomously

| Milestone | Owner | Status | Dependencies |
|-----------|-------|--------|-------------|
| Workflow graph definitions | TBD | Stub | Phase 1 diagnostics live |
| Autonomous task execution | TBD | Stub | Workflow engine |
| Cost tracking + ROI engine | TBD | Stub | |

---

## Phase 3: Multi-Agent Orchestration (Future)

> Multiple agents collaborate on complex tasks

| Milestone | Owner | Status | Dependencies |
|-----------|-------|--------|-------------|
| Multi-agent runtime | TBD | Stub | Phase 2 agent executor |
| Agent coordination protocol | TBD | Stub | |

---

## Key Decisions Log

| Date | Decision | Who | Context |
|------|----------|-----|---------|
| 2026-03-15 | Created this roadmap as single source of truth | Both | Need one place to track everything |
| 2026-03-15 | Clarified roles: Joanna = co-founder/vision, William = co-founder/CTO | Both | |
| 2026-03-15 | Joanna's 3 internal agents are her technical spike | Both | Product structure, XHS marketing, image gen — dog-food the platform |
| 2026-03-15 | William's diagnostics tool is the client entry point | Both | First product clients touch, the "wow" moment |
| 2026-03-15 | Added sprint-level work split with handoff points | Both | Clear ownership per sprint, explicit dependencies |

---

## How to Use This Document

1. **Every session:** Pull this up first. Check where we left off.
2. **When completing a task:** Update status to `Done` and add date.
3. **When priorities shift:** Move tasks, add notes, log the decision.
4. **When adding new work:** Add it under the right phase/section.

Status values: `TODO` → `In progress` → `Done` | `Blocked` | `Ongoing` (recurring)
