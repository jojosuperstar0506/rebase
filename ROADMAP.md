# Rebase — Product Roadmap

> Single source of truth for product progress. Pull this up every session.

**Last updated:** 2026-03-15

---

## Team

| | **Joanna** (Co-Founder) | **William** (Co-Founder, CTO) |
|---|---|---|
| **Role** | Product vision, strategy, go-to-market | Technical architecture, platform engineering |
| **Owns** | What we build & why — product direction, agent design, client experience | How we build it — system architecture, core infrastructure, technical decisions |
| **Technical spike** | Virtual employee prototypes that dog-food the platform | Diagnostics tool + ERP connectors — the first product clients touch |
| **Current focus** | Layer 2 intelligence demo + virtual employee prototypes + frontend/cloud | Building the diagnostics pipeline as our Layer 2 entry point |

---

## How the Work Splits

```
William (CTO) builds the FRONT DOOR          Joanna builds the VIRTUAL EMPLOYEES
(Layer 2 — first thing every client touches)  (Layer 3 prototypes — prove the model)

AI intake conversation ────────►              Product Structure Agent (Layer 2 demo)
Document analysis engine ──────►              Joanna Virtual Employee (XHS Marketing)
ERP data connectors ───────────►              Image Generator (Marketing toolkit)
Instant insights dashboard ────►              (dog-food our own platform)
Auto-generated report ─────────►

Diagnostics IS the product entry point        Product vision through working code
Client's first "wow" moment                   Proves virtual employees work
Converts prospects to believers               Proves intelligence layer works on ERP data
```

---

## Product Architecture: 5 Layers

| Layer | Name | What It Does | Current Status |
|-------|------|-------------|----------------|
| 1 | **Educate** | AI readiness — playbooks, workshops, self-assessment tool | Future |
| 2 | **Diagnose** | Turn ERP data into operational X-ray — the entry point | Active (William + Joanna) |
| 3 | **Deploy** | Virtual employees with intent packs — automated operations layer | Prototyping (Joanna) |
| 4 | **Optimize** | Cross-department orchestration + continuous intelligence | Future |
| 5 | **Scale** | Self-serve platform, industry packages, marketplace | Future |

---

## Where We Are Now (as of 2026-03-15)

| Stream | Owner | Status | Layer | Notes |
|--------|-------|--------|-------|-------|
| Diagnostics tool (client entry point) | William | In progress | 2 | Intake agent + analysis pipeline |
| Product Structure Agent (ERP intelligence demo) | Joanna | v0.1 Done | 2 | 3-file ERP export analysis, Streamlit UI |
| 3-screen visualization dashboard | Joanna | Done | 2 | Department map, before/after toggle, ROI summary — on Vercel |
| FRD (functional requirements) | Joanna | In progress | All | Defining overall product features |
| Cloud infrastructure & deployment | Joanna | In progress | — | Alibaba Cloud HK setup |
| Virtual employee prototypes | Joanna | Starting | 3 | Marketing (Joanna VE), Image Gen |
| ERP connector research | William | TODO | 2-3 | Kingdee/QuickBooks API assessment |

---

## Layer 2: Diagnose — Client Entry Point

### 2A. AI Intake Agent (William)
> Client talks to AI for 15-20 min, uploads docs, gets structured profile extracted

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Master system prompt (5-phase conversation) | William | Done | In `services/diagnostics/intake-agent/prompts/` |
| 5 vertical-specific modules | William | Done | Export, construction, distribution, industrial, property |
| JSON output schema | William | Done | `intake_output.json` |
| Branded web embed page (EN/CN) | William | Done | |
| Dify chatflow config guide | William | Done | |
| Mock test conversation | William | Done | Export manufacturer scenario |
| Build & deploy Dify chatflow | William | TODO | Bring prompt architecture to life |
| Validate with 3-5 mock client sessions | William | TODO | Refine AI conversation quality |
| Cloud deployment for intake agent | Joanna | TODO | Part of overall cloud setup |

### 2B. Document Analysis Engine (William)
> Auto-pipeline: classify docs → extract fields → calculate metrics → generate insights

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Architect document classification system | William | TODO | Multi-stage LLM pipeline |
| Design & build field extraction engine | William | TODO | Per-doc-type extraction |
| Validation rules (rule-based checks) | William | TODO | |
| Build metrics computation layer | William | TODO | Volume, timing, error, pattern analytics |
| Design narrative insight generator | William | TODO | LLM-powered findings synthesis |
| End-to-end integration testing | William | TODO | Full pipeline with mock data |

