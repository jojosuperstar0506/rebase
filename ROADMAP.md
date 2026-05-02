# Rebase — Product Roadmap

> Single source of truth for product progress. Pull this up every session.

**Last updated:** 2026-05-02

> **In-flight reference docs (read first if you're catching up):**
> - `WILL-TO-JOANNA-2026-04-30.md` — William's Day 1 + Day 2 + lifecycle handoff
> - `WILLIAM-HANDOFF-2026-04-23.md` — Joanna's scraper hardening handoff to William
> - `DATA-FLOW-AND-METRICS-ANALYSIS-2026-05-02.md` — Full pipeline trace + 3 critical data-quality fixes
> - `FRONTEND-BACKEND-GAP-ANALYSIS-2026-05-02.md` — Endpoint inventory + workplan update + decisions for next sync
> - `SPEC-COMPARISON-SETS-V2.md` — Comparison sets + auto-segmentation spec (V2 work, owner: William)

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

## Where We Are Now (as of 2026-05-02)

| Stream | Owner | Status | Layer | Notes |
|--------|-------|--------|-------|-------|
| **Rebase Platform (Vercel)** | **William** | **✅ v1 Live** | **—** | **Full platform at rebase-lac.vercel.app — access gate, onboarding, admin, 5 agent pages, bilingual, themed** |
| Diagnostics Calculator | William | ✅ Live | 1 | `/calculator.html` — 5-step AI maturity tool, bilingual, early access CTA wired to onboarding |
| ECS Backend (Node.js) | William | ✅ Live | — | 8.217.242.191 — Express API, PM2, Nginx, Market Intelligence cron at 6:30am HK |
| Product Structure Agent (ERP intelligence demo) | Joanna | ✅ v0.1 Done | 2 | 3-file ERP export analysis, Streamlit UI |
| 3-screen visualization dashboard | Joanna | ✅ Done | 2 | Department map, before/after toggle, ROI summary — on Vercel |
| **OMI Competitive Intelligence v2** | **Joanna** | **✅ Done** | **3** | **Full pipeline: scrape → temporal → scoring → narrative → dashboard → WeChat delivery** |
| **CI vFinal — Brief / Analytics / Library** | **William** | **✅ Live (PR #26 merged 2026-04-30)** | **—** | **Day 1 + Day 2 + lifecycle: 7 LLM pipelines, 4 backend endpoints, 3 CI pages render real DeepSeek output. End-to-end loop in 12s on Songmont workspace** |
| **Scraper hardening + central rules YAML + endpoint gate** | **Joanna** | **✅ Live (PR #25 merged 2026-04-30)** | **—** | **XHS scraper: account picker via verified ranking, 万-aware count parser, auth-wall detection. `scraping_rules.yml` + loader. `/api/ci/scrape` gated by SCRAPER_ENABLED** |
| Frontend polish (PR #27) | Joanna | 🟡 Open — awaiting merge | — | Real `runAnalysis` polling on Refresh, relative-time freshness, stale-data banner, workspace context block, AI-deltas disclaimer |
| Data-quality cleanup (DB) | Joanna | ✅ Done 2026-05-02 | — | Deleted 5 buggy zero-follower scrape rows + 334 duplicate analysis_results (-42%) |
| FRD (functional requirements) | Joanna | In progress | All | Defining overall product features |
| AI Intake Agent (Dify build) | William | TODO | 2 | Next: bring prompt architecture to life in Dify |
| XHS Virtual Employee (Joanna VE) | Joanna | TODO | 3 | Next: one-button XHS content creator |
| ERP connector research | William | TODO | 2-3 | Kingdee/QuickBooks API assessment |
| Comparison Sets + Auto-Segmentation | William | 📋 Spec ready (`SPEC-COMPARISON-SETS-V2.md`) | 3 | V2 work, ~6-day sprint. Allows comparing OMI vs international/value/国潮 segments separately |
| B0 — burner XHS account for fresh scraping | Joanna | 🔴 Blocked / pending | — | Personal XHS account banned 2026-04-22 by anti-bot. Need fresh SIM + 2-3 day pre-warm before any further scraping |

### 🔴 Only One Blocker Remaining

The platform works out of the box with built-in defaults — no Vercel env vars required to get started. Defaults:
- `ACCESS_CODE` → `"rebase2026"` (users can log in with this immediately)
- `VITE_ADMIN_PASSWORD` → `"rebase-admin-2026"` (Will/Joanna can access admin immediately)

**No blockers remaining.** The platform is fully functional. All critical env vars are set.

**Optional improvements:**
- `RESEND_API_KEY` + `NOTIFICATION_EMAIL` — to receive onboarding application emails in your inbox
- `ACCESS_CODE` — change from the default `rebase2026` to a custom invite code
- `VITE_ADMIN_PASSWORD` — change from default `rebase-admin-2026` before sharing with more admins

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

### 2F. Platform & Access Control (William) — NEW ✅ DONE

> The Rebase platform itself — the shell that houses all agent pages and controls who has access.

**Live at:** [rebase-lac.vercel.app](https://rebase-lac.vercel.app)

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| AI Diagnostics Calculator (`/calculator.html`) | William | ✅ Done | 5-step maturity assessment, bilingual ZH/EN, dark/light mode |
| Early Access CTA in calculator | William | ✅ Done | Saves form data to localStorage, redirects to `/onboarding` with pre-fill |
| User Onboarding Form (`/onboarding`) | William | ✅ Done | Full form — name, company, industry, competitors, goal. ECS proxy + Resend email fallback |
| Access Gate / Login (`/login`) | William | ✅ Done | Invite code → HS256 JWT (30-day) → `localStorage` |
| Admin Panel (`/admin`) | William | ✅ Done | Password-protected, lists applicants, approve → generate invite code, Resend notification |
| Vercel API: `POST /api/onboarding` | William | ✅ Done | ECS proxy → email notification → WeChat webhook |
| Vercel API: `POST /api/auth/verify-code` | William | ✅ Done | Validates `ACCESS_CODE`, issues JWT |
| Vercel API: `GET /api/admin/applicants` | William | ✅ Done | ECS proxy, empty-list fallback |
| Vercel API: `POST /api/admin/approve` | William | ✅ Done | Returns invite code, sends Resend approval email |
| Global dark/light theme (`AppContext`) | William | ✅ Done | All pages use `C.*` tokens — zero hardcoded colors |
| Global bilingual support (ZH/EN) | William | ✅ Done | All pages react to `lang` context — every string translated |
| Agent Monitor (`/agents`) | William | ✅ Done | Live agent status grid, bilingual, themed |
| XHS War Room (`/agents/xhs-content`) | William | ✅ Done | 4-tab AI content tool — calls Claude via `/api/ai` |
| Market Intelligence (`/agents/market-intelligence`) | William | ✅ Done | Overview page, bilingual, themed |
| Workflow Scout (`/workflows`) | William | ✅ Done | Interactive workflow discovery, bilingual, themed |
| Cost & ROI Dashboard (`/costs`) | William | ✅ Done | Coming-soon page with 4 feature preview cards |
| ProtectedRoute (JWT gate) | William | ✅ Done | All agent/workflow/cost pages require valid token |
| ECS backend `POST /api/admin/applicants` | William | TODO | Store applicants so admin panel shows them (currently email-only) |
| ECS backend `POST /api/admin/approve` | William | TODO | Persist approval status on ECS |
| Cost Dashboard — real data | William | Future | Wire to actual Anthropic API usage |

### 2G. Cloud & Deployment (ECS — Live ✅)

**Cloud Strategy: Start Hong Kong → Add Guangzhou Later**

```
Phase 1 (Now):     ✅ Phase 1 complete — ECS live, Node.js + PM2 + Nginx configured, backend API running
                    Alibaba Cloud Hong Kong — launch fast, no ICP paperwork
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
| Set up Alibaba Cloud HK account | Joanna | ✅ Done | |
| Provision ECS server | William | ✅ Done | 2 CPU, 4GB RAM, HK region — 8.217.242.191 |
| Install Node.js, PM2, Nginx, git on ECS | William | ✅ Done | Backend API running on port 80 |
| Deploy frontend to Vercel | William | ✅ Done | Auto-deploys on push to `main` |
| Set `ANTHROPIC_API_KEY` in Vercel | William | ✅ Done | XHS War Room AI calls working |
| Set `ACCESS_CODE` in Vercel | William | ✅ Done | Needed for user login |
| Set `RESEND_API_KEY` in Vercel | William | 🟡 TODO | Needed for email notifications |
| Set up RDS PostgreSQL | Joanna | TODO | Sprint 2 |
| Set up OSS bucket | Joanna | TODO | Sprint 2 |
| Domain name registration | Joanna | TODO | |
| Start ICP filing (parallel) | Joanna | TODO | 1-3 weeks |
| `.env.example` + `CLAUDE.md` | Both | ✅ Done | Environment variable guardrails |

**Environment Variables Rule:** All external service URLs, API keys, and region-specific config MUST come from `.env` — never hardcoded. See `CLAUDE.md`.

### 2H. Frontend & Visualization

| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| 3-screen visualization dashboard | Joanna | ✅ Done | On Vercel |
| Deploy to Vercel | Joanna | ✅ Done | Auto-deploys on push to main |
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

### Virtual Employee 2: OMI Competitive Intelligence Agent (DONE — v2)
> Automated competitive intelligence for OMI Bags. Tracks 20 brands across 7 dimensions (pricing, social voice, content strategy, KOL ecosystem, social commerce, product rankings, channel authority). Generates weekly briefs with scores, signals, and action items.

**Architecture:** SQLite storage → Chrome extraction → temporal analysis → scoring engine → Claude narrative layer → dashboard + WeChat Work delivery

| Task | Owner | Status | Sprint | Notes |
|------|-------|--------|--------|-------|
| TASK-01: SQLite storage layer + brand registry | Joanna | ✅ Done | — | `storage.py` — 20 brands, 7-dimension schema, metrics extraction |
| TASK-02: Chrome-based data extraction pipeline | Joanna | ✅ Done | — | XHS, Douyin, SYCM scraper configs |
| TASK-02B: Top-100 product ranking extraction | Joanna | ✅ Done | — | Tmall + Douyin rankings with brand matching |
| TASK-03: Connect dashboard to live data | Joanna | ✅ Done | — | API → static JSON → fallback data cascade |
| TASK-04: Temporal analysis engine | Joanna | ✅ Done | — | `temporal.py` — rolling stats, z-scores, anomaly detection, trend summaries |
| TASK-05: Brand scoring model | Joanna | ✅ Done | — | `scoring.py` — momentum score (0-100), threat index, 6 GTM signal types |
| TASK-06: Claude narrative layer | Joanna | ✅ Done | — | `narrative.py` — per-brand narratives, strategic summary, action items via Claude API |
| TASK-07: Wire scores/narratives to dashboard | Joanna | ✅ Done | — | 4 new API endpoints, competitive landscape section, system status panel |
| TASK-08: WeChat Work weekly brief | Joanna | ✅ Done | — | `delivery.py` — markdown brief, webhook delivery, cron scheduling |
| TASK-09: End-to-end orchestrator | Joanna | TODO | — | Single command: scrape → analyze → score → narrate → deliver |
| TASK-10: Production hardening | Joanna | TODO | — | Error handling, retry logic, monitoring, Vercel cron |

**Test coverage:** 258 tests across 7 test files, all passing.

**Key files:**
- `services/competitor-intel/storage.py` — SQLite data layer (1134 lines)
- `services/competitor-intel/temporal.py` — rolling stats + anomaly detection
- `services/competitor-intel/scoring.py` — momentum + threat scoring
- `services/competitor-intel/narrative.py` — Claude-powered narrative generation
- `services/competitor-intel/delivery.py` — WeChat Work weekly brief
- `services/competitor-intel/api_server.py` — HTTP API (8 endpoints)
- `frontend/public/competitor-intel.html` — single-file dashboard (dark theme, 5 tabs)

### Virtual Employee 3: Joanna — Marketing (XHS) (TODO)
> One-button content creator for Xiaohongshu, pre-loaded with brand voice

| Task | Owner | Status | Sprint | Notes |
|------|-------|--------|--------|-------|
| Define brand voice & tone guidelines | Joanna | TODO | Sprint 2 | What does Rebase sound like on XHS? |
| Content templates per post type | Joanna | TODO | Sprint 2 | Educational, case study, behind-the-scenes |
| Pre-built business assumptions | Joanna | TODO | Sprint 2 | Target audience, value props, key messages |
| Image + copy generation pipeline | Joanna | TODO | Sprint 2 | One button → ready-to-post XHS content |
| Pull revenue/product data from ERP for campaign analysis | Joanna | TODO | Sprint 3 | Connect to Product Agent data |

### Virtual Employee 4: Image Generator (Marketing Toolkit)
> High-quality image generation for marketing and client deliverables

| Task | Owner | Status | Sprint | Notes |
|------|-------|--------|--------|-------|
| Define use cases & style guide | Joanna | TODO | Sprint 3 | Luxury brand aesthetic |
| Model selection & API setup | Joanna | TODO | Sprint 3 | Midjourney/Flux/DALL-E |
| Prompt templates per use case | Joanna | TODO | Sprint 3 | Marketing visuals, report graphics |
| One-button generation workflow | Joanna | TODO | Sprint 3 | Input context → polished image |

---

## Sprint Plan (2-week sprints)

### Sprint 0 (Completed — Foundation & Platform)

> Will built the full client-facing platform. Joanna built the core intelligence prototypes.

**William — DONE:**
| Task | Status | Notes |
|------|--------|-------|
| Vercel frontend deployment + CI/CD | ✅ Done | Auto-deploys on push to `main` |
| Alibaba Cloud ECS backend (HK) | ✅ Done | Node.js + PM2 + Nginx at 8.217.242.191 |
| AI Diagnostics Calculator | ✅ Done | `/calculator.html` — bilingual, 5-step, lead capture |
| User onboarding form + submission API | ✅ Done | `/onboarding` + `POST /api/onboarding` |
| Invite code access gate + JWT auth | ✅ Done | `/login` + `POST /api/auth/verify-code` |
| Admin panel + applicant management APIs | ✅ Done | `/admin` + `/api/admin/*` |
| Global dark/light theme + bilingual (all pages) | ✅ Done | `AppContext` — every page uses `C.*` tokens and `lang` |
| All 5 agent pages themed + bilingual | ✅ Done | AgentMonitor, XhsWarroom, MarketIntelligence, WorkflowScout, CostDashboard |
| Market Intelligence daily cron | ✅ Done | 6:30am HK — news fetch → Claude analysis → email report |

**Joanna — DONE:**
| Task | Status | Notes |
|------|--------|-------|
| 3-screen visualization dashboard | ✅ Done | On Vercel |
| Product Structure Agent v0.1 | ✅ Done | 3-file ERP analysis, Streamlit, FastAPI |
| OMI Competitive Intelligence v2 | ✅ Done | Full pipeline: scrape → temporal → score → narrative → WeChat |

---

### Sprint 1 (Current — First Users + AI Intake): Target: April 2026

**William:**
| Task | Status | Notes |
|------|--------|-------|
| Set `ANTHROPIC_API_KEY` in Vercel | ✅ Done | XHS War Room AI calls working |
| Add ECS backend routes for admin panel (`/api/admin/*`) | TODO | So admin panel shows real applicants instead of empty |
| Build & deploy Dify AI Intake chatflow | TODO | Bring 5-phase prompt architecture to life |
| Validate intake agent with 3-5 mock client sessions | TODO | Refine conversation quality |
| Research Kingdee/QuickBooks APIs | TODO | What data is accessible, auth, rate limits |

**Joanna:**
| Task | Status | Notes |
|------|--------|-------|
| Share platform link with 3-5 target SMB contacts | TODO | Real user feedback on onboarding + calculator |
| Joanna Virtual Employee (XHS) v1 | TODO | Brand voice + content templates + one-button pipeline |
| Connect 3-screen dashboard to live API data | TODO | Replace mock data |
| FRD — diagnostics + workflow discovery scope | In progress | |

---

### Sprint 2 (Weeks 3-4): Depth + ERP

**William:**
| Task | Status | Notes |
|------|--------|-------|
| Document classification system | TODO | Multi-stage LLM pipeline |
| Field extraction engine | TODO | Per-doc-type extraction |
| Metrics computation layer | TODO | Volume, timing, error analytics |
| ERP connector v0 — read-only Kingdee or QuickBooks | TODO | Pull transaction data |

**Joanna:**
| Task | Status | Notes |
|------|--------|-------|
| XHS Virtual Employee v1 | TODO | Brand voice + content templates |
| Product Structure Agent v2 — Kingdee export support | TODO | Expand beyond 聚水潭 |
| FRD — agent execution + cost optimization scope | TODO | |

---

### Sprint 3 (Weeks 5-6): Polish + Integration

**William:**
| Task | Status | Notes |
|------|--------|-------|
| Report generation system | TODO | Auto-generated HTML findings report |
| Chart/visualization engine | TODO | Inline SVG charts |
| ERP connector v1 — bidirectional | TODO | Read + write back to ERP |
| End-to-end pipeline: intake → analysis → report | TODO | |

**Joanna:**
| Task | Status | Notes |
|------|--------|-------|
| Image Generator v1 | TODO | API integration, prompt templates, luxury aesthetic |
| XHS Marketing Agent v2 — batch generation + scheduling | TODO | |
| End-to-end demo flow | TODO | ERP data → intelligence → virtual employee → results |

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
| 2026-03-28 | OMI Competitive Intelligence v2 complete (TASK-01 through TASK-08) | Joanna | Full pipeline: SQLite → Chrome extraction → temporal → scoring → narrative → dashboard → WeChat delivery. 258 tests. |
| 2026-03-28 | Merged Jo-competitive-intelligence branch to main | Joanna | PR #10 — all changes now on Vercel production |
| 2026-03-28 | WeChat Work delivery module added | Joanna | Dry-run by default, `--send` for real delivery, `--cron-hint` for Monday 9am scheduling |
| 2026-04-01 | Platform v1 shipped — full client-facing flow live on Vercel | William | Onboarding → invite code access gate → admin panel → 5 agent pages. All themed + bilingual. |
| 2026-04-01 | Auth model: shared `ACCESS_CODE` + JWT (30-day) | William | MVP decision — single master code for all approved users. Rotate by changing Vercel env var. Per-user codes deferred to when ECS has persistent DB. |
| 2026-04-01 | Vercel serverless functions as API proxy layer | William | `frontend/api/` handles onboarding, auth, admin — proxies to ECS when configured, falls back to email notifications otherwise. Zero-config fallback means platform works before ECS routes are built. |
| 2026-04-01 | All pages now use `AppContext` `C.*` tokens | William | Eliminated all hardcoded dark colors. Light/dark mode works across every page including XhsWarroom and MarketIntelligence which previously had hardcoded `#0c0c14` etc. |
| 2026-04-22 | Joanna's personal XHS account banned by anti-bot after ~20h of testing | Joanna | Triggered 4-phase scraper hardening plan + scraping_rules.yml central config. **Future scraping requires burner account**. See `WILLIAM-HANDOFF-2026-04-23.md`. |
| 2026-04-30 | Will's 2-day plan complete — Brief / Analytics / Library go live on real data | William | 7 LLM pipelines, 4 backend endpoints, USE_MOCKS=false. Songmont workspace verified end-to-end (PR #26). |
| 2026-04-30 | OMI/Songmont identity collision fixed in prod | William | Songmont was both workspace brand and "competitor of self". Fix applied via direct SQL. Diagnostic SQL provided for sweeping other workspaces (no other collisions found 2026-05-02). |
| 2026-05-02 | DB cleanup: 5 buggy zero-follower scrape rows + 334 duplicate analysis_results | Joanna | Buggy rows were poisoning voice_volume + growth scores → brief was telling Songmont they're losing when they're not. See `DATA-FLOW-AND-METRICS-ANALYSIS-2026-05-02.md`. |
| 2026-05-02 | Decided: Comparison Sets architecture (Option B over multi-workspace) | Joanna | LLM-driven free-form clustering of competitors (国际启发/价值挑战者/国潮新锐 etc.). Spec written, owner: William. ~6-day sprint. |
| 2026-05-02 | Frontend ↔ backend gap analysis: 3 orphaned components, 4 unused endpoints, 4 quick presentation wins | Joanna | See `FRONTEND-BACKEND-GAP-ANALYSIS-2026-05-02.md` for the full inventory + 22-item prioritized workplan. |

---

## How to Use This Document

1. **Every session:** Pull this up first. Check where we left off.
2. **When completing a task:** Update status to `Done` and add date.
3. **When priorities shift:** Move tasks, add notes, log the decision.
4. **When adding new work:** Add it under the right layer/section.

Status values: `TODO` → `In progress` → `Done` | `Blocked` | `Ongoing` (recurring)
