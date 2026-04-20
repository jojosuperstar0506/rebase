# Rebase CI · Architecture v3 — "Weekly Action Kit"

> **Status as of April 20, 2026**
> Frontend-first rebuild complete (mock-data). Backend pipelines next.
> Author: Will. For handoff to Joanna.

---

## 1. One-paragraph summary (start here)

We stopped building Rebase as a **dashboard product** and started building it as an **action product**. The insight: Chinese SMB owners don't want charts — they want "tell me what to do Monday morning." The CI vFinal tab is now a **Weekly Action Kit**: a single magazine-style page (`/ci`) where the user reads a 2-minute brief and walks away with (a) 2 ready-to-publish Douyin scripts, (b) 1 product concept to evaluate, and (c) an AI verdict on whether they're winning or losing this week. All 12 dimensional scores and drill-down analytics still exist — they're one tab over (`/ci/analytics`), not hidden but not shouting. The frontend is built and deployed with realistic mock data so we can show the experience to users and iterate on shape before committing backend engineering time.

---

## 2. The product in 5 screens

| # | Tab | Job-to-be-done | Default time to use |
|---|---|---|---|
| 1 | 📰 **Brief** (`/ci`) | "What do I do this week?" | 2 min (Monday AM) |
| 2 | 📊 **Analytics** (`/ci/analytics`) | "Why is that the priority? Where's the white space?" | 5 min (Tue / Wed) |
| 3 | 📚 **Library** (`/ci/library`) | "What did we post last month? What products considered?" | 1 min (reference / search) |
| 4 | 🏷️ **Brands** (`/ci/competitors`) | "Who am I tracking? Me vs them side-by-side." | 2 min (config) |
| 5 | ⚙️ **Settings** (`/ci/settings`) | Workspace + platform connections | once |

_(Plus a Help tab.)_

**The Brief is the product.** Everything else supports it.

---

## 3. What's built today ✅

### 3.1 Frontend (all live on Vercel)

- ✅ **Brief page** (`/ci/CIBrief.tsx`) — magazine-style scroll with 4 sections:
  1. Verdict card with trend pill + "If you only do one thing" box
  2. "3 things that moved" — each with so-what + action
  3. Content playbook — 2 Douyin scripts (hook / main / CTA) with Copy · Mark Posted · Dismiss
  4. Product opportunity — concept with signals, price, channels
  5. Collapsible "See all 12 metrics" panel
- ✅ **Analytics page** (`/ci/CIAnalytics.tsx`) — 3 sections:
  1. Priority metrics this week (4 cards, click → 8-week trend + per-brand bars)
  2. White space opportunities (3 cards, click → full reasoning + supporting data)
  3. All 12 metrics grid (collapsed by default)
- ✅ **Library page** (`/ci/CILibrary.tsx`) — archive with drill-down:
  - Tab switcher: Past Briefs · All Content · Product Concepts
  - Search filter
  - Every card clicks into a full-detail modal
- ✅ **Brands page** (`/ci/CICompetitors.tsx`) — own brand pinned as row 1 with "comparison baseline" badge
- ✅ **Shared drill-down modal** — consistent UX across Analytics + Library
- ✅ **Data freshness banner** — color-coded (green ≤7d, yellow ≤14d, red >14d)
- ✅ **Dismissible action items** — localStorage-backed, no more "same reminder every visit"
- ✅ **Metric status enum** (`computed | pending | no_data | not_applicable`) — kills the "0 means three different things" ambiguity
- ✅ **"Run Today's Analysis" button** — visible on every Brief visit (Phase 2 will wire to real regeneration)
- ✅ **Polling timeout** — 15 min max, no infinite spinner
- ✅ **5 legacy pages deleted** — CIDashboard, CIIntelligence, CILandscape, CIDeepDive, AppDashboard (3,900 lines removed)
- ✅ **Workspace isolation fixed** — no more LANDSCAPE_SEED leaking OMI's 16 bag brands into every workspace's chart
- ✅ **Removed 竞品分析 tab** (the redundant legacy CI entry point)

### 3.2 Backend & scraper work done earlier

