# Rebase — Active Task Board

> Operational task tracker. **ROADMAP.md** = strategy & vision. **This file** = what we're actually working on.
>
> Update status every session. Add new tasks with today's date and a target finish date.
>
> **Owner:** W = Will · J = Joanna · B = Both
> **Status:** ✅ Done · 🔄 In Progress · ❌ Not Started · 🔴 Blocked
> **[GAP]** = identified as missing from original roadmap on 2026-04-01

---

## 🔴 This Week

| # | Task | Owner | Status | Added | Target | Notes |
|---|------|-------|--------|-------|--------|-------|
| 1 | Set `RESEND_API_KEY` + `NOTIFICATION_EMAIL` in Vercel | W | ❌ | 2026-04-01 | 2026-04-04 | Without this, onboarding submissions go nowhere — flying blind on who applied |
| 2 | Test full user flow end-to-end on live site | B | ❌ | 2026-04-01 | 2026-04-04 | Both go through: calculator → onboarding → login → agent pages. Note anything broken |
| 3 | Identify 3–5 target SMB contacts to share the platform with | J | ❌ | 2026-04-01 | 2026-04-04 | Real user feedback beats any feature built this week |
| 4 | **[GAP]** Draft "first client playbook" — what happens after someone applies | B | ❌ | 2026-04-01 | 2026-04-07 | Who calls them? Agenda? What do they receive? Without this a hot lead goes cold |

---

## 🟡 Sprint 1 — Target: End of April 2026

### Will

| # | Task | Owner | Status | Added | Target | Notes |
|---|------|-------|--------|-------|--------|-------|
| 5 | ECS admin routes: store + retrieve applicants | W | ❌ | 2026-04-01 | 2026-04-15 | Admin panel currently shows empty — applicants only reach email |
| 6 | **[GAP]** Auto-deliver invite code to approved user via email | W | ❌ | 2026-04-01 | 2026-04-15 | Right now code is copy-pasted into WeChat manually. Should send via Resend automatically on approval |
| 7 | Build & deploy Dify AI Intake chatflow | W | ❌ | 2026-03-15 | 2026-04-20 | All prompts written — just needs wiring up in Dify and deploying |
| 8 | Test intake agent with 3–5 mock client sessions | W | ❌ | 2026-03-15 | 2026-04-25 | Validate conversation quality before showing real clients |
| 9 | **[GAP]** Define intake → client file handoff process | W | ❌ | 2026-04-01 | 2026-04-25 | What happens to the JSON after intake? Where does it live, who reviews it, what triggers next step? |
| 10 | Research Kingdee & QuickBooks APIs | W | ❌ | 2026-03-15 | 2026-04-30 | What data is accessible, auth methods, rate limits — unblocks all ERP work in Sprint 2 |

### Joanna

| # | Task | Owner | Status | Added | Target | Notes |
|---|------|-------|--------|-------|--------|-------|
| 11 | Share platform with 3–5 SMB contacts + collect feedback | J | ❌ | 2026-04-01 | 2026-04-15 | Most important thing this sprint — real signal over more features |
| 12 | **[GAP]** Complete FRD — break into sections with target dates per section | J | 🔄 In Progress | 2026-04-01 | 2026-04-30 | Currently open-ended with no deadline. Needs section scope + date per section |
| 13 | XHS Virtual Employee — brand voice guidelines | J | ❌ | 2026-03-15 | 2026-04-20 | Foundation everything else builds on — what does Rebase sound like on XHS? |
| 14 | XHS VE — content templates per post type | J | ❌ | 2026-03-15 | 2026-04-30 | Educational, case study, behind-the-scenes |
| 15 | Connect 3-screen dashboard to live API data | J | ❌ | 2026-03-15 | 2026-04-30 | Replace mock data with real numbers |

### Both

| # | Task | Owner | Status | Added | Target | Notes |
|---|------|-------|--------|-------|--------|-------|
| 16 | **[GAP]** Define go-to-market channels for calculator | B | ❌ | 2026-04-01 | 2026-04-15 | How do target SMBs discover it? WeChat groups, warm intros, XHS, LinkedIn — needs a concrete plan |
| 17 | **[GAP]** Decide pricing + payment mechanism | B | ❌ | 2026-04-01 | 2026-04-30 | Month 6 target is $5–8K MRR but no Stripe, no invoice process, no decision on how money moves |

---

## 🟢 Sprint 2 — Target: End of May 2026

### Will