### 2C. ERP Data Intelligence (Joanna — Product Structure Agent)
> Connect to ERP exports, analyze transaction patterns, surface insights the boss has never seen

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Define product catalog schema (Pydantic models) | Joanna | Done | `models/schemas.py` |
| Fuzzy column mapper for 聚水潭 exports | Joanna | Done | Auto-detects file type + shifting columns |
| 3-file merge pipeline (sales + inventory + bestseller) | Joanna | Done | Handles grain mismatch |
| Material/bag type/price tier normalization | Joanna | Done | 43 bag types → 15 standard |
| 4-objective analysis engine | Joanna | Done | What to make, why products fail, inventory health, purchasing recs |
| Efficiency grading (A/B/C/D) | Joanna | Done | Configurable thresholds |
| Formatted Excel output (2 sheets, 8 sections) | Joanna | Done | Ready for Feishu Bitable import |
| Streamlit UI | Joanna | Done | Upload, auto-detect, analyze, download |
| FastAPI endpoints | Joanna | Done | POST /upload, GET /result, GET /excel |
| Add Kingdee export format support | Joanna | TODO | Sprint 2 — expand beyond 聚水潭 |
| Add true COGS column support | Joanna | TODO | Sprint 2 — replace 40% estimate |
| Deploy to Alibaba Cloud | Joanna | TODO | Sprint 2 — Streamlit on ECS |

### 2D. ERP Connectors (William — New Track)
> Bidirectional connections to Kingdee, Yonyou, QuickBooks — the backbone of the intelligence layer

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Research Kingdee KIS/K3 API capabilities | William | TODO | Sprint 1 — what data is accessible? |
| Research QuickBooks API (US market) | William | TODO | Sprint 1 — endpoints, auth, data model |
| ERP connector v0 — read-only Kingdee or QuickBooks | William | TODO | Sprint 2 — pull transaction data |
| ERP connector v1 — bidirectional (read + write) | William | TODO | Sprint 3 — post journal entries, update POs |
| Computer-use agent for legacy Kingdee (no API) | William | TODO | Future — UI automation for older versions |

### 2E. Report Generator (William)
> Auto-generated HTML findings report — client receives within 24 hrs

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Design report generation system | William | TODO | HTML/CSS template |
| Data injection layer | William | TODO | Analysis output → populates template |
| Build chart/visualization engine | William | TODO | Inline SVG charts |
| Complete ROI calculation engine | William | Partial | Extend existing calculator |
| Test with mock data + polish | Both | TODO | |

### 2F. Cloud & Deployment

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
                    ├── ICP filing shows legitimacy
                    └── Hong Kong becomes dev/staging