- ✅ **Douyin browser-mode scraper** (`services/competitor_intel/scrapers/douyin_scraper.py`) working end-to-end on local Windows (residential IP)
- ✅ **Log-scale scoring fix** (`scoring_pipeline.py` v1.1) — megabrands no longer clamp to identical scores
- ✅ **Follower extraction regex fix** — label-first pattern (粉丝 32.6M) + number-first fallback
- ✅ **Rate-limit defense** — 45–90s jittered inter-brand delay, markers detection, debug dumps
- ✅ **Deterministic video sort** — client-side sort by like count (doesn't rely on Douyin UI sort tab)
- ✅ **Selector-based extraction** — `a[href*="/video/"]` / `a[href*="/user/"]` instead of fragile positional innerText parsing
- ✅ **Status-aware API response** (`GET /api/ci/intelligence`) — emits `computed | no_data | not_applicable` per brand × metric
- ✅ **Real-data smoke test passed** — Nike workspace produces differentiated scores (Adidas 51 / 安踏 50 / 李宁 49 on momentum) from real scraped Douyin data

### 3.3 Mock data layer

- ✅ **`services/ciMocks.ts`** — complete type contract the real API must match, with realistic Nike workspace content:
  - `WeeklyBrief` (verdict + 3 moves + 2 content drafts + 1 product opportunity)
  - `LibraryEntry[]` (3 weeks of archived briefs)
  - `AnalyticsData` (4 priority metrics + 3 white spaces + 12 full metrics + 8 weeks of trend history)
  - `SignalSource` map (Douyin video references backing key claims)

All UI runs off these mocks today. Flip `USE_MOCKS = false` when backend ships — no frontend code changes needed.

---

## 4. What's pending ⏳

Organized by phase. Each task has a rough effort estimate so Joanna can pick and plan.

### ⏳ Phase 1 — Data foundation (backend, ~3 hours)

Unlocks: the Brief's verdict + "3 things that moved" section using real data instead of mocks.

| # | Task | File to create/edit | Effort |
|---|---|---|---|
| 1.1 | **Scrape the user's own brand** (scrape_runner.py gets `--include-own-brand` flag that reads `workspaces.brand_name` and treats it as a competitor) | `services/competitor_intel/scrape_runner.py` | 1h |
| 1.2 | **Domain aggregation pipeline** — reads 12 metric scores, writes 3 rollup scores (`consumer_domain`, `product_domain`, `marketing_domain`) to `analysis_results` | `services/competitor_intel/pipelines/domain_aggregation_pipeline.py` (new) | 45m |
| 1.3 | **Brand positioning pipeline** — reads 3 domain scores + week-over-week deltas, calls DeepSeek to produce verdict sentence + 3 moves + top action. Stores per week per workspace. | `services/competitor_intel/brand_positioning_pipeline.py` (new) | 1h |
| 1.4 | **Stop DB cleanup of `analysis_results`** — we've been wiping rows during testing. Need historical rows for delta detection. | DB hygiene, no new file | 15m |

### ⏳ Phase 2 — Action engines (backend, ~4 hours)

Unlocks: the Brief's content playbook (Section 2), product opportunity (Section 3), and the Analytics tab's white space (§B).

| # | Task | File to create/edit | Effort |
|---|---|---|---|
| 2.1 | **New DB tables** — `content_recommendations` and `product_opportunities`. Schema migration. | `backend/migrations/` or psql directly | 20m |
| 2.2 | **GTM content pipeline** (Douyin) — generates 2 scripts per week, strict prompt template with hook 3s / main 15s / CTA 3s, grounded in actual competitor signals | `services/competitor_intel/pipelines/gtm_content_pipeline.py` (new) | 1.5h |
| 2.3 | **Product opportunity pipeline** — 1 concept per week, prompt heavily grounded in real trending keywords + real competitor product names (no hallucinations) | `services/competitor_intel/pipelines/product_opportunity_pipeline.py` (new) | 1h |
| 2.4 | **White space pipeline** — identifies uncontested dimensions / price bands / keyword pockets. 2-4 opportunities per week with DeepSeek reasoning. | `services/competitor_intel/pipelines/white_space_pipeline.py` (new) | 1h |
| 2.5 | **API endpoints** — `GET /api/ci/content`, `GET /api/ci/opportunities`, `GET /api/ci/analytics`, plus status-mutation endpoints for mark_posted / dismiss / accept | `backend/server.js` | 45m |

### ⏳ Phase 3 — Wire frontend to real backend (~2 hours)

Unlocks: the actual product. No mocks.

| # | Task | File | Effort |
|---|---|---|---|
| 3.1 | **Flip `USE_MOCKS = false`** in `services/ciMocks.ts` | `frontend/src/services/ciMocks.ts` | 1m |
| 3.2 | **Replace mock functions with real fetch calls** — `getBrief`, `getLibrary`, `getAnalytics`, `getBriefByWeek`, `getSignalSource` all point at new backend endpoints | `frontend/src/services/ciMocks.ts` + `ciApi.ts` | 1h |
| 3.3 | **Error/empty-state polish** — handle backend 500s, first-scrape-pending states, network drops | `CIBrief.tsx`, `CIAnalytics.tsx`, `CILibrary.tsx` | 45m |
| 3.4 | **End-to-end smoke test** — Nike and OMI workspaces, full flow from scrape → brief render | manual | 30m |

### 🔜 Phase 4 — Nice-to-have / future

Not blocking V1 launch. Parked for post-demo.

| # | Task | Notes |
|---|---|---|
| 4.1 | **XHS scraper** (not Douyin-only) | Unlocks real data for price_positioning / trending_products / design_profile / wtp. Joanna's help needed for XHS login flow. |
| 4.2 | **Merchant-account OAuth** | The OMI-style "insider data" path — user connects their own XHS 品牌号 / Tmall 生意参谋 for deeper analytics. |
| 4.3 | **XHS content generator** (`gtm_content_pipeline.py` gets XHS template) | Second platform after Douyin ships. |
| 4.4 | **Signal-source drill-down inside the Brief** | Click "Adidas Samba launched" in the Brief → see the 5 actual Douyin videos we scraped. Mock already has the shape; just needs wiring. |
| 4.5 | **Monday-morning email digest** | Send the brief as an email every Monday at 8am so users don't need to log in. Would 10x retention. |
| 4.6 | **User-pinned priority metrics** | Let users override the AI's `|delta| × gap` algorithm. V2 feature. |

---

## 5. Known caveats & open questions

### Delta detection needs historical data
The "3 things that moved" and "priority metrics" sections rely on **week-over-week deltas**. We have ONE snapshot of real scraped data as of April 19. The first real brief will honestly say *"Week 1 baseline — come back next week to see what changed."* Week 2+ gets progressively better as history accumulates. For the demo, mocks paper over this; for real users, be honest about it.

### Douyin is blind to pricing
4 of the 12 dimensions (`price_positioning`, `trending_products`, `design_profile`, `wtp`) structurally can't be computed from Douyin-only data — Douyin doesn't expose product catalogs or prices. These render as 🔒 "Requires XHS or Tmall data source — connect a brand account to unlock" via the metric status enum. Fix is XHS scraper (Phase 4).

### Mock content quality ≠ DeepSeek output
The mock Douyin scripts and verdict prose were **hand-written to look like what DeepSeek will realistically produce** on real scraped data. If the actual DeepSeek output is worse than the mocks, expect 2–3 iterations on prompt engineering before the content is "copy-and-ship" quality. Prompt engineering is a real cost center in Phase 2.

### Scraping stays on local machines
The Douyin scraper runs on a residential IP (Will's Windows). ECS datacenter IPs get blocked within hours. This is fine for Phase 1 (Will runs scraper once, data flows to ECS DB via SSH tunnel), but long-term this is a user-setup cost we should think about for non-technical customers.

---

## 6. How to pick this up (handoff notes)

### If you want to work on the frontend
Everything you need is in `frontend/src/`:

- **Pages:** `frontend/src/pages/ci/` — CIBrief, CIAnalytics, CILibrary, CICompetitors, CISettings, CIHelp
- **Shared components:** `frontend/src/components/ci/` — CISubNav, CIDrillDownModal, plus some orphaned `intelligence/` files that can be cleaned up
- **Mock data + types:** `frontend/src/services/ciMocks.ts` — this is the API contract, don't break it
- **Colors:** `frontend/src/theme/colors.ts` — `ColorSet` interface; always type component `C` props as `ColorSet` (not `Record<string, string>` — the build will fail)

Run locally: `cd frontend && npm install && npm run dev`
Deploy: automatic via Vercel on every push to `main`

### If you want to work on the backend pipelines

- Pipeline files live in `services/competitor_intel/pipelines/`
- They read from `scraped_brand_profiles` and `scraped_products`, write to `analysis_results`
- All new pipelines should follow the `--workspace-id UUID` / `--all` argparse pattern
- The backend API is Node.js at `backend/server.js`, runs on ECS via PM2 (`pm2 restart rebase-backend` after changes)
- ECS SSH: root @ 8.217.242.191, password `RebaseAdmin2026` (needs rotation before prod)
- Database: PostgreSQL on ECS, tunnel via `ssh -L 5432:localhost:5432 root@8.217.242.191 -N`

### If you want to work on the scraper

- **Must run on your local Windows machine** (residential IP). ECS datacenter gets blocked.
- Setup: `python -m services.competitor_intel.setup_profiles --platform douyin` (one-time QR login)
- Run: `python -m services.competitor_intel.scrape_runner --platform douyin --tier watchlist --mode browser [--limit N]`
- Data flows to ECS DB via SSH tunnel — keep the tunnel open in a second terminal while scraping.

### If you want to iterate on prompts (DeepSeek outputs)

- `DEEPSEEK_API_KEY` lives in ECS `backend/.env`
- Prompt templates will go in the Phase 2 pipelines (`gtm_content_pipeline.py`, etc.)
- For Douyin scripts: the mock data in `ciMocks.ts` (`MOCK_BRIEF_NIKE.content_drafts`) is the target tone/structure
- For product opportunities: see `MOCK_BRIEF_NIKE.product_opportunity` — signals are grounded in real data, no hallucinations

---

## 7. Git history (for context)

Recent commits that implement this architecture, most recent first:

```
71dbf64  feat(ci): Analytics tab + Library drill-downs
c3f13b9  fix(ci): TypeScript build errors in Brief rebuild
69f4346  feat(ci): Brief-centric rebuild — weekly action kit replaces dashboards
d04d213  chore(frontend): remove 竞品分析 tab and AppDashboard
79651a8  fix(ci): workspace isolation + one-click daily re-analysis
699be0b  feat(ci): metric status enum, freshness banner, N/A for Douyin-only data
42cff0e  fix(douyin): regex had follower label order backwards
ed0fe50  fix(scoring): log-scale normalization so megabrands don't clamp identically
5385143  fix(douyin): selector-based extraction, deterministic sort, rate-limit defense
```

Previous architecture docs (for reference):
- `INTELLIGENCE-ARCHITECTURE.md` (v1) — original 12-metric framework
- `INTELLIGENCE-ARCHITECTURE-v2.md` (v2) — 3-domain grouping + pipeline inventory
- `INTELLIGENCE-ARCHITECTURE-v3.md` (this) — Brief-centric rebuild, mock-data frontend, backend pending

---

## 8. TL;DR for Joanna

1. **Frontend is 95% done and live on Vercel.** Open the Rebase production URL, log in, click 竞品情报. You're on the new Brief. Explore the 5 tabs.
2. **Backend is ~9 hours of focused work away.** Phases 1, 2, 3 above, sequential. I'd do them in order.
3. **Mocks are intentionally realistic** — if the Brief prose + Douyin scripts + product concepts feel right to you, that's the bar the real DeepSeek output needs to hit. Give feedback on tone/shape now; changing prompts later is cheap, changing UI is expensive.
4. **The thing that makes Rebase different** is Section 2 + 3 of the Brief (content + product) and Analytics §B (white space). Nobody else does this. Dashboards are table stakes; action is the moat.
5. **Ask me anything** — architecture questions, how X works, why we made Y decision. Git log has most of the reasoning inline.

---

*End of v3 · April 20, 2026*