| # | Task | Owner | Status | Added | Target | Notes |
|---|------|-------|--------|-------|--------|-------|
| 18 | Document classification system (multi-stage LLM) | W | ❌ | 2026-03-15 | 2026-05-10 | Client uploads doc → auto-classify type |
| 19 | Field extraction engine (per doc type) | W | ❌ | 2026-03-15 | 2026-05-15 | Invoices, POs, bank statements → structured fields |
| 20 | Metrics computation layer | W | ❌ | 2026-03-15 | 2026-05-20 | Volume, timing, anomalies, patterns |
| 21 | Narrative insight generator | W | ❌ | 2026-03-15 | 2026-05-25 | LLM-powered synthesis of findings |
| 22 | ERP connector v0 — read-only (Kingdee or QuickBooks) | W | ❌ | 2026-03-15 | 2026-05-31 | Pull live transaction data — depends on #10 research |
| 23 | **[GAP]** Security hardening before real client data | W | ❌ | 2026-04-01 | 2026-05-15 | HTTPS on ECS, input validation on all routes, file type whitelisting, rate limiting |
| 24 | **[GAP]** Backup strategy for ECS + future RDS | W | ❌ | 2026-04-01 | 2026-05-15 | Applicants stored as JSON on ECS right now — if server dies, data is gone |

### Joanna

| # | Task | Owner | Status | Added | Target | Notes |
|---|------|-------|--------|-------|--------|-------|
| 25 | XHS VE — one-button pipeline (copy + image → ready to post) | J | ❌ | 2026-03-15 | 2026-05-15 | |
| 26 | Product Structure Agent v2 — Kingdee export format | J | ❌ | 2026-03-15 | 2026-05-20 | Expand beyond 聚水潭 |
| 27 | Product Structure Agent v2 — true COGS column | J | ❌ | 2026-03-15 | 2026-05-20 | Replace 40% estimate with real data |
| 28 | Deploy Product Structure Agent to ECS | J | ❌ | 2026-03-15 | 2026-05-25 | Get Streamlit app live on backend server |
| 29 | OMI Competitive Intel — end-to-end orchestrator (TASK-09) | J | ❌ | 2026-03-28 | 2026-05-10 | Single command: scrape → analyze → score → deliver |
| 30 | OMI Competitive Intel — production hardening (TASK-10) | J | ❌ | 2026-03-28 | 2026-05-20 | Error handling, retry logic, monitoring |
| 31 | RDS PostgreSQL setup | J | ❌ | 2026-03-15 | 2026-05-31 | Persistent database for client data |
| 32 | OSS bucket setup | J | ❌ | 2026-03-15 | 2026-05-31 | File storage for uploaded documents |

---

## 🔵 Sprint 3 — Target: End of June 2026

### Will

| # | Task | Owner | Status | Added | Target | Notes |
|---|------|-------|--------|-------|--------|-------|
| 33 | Report design system (HTML/CSS template) | W | ❌ | 2026-03-15 | 2026-06-10 | Auto-generated client findings report |
| 34 | Data injection layer (analysis output → template) | W | ❌ | 2026-03-15 | 2026-06-15 | |
| 35 | Chart/visualization engine (inline SVG) | W | ❌ | 2026-03-15 | 2026-06-20 | |
| 36 | ERP connector v1 — bidirectional (read + write) | W | ❌ | 2026-03-15 | 2026-06-25 | Post journal entries, update POs |
| 37 | Full end-to-end pipeline: intake → analysis → report | W | ❌ | 2026-03-15 | 2026-06-30 | Everything connected |

### Joanna

| # | Task | Owner | Status | Added | Target | Notes |
|---|------|-------|--------|-------|--------|-------|
| 38 | XHS Marketing Agent v2 — batch generation + scheduling | J | ❌ | 2026-03-15 | 2026-06-15 | Generate a week's content at once |
| 39 | XHS VE — connect to ERP data for campaign analysis | J | ❌ | 2026-03-15 | 2026-06-20 | |
| 40 | Image Generator — model selection + API setup | J | ❌ | 2026-03-15 | 2026-06-10 | Midjourney / Flux / DALL-E |
| 41 | Image Generator — prompt templates per use case | J | ❌ | 2026-03-15 | 2026-06-20 | Luxury aesthetic |
| 42 | End-to-end demo flow: ERP → intelligence → VE output | J | ❌ | 2026-03-15 | 2026-06-30 | The investor and client demo |

### Both

| # | Task | Owner | Status | Added | Target | Notes |
|---|------|-------|--------|-------|--------|-------|
| 43 | Domain name registration | B | ❌ | 2026-03-15 | 2026-06-01 | |
| 44 | Start ICP filing | B | ❌ | 2026-03-15 | 2026-06-01 | 1–3 weeks processing — start early |

---

## ✅ Completed