```

**AI Model APIs:**

| Model | Provider | Cost | Use For |
|-------|----------|------|---------|
| DeepSeek V3 | DeepSeek (深度求索) | ¥0.25/M tokens | Main workhorse — analysis, classification, reports |
| Qwen (通义千问) | Alibaba | Free tier | Backup, Chinese language tasks |
| GLM-4 | Zhipu AI (智谱) | Free tier | Development/testing |

**Estimated monthly cost: ~¥400-900/mo starting out.**

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Set up Alibaba Cloud HK account | Joanna | TODO | |
| Provision ECS server | Joanna | TODO | |
| Set up RDS PostgreSQL | Joanna | TODO | |
| Set up OSS bucket | Joanna | TODO | |
| Get DeepSeek API key | Joanna | TODO | |
| Domain name registration | Joanna | TODO | |
| Deploy backend (Docker) | William | TODO | |
| Start ICP filing (parallel) | Joanna | TODO | 1-3 weeks |
| `.env.example` + `CLAUDE.md` | Both | Done | Environment variable guardrails |

**Environment Variables Rule:** All external service URLs, API keys, and region-specific config MUST come from `.env` — never hardcoded. See `CLAUDE.md`.

### 2G. Frontend & Visualization

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| 3-screen visualization dashboard | Joanna | Done | On Vercel |
| Deploy to Vercel | Joanna | Done | Auto-deploys on push to main |
| Connect dashboard to live diagnostics API | Joanna | TODO | Replace mock data |
| Agent output display in dashboard | Joanna | TODO | Show virtual employee status + output |

---

## Layer 3: Deploy — Virtual Employee Prototypes (Joanna's Spike)

> Building virtual employees that Rebase uses daily. Each agent proves a different capability. These are early prototypes of the Layer 3 product.

**Why these matter:**
1. **Dog-fooding** — we use our own product
2. **Technical proof** — each agent demonstrates a different capability
3. **Demo artifacts** — investors and clients see "we use these ourselves"
4. **Platform validation** — these agents run on the platform William is building

**Each agent follows the pattern:**
```
ERP data + business context → prompt template + LLM API → structured output + action
```

### Virtual Employee 1: Product Intelligence (Layer 2 demo — DONE)
> Analyzes product portfolio, inventory health, and purchasing decisions from ERP exports

Already built as Product Structure Agent. See Section 2C above.

### Virtual Employee 2: Joanna — Marketing (XHS)
> One-button content creator for Xiaohongshu, pre-loaded with brand voice

| Task | Owner | Status | Sprint | Notes |
|------|-------|--------|--------|-------|
| Define brand voice & tone guidelines | Joanna | TODO | Sprint 2 | What does Rebase sound like on XHS? |
| Content templates per post type | Joanna | TODO | Sprint 2 | Educational, case study, behind-the-scenes |
| Pre-built business assumptions | Joanna | TODO | Sprint 2 | Target audience, value props, key messages |
| Image + copy generation pipeline | Joanna | TODO | Sprint 2 | One button → ready-to-post XHS content |
| Pull revenue/product data from ERP for campaign analysis | Joanna | TODO | Sprint 3 | Connect to Product Agent data |

### Virtual Employee 3: Image Generator (Marketing Toolkit)
> High-quality image generation for marketing and client deliverables

| Task | Owner | Status | Sprint | Notes |
|------|-------|--------|--------|-------|
| Define use cases & style guide | Joanna | TODO | Sprint 3 | Luxury brand aesthetic |
| Model selection & API setup | Joanna | TODO | Sprint 3 | Midjourney/Flux/DALL-E |
| Prompt templates per use case | Joanna | TODO | Sprint 3 | Marketing visuals, report graphics |
| One-button generation workflow | Joanna | TODO | Sprint 3 | Input context → polished image |

---

## Sprint Plan (2-week sprints)

### Sprint 1 (Weeks 1-2): Foundation — CURRENT

**William (CTO):**
| Task | Status | Notes |
|------|--------|-------|
| Architect & wire API gateway | TODO | Service routing, `/api/diagnostics/*` |
| Design & implement intake data pipeline | TODO | POST /intake, GET /intake/{id} |
| Build & deploy Dify chatflow | TODO | Bring prompt architecture to life |
| Validate with mock client sessions | TODO | 3-5 scenarios |
| **Research Kingdee/QuickBooks APIs** | TODO | NEW — what data is accessible, auth methods, rate limits |

**Joanna:**
| Task | Status | Notes |
|------|--------|-------|
| Product Structure Agent v1 | Done | Full pipeline: 3-file merge, analysis, Excel, Streamlit, FastAPI |
| Connect frontend dashboard to live API | TODO | Replace mock data |
| Cloud provider selection + initial setup | TODO | Get diagnostics deployable |
| FRD — diagnostics + workflow discovery scope | In progress | |

### Sprint 2 (Weeks 3-4): Depth + ERP

**William (CTO):**
| Task | Status | Notes |
|------|--------|-------|
| Architect document classification system | TODO | Multi-stage LLM pipeline |
| Design & build field extraction engine | TODO | Per-doc-type extraction |
| Build metrics computation layer | TODO | Volume, timing, error analytics |
| **ERP connector v0 — read-only Kingdee or QuickBooks** | TODO | NEW — pull transaction data |

**Joanna:**
| Task | Status | Notes |
|------|--------|-------|
| **Joanna Virtual Employee (XHS) v1** | TODO | Brand voice + content templates + one-button pipeline |
| Product Structure Agent v2 — Kingdee export support | TODO | Expand beyond 聚水潭 format |
| Frontend: dashboard show virtual employee outputs | TODO | Each agent as card with status + output |
| FRD — agent execution + cost optimization scope | TODO | |

### Sprint 3 (Weeks 5-6): Polish + Integration

**William (CTO):**
| Task | Status | Notes |
|------|--------|-------|
| Design report generation system | TODO | Auto-generated HTML findings report |
| Build chart/visualization engine | TODO | Inline SVG charts |
| **ERP connector v1 — bidirectional** | TODO | NEW — read + write back to ERP |
| End-to-end integration architecture | TODO | Full pipeline: intake → analysis → report |

**Joanna:**
| Task | Status | Notes |
|------|--------|-------|
| **Image Generator v1** | TODO | API integration, prompt templates, luxury aesthetic |
| Marketing Agent v2 — batch generation + scheduling | TODO | Generate a week's content at once |
| End-to-end demo flow | TODO | ERP data → intelligence → virtual employee → results |
| Cloud deployment — get diagnostics live | TODO | Full pipeline |

---

## Ongoing Tracks (Across All Sprints)

| Track | Owner | Description | Status |
|-------|-------|-------------|--------|
| **Benchmark Library** | Both | Collect industry patterns from every deployment/test. Client 51 gets 10x better diagnostic than client 5. | Starting |
| **Intent Pack Design** | Both | Document what reusable workflow modules look like. Each deployment's success becomes a template. | Research |
| **Self-Assessment Tool** (Layer 1) | Joanna | 15-min online questionnaire estimating "operational intelligence gap." Pipeline generator. | TODO |
| **Product Definition / FRD** | Joanna | Overall feature requirements across all 5 layers | In progress |

---

## Handoff Points

| When | What | From → To | Notes |
|------|------|-----------|-------|
| Sprint 1 | ERP API research complete | William → Joanna | Joanna can plan Kingdee export support for Product Agent v2 |
| Sprint 2 | Live intake data available | William → Joanna | Dashboard can show real client data |
| Sprint 2 | ERP connector v0 | William → Joanna | Product Agent can pull live data instead of file uploads |
| Sprint 3 | Analysis output available | William → Joanna | Virtual employee outputs reference real metrics |
| Future | Agent prototypes → execution framework | Joanna → William | William wraps virtual employees in Temporal with retry/checkpoint |

---

## Layer 4 & 5: Future

### Layer 4: Optimize — Cross-Department Orchestration
> Event bus connecting departments through ERP, business goal interpreter, proactive intelligence, continuous benchmarking.

| Milestone | Owner | Status | Dependencies |
|-----------|-------|--------|-------------|
| Cross-department event bus | TBD | Future | Layer 3 virtual employees operational |
| Business goal interpreter | TBD | Future | Intelligence layer + orchestration engine |
| Continuous benchmarking from ERP data | TBD | Future | Benchmark library + ERP connectors |

### Layer 5: Scale — Self-Serve Platform
> SMB owner connects ERP → auto-diagnostic → recommended virtual employee team → deploy in under 1 week.

| Milestone | Owner | Status | Dependencies |
|-----------|-------|--------|-------------|
| Self-serve onboarding flow | TBD | Future | Layer 2 + 3 proven |
| Industry knowledge packages | TBD | Future | Benchmark library mature |
| Virtual employee marketplace | TBD | Future | Layer 3 at scale |
| Partner/reseller channel | TBD | Future | Product proven |

---

## Five Compounding Moats

1. **Benchmark Library** — Every deployment enriches our understanding of what "good" looks like per industry/size/region. After 100 clients, our diagnostic is 10x more precise than a chatbot starting from zero.
2. **ERP Integration Depth** — Deep Kingdee/Yonyou/QuickBooks connectors + computer-use agents for legacy systems. Earned through deployment experience.
3. **Intent Packs** — Every successful workflow becomes a reusable module. Virtual employees arrive pre-loaded with operational knowledge from hundreds of similar businesses.
4. **Education Community** — Peer roundtables, playbooks, workshops create trust and distribution.
5. **Cross-Department Orchestration** — Coordinating virtual employees across departments with ERP as shared backbone is architecturally hard and gets harder with every edge case.

---

## Financial Milestones

| When | Revenue | Clients | Proof |
|------|---------|---------|-------|
| Month 6 | $5K–$8K MRR | 1–2 | Client paying for virtual employee + ERP-derived insights |
| Month 10 | $20K–$40K MRR | 5–8 | Renewals, intelligence layer generating proactive recs |
| Month 12 (Seed) | $40K–$100K MRR | 10–15 | Repeatable sales, benchmark library producing instant diagnostics |
| Month 18 | $120K–$250K MRR | 20–30 | Cross-department orchestration, expansion revenue > 30% |
| Month 24 (Series A) | $350K–$600K MRR | 50+ | Self-serve, enterprise pilot conversations |

---

## Key Decisions Log

| Date | Decision | Who | Context |
|------|----------|-----|---------|
| 2026-03-15 | Created roadmap as single source of truth | Both | |
| 2026-03-15 | Clarified roles: Joanna = co-founder/vision, William = co-founder/CTO | Both | |
| 2026-03-15 | Joanna's virtual employee prototypes are her technical spike | Both | Product intelligence, XHS marketing, image gen |
| 2026-03-15 | William's diagnostics tool is the client entry point | Both | First product clients touch |
| 2026-03-15 | Cloud strategy: Alibaba Cloud HK → add Guangzhou later | Both | No ICP needed for HK |
| 2026-03-15 | Aligned to V3 product strategy — 5-layer architecture | Both | ERP-data thesis, intelligence + operations layer |
| 2026-03-15 | Added ERP connector as parallel track for William | Both | Kingdee/QuickBooks research in Sprint 1, connector in Sprint 2 |
| 2026-03-15 | Added ongoing tracks: benchmark library, intent packs, self-assessment | Both | Compound across all sprints |

---

## How to Use This Document

1. **Every session:** Pull this up first. Check where we left off.
2. **When completing a task:** Update status to `Done` and add date.
3. **When priorities shift:** Move tasks, add notes, log the decision.
4. **When adding new work:** Add it under the right layer/section.

Status values: `TODO` → `In progress` → `Done` | `Blocked` | `Ongoing` (recurring)