| # | Task | Owner | Done | Notes |
|---|------|-------|------|-------|
| — | Alibaba Cloud HK account setup | J | 2026-03-15 | |
| — | ECS server provisioned (2 CPU, 4GB, HK) | W | 2026-03-20 | 8.217.242.191 |
| — | Node.js + PM2 + Nginx installed on ECS | W | 2026-03-20 | Backend API running on port 80 |
| — | Vercel frontend deployment + CI/CD | W | 2026-03-20 | Auto-deploys on push to `main` |
| — | `ANTHROPIC_API_KEY` set in Vercel | W | 2026-04-01 | XHS War Room AI calls working |
| — | `ACCESS_CODE` set in Vercel | W | 2026-04-01 | Login working |
| — | `.env.example` + `CLAUDE.md` guardrails | B | 2026-03-15 | Environment variable rules documented |
| — | AI Diagnostics Calculator (5-step, bilingual, dark/light) | W | 2026-04-01 | `/calculator.html` |
| — | Calculator early access CTA → pre-fills onboarding form | W | 2026-04-01 | localStorage `rebase_prefill` |
| — | User onboarding form (`/onboarding`) | W | 2026-04-01 | Name, company, industry, competitors, goal |
| — | Invite code access gate + JWT auth (`/login`) | W | 2026-04-01 | HS256, 30-day token |
| — | Admin panel — applicant list + approve + invite code | W | 2026-04-01 | `/admin` |
| — | Vercel API: `POST /api/onboarding` | W | 2026-04-01 | ECS proxy → Resend email fallback |
| — | Vercel API: `POST /api/auth/verify-code` | W | 2026-04-01 | Issues JWT on valid code |
| — | Vercel API: `GET /api/admin/applicants` | W | 2026-04-01 | ECS proxy, empty-list fallback |
| — | Vercel API: `POST /api/admin/approve` | W | 2026-04-01 | Returns invite code, sends Resend notification |
| — | Global dark/light theme — all pages (`AppContext` + `C.*`) | W | 2026-04-01 | Zero hardcoded colors |
| — | Global bilingual ZH/EN — all pages | W | 2026-04-01 | Every string translated |
| — | Agent Monitor page (`/agents`) | W | 2026-04-01 | Live status grid, bilingual, themed |
| — | XHS War Room — 4-tab AI content tool | W | 2026-04-01 | Calls Claude via `/api/ai` |
| — | Market Intelligence overview page | W | 2026-04-01 | Bilingual, themed |
| — | Workflow Scout (`/workflows`) | W | 2026-04-01 | Bilingual, themed |
| — | Cost & ROI Dashboard (`/costs`) | W | 2026-04-01 | Coming-soon with feature preview cards |
| — | ProtectedRoute JWT gate on all agent pages | W | 2026-04-01 | Redirects to `/login` if no valid token |
| — | Market Intelligence daily cron (6:30am HK) | W | 2026-04-01 | News fetch → Claude analysis → email report |
| — | 3-screen visualization dashboard | J | 2026-03-15 | Department map, before/after toggle, ROI summary |
| — | Product Structure Agent v0.1 | J | 2026-03-20 | 3-file ERP analysis, Streamlit, FastAPI |
| — | OMI Competitive Intelligence v2 (TASK 01–08) | J | 2026-03-28 | Full pipeline: scrape → temporal → score → narrative → WeChat |
| — | AI Intake Agent — master prompt (5-phase conversation) | W | 2026-03-15 | In `services/diagnostics/intake-agent/prompts/` |
| — | AI Intake Agent — 5 vertical prompt modules | W | 2026-03-15 | Export, construction, distribution, industrial, property |
| — | AI Intake Agent — JSON output schema | W | 2026-03-15 | `intake_output.json` |
| — | AI Intake Agent — Dify config guide | W | 2026-03-15 | Ready to build in Dify |
| — | README, ROADMAP, CHANGELOG updated to reflect Platform v1 | W | 2026-04-01 | All docs in sync |

---

## ⚫ Future (No Target Date Yet)

| # | Task | Owner | Added | Notes |
|---|------|-------|-------|-------|
| F1 | Benchmark library — collect patterns from every client | B | 2026-03-15 | Compounds over time — start capturing from client 1 |
| F2 | Intent pack design — document reusable workflow modules | B | 2026-03-15 | Starts with first successful deployment |
| F3 | Self-assessment tool — Layer 1 (15-min gap questionnaire) | J | 2026-03-15 | Top-of-funnel lead gen tool |
| F4 | Cost Dashboard — real Anthropic API usage data | W | 2026-04-01 | Wire to actual spend |
| F5 | Per-user invite codes (replace shared master code) | W | 2026-04-01 | When ECS has persistent DB |
| F6 | Computer-use agent for legacy Kingdee (no API) | W | 2026-03-15 | UI automation for older versions |
| F7 | Layer 4: Cross-department event bus | TBD | 2026-03-15 | After Layer 3 virtual employees operational |
| F8 | Layer 5: Self-serve onboarding platform | TBD | 2026-03-15 | After Layer 2 + 3 proven |

---

## How to Use This File

1. **Every session:** Check "This Week" first. Only pick up tasks that are ❌ Not Started or 🔄 In Progress.
2. **Completing a task:** Move it to the ✅ Completed table with today's date.
3. **Adding a new task:** Add it to the right sprint section with today's date in **Added** and a realistic **Target** date.
4. **Reprioritising:** Move tasks between sprint sections — update the Target date when you do.
5. **New gaps found:** Mark with **[GAP]** tag so it's clear it wasn't in the original plan.
