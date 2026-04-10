# CODEBASE-AUDIT.md — Rebase Platform Full Inventory

**Task:** TASK-00 (Read-only audit. No existing files were modified.)
**Date:** 2026-04-10
**Purpose:** Pre-build inventory before adding "Competitive Intelligence vFinal" tab. All findings verified by reading actual files.

---

## 1. Frontend Inventory

### 1.1 Dependencies (`frontend/package.json`)

**Production dependencies:**
| Package | Version | Purpose |
|---------|---------|---------|
| `react` | ^19.0.0 | UI framework |
| `react-dom` | ^19.0.0 | React DOM rendering |
| `react-router-dom` | ^7.0.0 | Client-side routing |

**Dev dependencies:**
| Package | Version | Purpose |
|---------|---------|---------|
| `@types/react` | ^19.0.0 | TypeScript types |
| `@types/react-dom` | ^19.0.0 | TypeScript types |
| `@vitejs/plugin-react` | ^4.3.0 | Vite React plugin |
| `typescript` | ^5.6.0 | TypeScript compiler |
| `vite` | ^6.0.0 | Build tool |

**Notable absences:** No UI component library (MUI, Radix, shadcn, etc.), no chart library (recharts, chart.js, echarts), no i18n library (react-i18next, etc.). All built from scratch.

**Scripts:**
- `dev` — Vite dev server
- `build` — `tsc -b && vite build`
- `preview` — preview production build

**Package type:** `"module"` (ES modules)

---

### 1.2 Directory Structure (`frontend/src/`, 2 levels)

```
frontend/src/
├── App.tsx                          # Root component — all routes defined here
├── main.tsx                         # Vite entry point
├── vite-env.d.ts                    # Vite type declarations
├── context/
│   └── AppContext.tsx               # Global state: theme, language, auth
├── theme/
│   └── colors.ts                    # C.* design token definitions
├── i18n/
│   └── index.ts                     # LANG/T bilingual pattern + t() helper
├── types/
│   └── workflow.ts                  # TypeScript interfaces for workflow data
├── utils/
│   └── jwt.ts                       # JWT decode + isTokenValid()
├── data/
│   ├── mockVisualization.ts         # Mock department/workflow data
│   └── competitors/
│       └── competitors_latest.json  # Latest competitor data (SKELETON — see §5)
├── hooks/                           # Custom React hooks (empty or minimal)
├── components/
│   ├── ProtectedRoute.tsx           # Auth guard — redirects to /login
│   └── workflow/
│       ├── ComparisonToggle.tsx     # Before/after workflow toggle
│       ├── ContactModal.tsx         # Contact info modal
│       ├── FileUpload.tsx           # Drag-drop file upload
│       ├── GraphView.tsx            # SVG workflow graph renderer
│       ├── InsightsPanel.tsx        # Bottleneck analysis display
│       ├── IntakePanel.tsx          # Workflow description form
│       ├── LoadingView.tsx          # Loading skeleton states
│       └── SummaryBar.tsx          # KPI summary bar
└── pages/
    ├── Home.tsx
    ├── Login.tsx
    ├── Signup.tsx
    ├── Onboarding.tsx
    ├── Success.tsx
    ├── Admin.tsx
    ├── AppDashboard.tsx
    ├── AgentMonitor.tsx
    ├── Calculator.tsx
    ├── DiagnosticDashboard.tsx
    ├── WorkflowScout.tsx
    ├── XhsWarroom.tsx
    ├── MarketIntelligence.tsx
    └── CostDashboard.tsx
```

---

### 1.3 Page Components (14 total)

| File | Route | Description | Auth Required |
|------|-------|-------------|---------------|
| `Home.tsx` | `/` | Landing page: hero, pillars, how-it-works, CTAs | No |
| `Login.tsx` | `/login` | Enter invite code → receives JWT | No |
| `Signup.tsx` | `/signup` | Self-serve application form (brand name, industry) | No |
| `Onboarding.tsx` | `/onboarding` | 7-field application intake (company, industry, competitors, goals) | No |
| `Success.tsx` | `/success` | Post-application confirmation page | No |
| `Admin.tsx` | `/admin` | Password-gated applicant management: view pending, generate invite codes | No (password-gated) |
| `AppDashboard.tsx` | `/intelligence` | **智能体 CI tab**: bubble chart (threat × momentum), brand rankings table, AI narrative, action items | Yes |
| `AgentMonitor.tsx` | `/agents` | Agent registry: 9 agents across 4 categories, status badges, metrics | Yes |
| `Calculator.tsx` | `/calculator` | AI ROI diagnostic tool for manufacturing companies (1115 lines, lazy loaded) | No |
| `DiagnosticDashboard.tsx` | `/demo` | Department org chart + before/after AI toggle; ROI summary, pain hotspot cards | No |
| `WorkflowScout.tsx` | `/workflows` | Upload docs → Claude parses → SVG workflow graph + gap analysis (681 lines) | Yes |
| `XhsWarroom.tsx` | `/agents/xhs-content` | 4-tab XHS content creation suite: competitor analysis, keyword mining, decision path, content gen (472 lines) | Yes |
| `MarketIntelligence.tsx` | `/agents/market-intelligence` | Market intel agent setup (6 news sources, 3 analysis lenses, daily email) | Yes |
| `CostDashboard.tsx` | `/costs` | Cost tracking — "coming soon" placeholder | Yes |

---

### 1.4 Routing

**File:** `frontend/src/App.tsx`
**Router:** React Router v7 (`createBrowserRouter` or `<BrowserRouter>` with `<Routes>`)

All routes are registered in `App.tsx`. The Vercel rewrite `"source": "/(.*)", "destination": "/index.html"` handles SPA deep links.

**Protected routes** wrap components in `<ProtectedRoute>`:
- `/intelligence`, `/agents`, `/agents/xhs-content`, `/agents/market-intelligence`, `/workflows`, `/costs`

**Nav behavior:** Sticky header shows login link when unauthenticated; shows agent/tool links when `isLoggedIn` (checks `localStorage.rebase_token`).

---

### 1.5 Theming — C.* Token Pattern

**File:** `frontend/src/theme/colors.ts`

```typescript
interface ColorSet {
  bg: string;       // Page background
  s1: string;       // Surface 1 (cards)
  s2: string;       // Surface 2 (subtle backgrounds)
  bd: string;       // Border
  tx: string;       // Text primary
  t2: string;       // Text secondary
  t3: string;       // Text tertiary
  ac: string;       // Accent (primary CTA color)
  ac2: string;      // Accent 2 (gradient pair)
  navBg: string;    // Nav background
  navBd: string;    // Nav border
  inputBg: string;  // Input background
  inputBd: string;  // Input border
  danger: string;   // Error / danger
  success: string;  // Success
}
```

**Dark preset:** `bg: "#0c0c14"`, `ac: "#06b6d4"` (cyan), `ac2: "#8b5cf6"` (purple)
**Light preset:** `bg: "#f8f9fb"`, `ac: "#0891b2"` (teal), `ac2: "#7c3aed"` (violet)

**Usage pattern:**
```typescript
const { colors: C, lang, toggleTheme } = useApp();
// Then in JSX:
style={{ background: C.bg, color: C.tx, border: `1px solid ${C.bd}` }}
```

All styles are inline (no CSS files, no CSS modules, no Tailwind). Colors come exclusively from `C.*`.

---

### 1.6 Bilingual — T / t() Pattern

**File:** `frontend/src/i18n/index.ts`

```typescript
type Lang = "en" | "zh";

export const T = {
  nav: {
    diagnostics: { en: "Diagnostics", zh: "AI诊断" },
    intelligence: { en: "Intelligence", zh: "竞品分析" },
    // ... more keys
  },
  home: {
    badge: { en: "...", zh: "..." },
    heroTitle1: { en: "...", zh: "..." },
    // ... nested by page
  },
  // ... sections for each page
};

export function t(key: { en: string; zh: string }, lang: Lang): string {
  return key[lang];
}
```

**Usage:**
```typescript
const { lang } = useApp();
<h1>{t(T.home.heroTitle1, lang)}</h1>
```

**Adding new translations:**
1. Add key under correct section in `T` object: `T.ci.someKey = { en: "...", zh: "..." }`
2. Call `t(T.ci.someKey, lang)` in the component

Language toggled via `toggleLang()` from `useApp()`. Persisted in `localStorage.rebase_lang`.

---

### 1.7 Auth Flow

**Files:**
- `frontend/src/utils/jwt.ts` — `decodeJwtPayload(token)`, `isTokenValid(token | null)`
- `frontend/src/components/ProtectedRoute.tsx` — checks validity, redirects to `/login` if invalid

**End-to-end flow:**
1. User enters invite code on `/login`
2. POST `/api/auth/verify-code` with `{ code }` → returns `{ token: "JWT..." }`
3. `localStorage.setItem("rebase_token", token)` + dispatch `"rebase_auth_change"` event
4. `ProtectedRoute` reads `localStorage.getItem("rebase_token")`, calls `isTokenValid()` (checks expiry)
5. Logout: `localStorage.removeItem("rebase_token")` + dispatch event → Nav updates

**localStorage keys:**
| Key | Value | Purpose |
|-----|-------|---------|
| `rebase_token` | JWT string | Auth token for API calls + route protection |
| `rebase_theme` | `"dark"` or `"light"` | Persisted theme preference |
| `rebase_lang` | `"en"` or `"zh"` | Persisted language preference |
| `admin_authed` | any truthy | Set when admin password is correct |
| `rebase_prefill` | JSON string | Calculator data pre-filled into onboarding |

**JWT claims:** Signed with `JWT_SECRET` env var, 30-day expiration, via `jsonwebtoken` 9.0.2 on backend.

---

### 1.8 Charts & Visualizations

**No third-party chart library.** All visualizations are custom SVG.

**Reusable chart code (key files):**

**1. Bubble Chart — `frontend/src/pages/AppDashboard.tsx` (~200-350 lines of SVG)**
- X-axis: Threat Index (0-100), Y-axis: Momentum Score (0-100)
- Bubble size: WTP Score → `radius = 18 + (wtp/100)*22`
- Quadrant coloring: 🔴 high threat+momentum, 🔵 high momentum low threat, 🟠 low momentum high threat, ⚫ gray
- Quadrant labels, grid lines, hover tooltips
- Interactive: hover shows brand name

**2. Workflow Graph — `frontend/src/components/workflow/GraphView.tsx`**
- SVG node-edge renderer: task (rect), decision (diamond), approval (double-rect), handoff (hexagon)
- Bezier curve edges with condition labels
- Bottleneck pulse animation (SVG `@keyframes`)
- Automatic layer/position calculation (200px H, 120px V spacing)

**3. Org Chart — `frontend/src/pages/DiagnosticDashboard.tsx`**
- SVG department boxes in grid layout with connection lines
- Animated counters (`useAnimatedCounter` hook with easing)
- Before/after toggle animation

---

## 2. Backend Inventory

### 2.1 Architecture Overview

Three backend layers:

```
Vercel Frontend
      ↓ API calls
/api/*.js (Vercel serverless — Node.js)
      ↓ forward via fetch to ECS_URL
/backend/server.js (Express on ECS — persistent, stateful)
      ↓ reads/writes
/backend/config/*.json (JSON file storage)
      ↓ (separate, parallel)
/gateway/ (FastAPI Python — self-serve SaaS v2, partially integrated)
```

---

### 2.2 Express Backend (`/backend/server.js`) — 23KB

**Framework:** Express.js 4.18.2, port 3000 (env `PORT`)

**Middleware stack (in order):**
1. `cors` 2.8.5 — configurable origin (default `*`)
2. `express.json()` — JSON body parser
3. `express-rate-limit` 7.4.0 — 20 req/min per IP, 60s window
4. Custom `requireSecret()` — validates `x-rebase-secret` header on all `/api/*` routes

**Public routes (no secret required):** `/api/onboarding`, `/api/auth/verify-code`

**All API Routes:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Public health check (no rate limit) |
| POST | `/api/chat` | Claude chatbot proxy |
| POST | `/api/ai` | Anthropic Messages API proxy |
| POST | `/api/gtm-agent` | Go-to-market analysis via Claude |
| POST | `/api/scheduled-agent` | Overnight scheduled task runner |
| POST | `/api/onboarding` | Save applicant from signup form (public) |
| POST | `/api/save-survey` | Save calculator diagnosis results |
| POST | `/api/submit-lead` | Save lead with contact info |
| POST | `/api/competitor-report/run` | Manual trigger: intelligence report |
| POST | `/api/intelligence/optimize` | Manual trigger: weekly playbook optimizer |
| POST | `/api/intelligence/setup` | Create new intelligence user profile |
| GET | `/api/intelligence/profile/:userId` | Get user profile JSON |
| GET | `/intelligence/feedback` | Click-through feedback from email (HMAC validated) |
| GET | `/api/admin/applicants` | List all applicants |
| POST | `/api/auth/verify-code` | Verify invite code → return JWT (public) |
| POST | `/api/admin/approve` | Approve applicant, generate invite code |

**Scheduled jobs (node-cron 3.0.3):**
- Daily 6:30am HK time: competitor intelligence report
- Weekly Sunday 6:00am HK: playbook optimizer

**External integrations:**
- `@anthropic-ai/sdk` 0.39.0 — Claude API
- `jsonwebtoken` 9.0.2 — JWT signing (30-day expiry)
- Resend REST API — email delivery

---

### 2.3 Storage

**No SQL database in the Express layer (yet).** Data stored as JSON files on disk:

| Path | Contents |
|------|----------|
| `/backend/config/applicants/*.json` | One file per applicant from signup form |
| `/backend/config/surveys/*.json` | Calculator diagnosis results |
| `/backend/config/leads/*.json` | Leads with name + contact |
| `/backend/config/users/{userId}/profile.json` | User intelligence profile |
| `/backend/config/users/{userId}/playbook.json` | Weekly optimization playbook |
| `/backend/config/users/{userId}/reports/` | Daily competitor intel reports |

**PostgreSQL:** `DATABASE_URL` env var exists in `.env.example` but is not active in the Express layer. The FastAPI gateway has `get_pool()` / `close_pool()` scaffolding but no schema migrations.

---

### 2.4 Vercel Serverless Functions (`/api/*.js`)

All functions forward to `ECS_URL` (env var) and handle email side-effects via Resend.

| File | Route | Behavior |
|------|-------|---------|
| `ai.js` | POST `/api/ai` | Proxy to Anthropic API |
| `onboarding.js` | POST `/api/onboarding` | Forward to ECS + send confirmation email |
| `save-survey.js` | POST `/api/save-survey` | Forward to ECS silently (always 200) |
| `submit-lead.js` | POST `/api/submit-lead` | ECS forward + email to Will/Joanna |
| `auth/verify-code.js` | POST `/api/auth/verify-code` | Proxy to ECS |
| `admin/applicants.js` | GET `/api/admin/applicants` | Proxy to ECS |
| `admin/approve.js` | POST `/api/admin/approve` | ECS forward + two email flows |
| `workflow-decompose.js` | POST `/api/workflow-decompose` | Parse workflow description → WorkflowGraph JSON (Claude) |
| `workflow-analyze.js` | POST `/api/workflow-analyze` | Analyze workflow gaps + recommend tools (Claude) |
| `workflow-lead.js` | POST `/api/workflow-lead` | Capture workflow contact info |

---

### 2.5 FastAPI Gateway (`/gateway/`)

Self-serve SaaS v2 layer, not yet fully wired to frontend.

**Routes:**
| Method | Path | File | Purpose |
|--------|------|------|---------|
| POST | `/api/v2/auth/signup` | `routers/auth_v2.py` | Email/password signup |
| POST | `/api/v2/auth/login` | `routers/auth_v2.py` | Login → JWT |
| GET | `/api/v2/dashboard/...` | `routers/dashboard_v2.py` | Self-serve customer analytics |
| * | `/api/v2/customers/...` | `routers/customers.py` | Customer management (X-Admin-Password) |
| GET | `/health` | `main.py` | Health check |

**Middleware:** `CORSMiddleware` with `allow_origins=["*"]`

---

## 3. Scraper Inventory

**Location:** `services/competitor-intel/`

### 3.1 Directory Tree

```
services/competitor-intel/
├── orchestrator.py              # Main coordinator — runs all scrapers, merges data
├── config.py                    # 20 brand definitions (3 groups), scrape priorities
├── storage.py                   # SQLite persistence (snapshots, metrics, deltas)
├── temporal.py                  # Delta computation + anomaly detection
├── scoring.py                   # Momentum, Threat Index, WTP Score (all 0-100)
├── narrative.py                 # Claude Haiku insights per brand
├── html_generator.py            # Generates static competitor-intel.html dashboard
├── delivery.py                  # WeChat Work weekly brief
├── scrapers/
│   ├── xhs_scraper.py          # Xiaohongshu scraper (D1, D2, D3, D4, D6)
│   ├── douyin_scraper.py       # Douyin scraper (D1, D2, D4, D5)
│   └── sycm_scraper.py        # 生意参谋 scraper (D7)
├── analysis/
│   └── anthropic_analyzer.py   # BrandEquityAnalyzer — Claude Sonnet per-brand analysis
└── data/
    └── competitor_intel.db      # SQLite database (exists, used locally)
```

---

### 3.2 Scraper Details

#### XHS Scraper (`scrapers/xhs_scraper.py`)

**Platform:** Xiaohongshu (小红书)

**Data extracted (5 of 7 dimensions):**
- **D1 — Search Index:** search suggestions (8 max), search volume rank, related searches
- **D2 — Brand Voice Volume:** followers, total notes, total likes, account name/ID
- **D3 — Content Strategy:** content type distribution (7 categories: OOTD, reviews, unboxing, daily, recommendations, video, other), top 10 notes
- **D4 — KOL Ecosystem:** top 10 KOLs, collaboration count, celebrity mentions
- **D6 — Consumer Mindshare:** sentiment keywords (positive/negative split), UGC sample notes

**Extraction methods:**
- **Browser mode:** Playwright `page.accessibility.snapshot()` (accessibility tree) → regex parsing. Most reliable for anti-bot evasion.
- **API mode:** httpx HTTP GET + regex on HTML DOM response

**Output dataclass:** `XhsBrandData` with fields for each dimension + `scrape_status: "pending|success|partial|failed"`

**Rate limiting:** `2 + (time.time() % 3)` = 2-5 second random delays

**Error handling:** Try/catch around all scraping. Status = `"partial"` if some data returned, `"failed"` if none.

**Cookie injection:** Optional `cookies` parameter at init. Can be loaded from env var (`XHS_COOKIES`) or passed from orchestrator. Architecture supports loading from DB at runtime.

**Headless on Linux:** ✅ Yes (browser or API mode)

**Cron verdict:** **Needs: persistent `profile_dir` (pre-logged Chrome profile) OR fresh cookies + proxy rotation infrastructure. Cookie expiry detection NOT implemented.**

---

#### Douyin Scraper (`scrapers/douyin_scraper.py`)

**Platform:** Douyin (抖音)

**Data extracted (4 of 7 dimensions):**
- **D1 — Search Index:** search suggestions (10), trending topics
- **D2 — Brand Voice Volume:** followers, video count, likes, verified status
- **D4 — KOL Ecosystem:** top creators from search results (10), hashtag views
- **D5 — Social Commerce:** live status (live_now/scheduled/offline), live viewers, shop product count, live frequency

**Extraction methods:**
- **Browser mode:** Playwright accessibility tree (NOT javascript injection — blocked by Douyin)
- **API mode:** httpx + RENDER_DATA JSON unpacking (SSR data embedded in page)

**Output dataclass:** `DouyinBrandData`

**Rate limiting:** 3-7 second random delays (longer than XHS due to stricter anti-bot)

**Cookie injection:** Same pattern as XHS. `DOUYIN_COOKIES` env var.

**Headless on Linux:** ✅ Yes (browser or API mode)

**Cron verdict:** **Same as XHS — needs profile_dir or cookie rotation. Cookie expiry detection NOT implemented.**

---

#### SYCM Scraper (`scrapers/sycm_scraper.py`)

**Platform:** 生意参谋 (Tmall Business Advisor — requires active Tmall seller subscription)

**Data extracted (1 dimension):**
- **D7 — Channel Authority:** Tmall rank (e.g., "女包品类 Top 15"), category share (%), monthly sales index, price band, top 5 products, traffic sources, conversion index, repeat purchase rate

**Extraction methods:**
- **Browser mode:** Playwright on `sycm.taobao.com` with authenticated session
- **Cookie mode:** httpx with session cookies — requires Tmall seller subscription

**Critical constraint:** SYCM requires an **authenticated Tmall seller account**. No public access. Heavy anti-bot (UA checks, cookie signing, encrypted request params).

**Output dataclass:** `SycmBrandData`

**Cookie injection:** `SYCM_COOKIES` env var or direct parameter. **REQUIRED** (not optional).

**Headless on Linux:** ✅ Browser mode only. Cookies expire within hours.

**Cron verdict:** **Needs: persistent authenticated browser session with periodic re-auth mechanism (browser extension or manual login script to refresh cookies). Cannot run unattended in pure API mode.**

---

### 3.3 Orchestrator (`orchestrator.py`)

**Class:** `CompetitorIntelOrchestrator`

**Key methods:**
| Method | Description |
|--------|-------------|
| `run_full_scrape()` | Loops all 20 brands, calls `_scrape_single_brand()` for each |
| `_scrape_single_brand(brand)` | Runs XHS, Douyin, SYCM scrapers (with delays between) |
| `_merge_brand_data(xhs, douyin, sycm)` | Combines 3 scrapers' output into unified 7-dim structure |
| `_assemble_output(all_brands)` | Wraps all brands with metadata (date, version, groups) |
| `save_json(output)` | Writes dated + `competitors_latest.json` to frontend |
| `push_to_github()` | Git commit + push → Vercel auto-deploy |

**Persistent browser profile mode:** Pass `--profile-dir ~/.rebase_profiles` to reuse a pre-logged Chrome profile. Headless set to `False` in this mode to appear more human-like.

**CLI:**
```bash
python -m services.competitor-intel.orchestrator --full
python -m services.competitor-intel.orchestrator --brand "CASSILE"
python -m services.competitor-intel.orchestrator --platform xhs,douyin
python -m services.competitor-intel.orchestrator --full --profile-dir ~/.rebase_profiles
python -m services.competitor-intel.orchestrator --full --dry-run
python -m services.competitor-intel.orchestrator --full --push
```

**Output JSON schema:**
```json
{
  "scrape_date": "2026-04-10",
  "scrape_version": "7dim-v1",
  "dashboard_html": "/competitor-intel.html",
  "brands_count": 20,
  "groups": {
    "D": { "name": "快时尚/International", "brands": ["小CK", "COACH", ...] },
    "C": { "name": "价值挑战者", "brands": [...] },
    "B": { "name": "新兴国货", "brands": [...] }
  },
  "brands": {
    "CASSILE": {
      "brand_name": "CASSILE",
      "group": "B",
      "scrape_date": "2026-04-10",
      "scrape_status": { "xhs": "success", "douyin": "success", "sycm": "partial" },
      "d1_brand_search_index": { "xhs_suggestions": [...], "douyin_suggestions": [...], ... },
      "d2_brand_voice_volume": { "xhs": { "followers": 45000, "notes": 230, ... }, "douyin": {...} },
      "d3_content_strategy": { "content_types": {...}, "top_notes": [...], ... },
      "d4_kol_ecosystem": { "xhs_kols": [...], "douyin_creators": [...], ... },
      "d5_social_commerce": { "live_status": "offline", "shop_product_count": 12, ... },
      "d6_consumer_mindshare": { "sentiment_keywords": [...], "positive_keywords": [...], ... },
      "d7_channel_authority": { "tmall_rank": "女包品类 Top 18", "category_share": "1.8%", ... }
    }
  }
}
```

---

### 3.4 Brand Registry (`config.py`) — 20 Brands, 3 Groups

**Group D — 快时尚/International ("The Ceiling Above You")** — 4 brands

| Brand | Notes |
|-------|-------|
| 小CK (Charles & Keith) | International fast fashion |
| COACH | American luxury accessible |
| MK (Michael Kors) | American luxury accessible |
| Kipling | Belgian casual/functional |

**Group C — 价值挑战者 ("Your Actual Fight")** — 8 brands

| Brand | Notes |
|-------|-------|
| La Festin | French-positioned, mid-market |
| Cnolés蔻一 | Chinese designer |
| ECODAY | Eco-positioning |
| VINEY | Affordable women's bags |
| FOXER | Women's bags, mid-market |
| NUCELLE | Women's bags |
| OMTO | Emerging brand |
| muva | Minimalist positioning |

**Group B — 新兴国货 ("Where You Want to Be")** — 8 brands

| Brand | Notes |
|-------|-------|
| Songmont | Premium Chinese designer, top brand |
| 古良吉吉 | High-end Chinese artisan |
| 裘真 | Chinese luxury-adjacent |
| DISSONA | Chinese premium |
| Amazing Song | Chinese designer |
| CASSILE | OMI's primary direct competitor |
| 西木汀 | Emerging Chinese brand |
| 红谷 | Established Chinese leather brand |

**Scrape priority:** CASSILE, 裘真, Songmont (direct competitors) → Group C → Group B → Group D (reference)

**Each brand config includes:** Chinese name, English name, XHS keyword, Douyin keyword, Tmall store URL, badge/positioning descriptor

---

### 3.5 BrandEquityAnalyzer (`analysis/anthropic_analyzer.py`)

**Class:** `BrandEquityAnalyzer`

**Model:** `claude-sonnet-4-20250514` (4096 max_tokens)

**Input:** Single brand's merged 7-dimension JSON

**Output:** Adds `analysis` key to brand data:
```json
{
  "d1_insight": "搜索联想词分析...",
  "d2_insight": "声量分析...",
  "d3_insight": "内容策略...",
  "d4_insight": "KOL生态...",
  "d5_insight": "社交电商...",
  "d6_insight": "消费者心智...",
  "d7_insight": "渠道权威...",
  "strategic_conclusion": "综合战略结论...",
  "threat_level": "high|medium|low",
  "opportunity_areas": ["...", "..."],
  "action_items": [
    { "dept": "电商部", "action": "...", "priority": "high|medium|low" }
  ]
}
```

**Key methods:**
| Method | Description |
|--------|-------------|
| `analyze_brand(brand_data)` | Single brand analysis |
| `analyze_all_brands(all_brands_data)` | Batch + cross-brand comparison |
| `generate_omi_action_items(all_brands_data)` | 10 OMI-specific action items per brand |
| `_cross_brand_analysis()` | Landscape summary, top threats, emerging trends |

**Cost estimate:** ~$0.01-0.03 USD per brand

---

### 3.6 Pipeline Modules

| File | Class/Function | Description |
|------|---------------|-------------|
| `storage.py` | `init_db()`, `save_snapshot()`, `export_dashboard_json()` | SQLite at `data/competitor_intel.db`; tables: brands, scrape_runs, brand_snapshots, metrics, deltas |
| `temporal.py` | `compute_deltas()`, `compute_rolling_stats()`, `detect_anomalies()` | Delta tracking between snapshots; 7/14/30-day rolling averages; anomaly detection >2σ |
| `scoring.py` | `compute_scores()` | Momentum Score (0-100), Threat Index (0-100), WTP Score (0-100) |
| `narrative.py` | `generate_narratives()` | Claude Haiku insights per brand + cross-brand summary |
| `html_generator.py` | `DashboardHtmlGenerator`, `save_html()` | Generates static `competitor-intel.html` with 7-dimension accordion UI |
| `delivery.py` | `send_wechat_brief()` | Weekly WeChat Work webhook delivery |

**Scoring formulas (scoring.py):**
- **Momentum Score:** Weighted sum of XHS follower growth (20%), Douyin follower growth (15%), content velocity (15%), engagement trend (20%), new products (15%), livestream activity (15%)
- **Threat Index:** Price overlap vs OMI (25%), closing gap to OMI (25%), channel expansion (20%), KOL investment (15%), sentiment momentum (15%)
- **WTP Score:** `threat_index * 0.82` (heuristic, reflects brand equity + pricing power)

**OMI Baseline (hardcoded in scoring.py for competitor comparison):**
```python
OMI_BASELINE = {
    "xhs_followers": 50000, "douyin_followers": 30000, "tmall_rank": 75,
    "price_range_low": 200, "price_range_high": 600,
    "xhs_kol_collab_count": 5, "douyin_mentions_count": 3,
    "avg_engagement": 1500, "xhs_likes": 80000,
}
```

---

## 4. Infrastructure Inventory

### 4.1 `vercel.json`

```json
{
  "buildCommand": "cd frontend && npm install && npm run build",
  "outputDirectory": "frontend/dist",
  "installCommand": "cd api && npm install",
  "framework": "vite",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

- Build: Vite frontend → `frontend/dist`
- Install: Node deps for `/api` serverless functions
- Rewrites: API calls → serverless functions; all other paths → SPA

### 4.2 `.env.example` — All Environment Variables

| Variable | Purpose |
|----------|---------|
| `CLOUD_REGION` | `cn-hongkong` (future: cn-guangzhou) |
| `DATABASE_URL` | PostgreSQL connection string (not yet active in Express layer) |
| `DATABASE_HOST/PORT/NAME/USER/PASSWORD` | Legacy DB config |
| `REDIS_HOST/PORT/PASSWORD` | Redis connection |
| `OSS_ENDPOINT/BUCKET/ACCESS_KEY_ID/ACCESS_KEY_SECRET` | Alibaba Cloud OSS |
| `ANTHROPIC_API_KEY` | Claude API |
| `ANTHROPIC_MODEL` | Default: `claude-opus-4-5` |
| `DEEPSEEK_API_KEY/BASE_URL/MODEL` | DeepSeek backup model |
| `QWEN_API_KEY/BASE_URL/MODEL` | Alibaba Qwen |
| `GLM_API_KEY/BASE_URL/MODEL` | Zhipu GLM (free dev tier) |
| `API_SECRET` | x-rebase-secret header shared token |
| `JWT_SECRET` | JWT signing secret |
| `ADMIN_SECRET` | Admin endpoint password |
| `DIFY_API_URL/KEY` | Intake chatbot platform |
| `NEO4J_URI/USER/PASSWORD` | Workflow graph DB |
| `RESEND_API_KEY` | Email delivery |
| `REPORT_EMAIL` | Comma-separated recipient list |
| `WECHAT_WORK_WEBHOOK` | WeChat Work bot webhook |
| `COMPETITORS` | Comma-separated brand list to monitor |
| `COMPETITOR_DATA_DIR` | Output path for scraped JSON |
| `COMPETITOR_HTML_DIR` | Output path for HTML dashboard |
| `GITHUB_REPO` | `jojosuperstar0506/rebase` |
| `GITHUB_TOKEN` | Push access for auto-deploy |
| `GIT_BRANCH` | `main` |
| `SCRAPER_PROFILE_DIR` | Persistent browser profile directory |
| `XHS_COOKIES` | XHS session cookies (alternative to profile_dir) |
| `DOUYIN_COOKIES` | Douyin session cookies |
| `SYCM_COOKIES` | 生意参谋 session cookies (required) |
| `SCRAPER_PROXY` | Optional proxy for IP rotation |
| `APP_ENV` | `development|staging|production` |
| `APP_PORT` | `8000` (FastAPI gateway) |
| `FRONTEND_URL` | Local or production frontend URL |
| `ECS_URL` | ECS backend URL for Vercel functions to forward to |

### 4.3 `Makefile`

```makefile
dev:     uvicorn gateway.main:app --reload
test:    pytest tests/
lint:    ruff check .
format:  ruff format .
up:      docker compose -f infra/docker-compose.yml up -d
down:    docker compose -f infra/docker-compose.yml down
build:   docker compose -f infra/docker-compose.yml build
```

### 4.4 `pyproject.toml`

- Name: `rebase`, Version: `0.1.0`, Python: `>=3.11`
- Runtime deps: FastAPI 0.110+, Uvicorn 0.29+, Pydantic 2.0+, Redis 5.0+, httpx 0.27+
- Dev deps: pytest 8.0+, ruff 0.4+
- Linter: ruff, line-length 100, target Python 3.11

### 4.5 `infra/docker-compose.yml`

Services:
- `api` — FastAPI gateway, port 8000, depends on redis/neo4j/milvus
- `frontend` — Vite dev server, port 5173
- `redis` — Redis 7, port 6379
- `neo4j` — Neo4j 5, ports 7474/7687, auth: neo4j/rebase_dev
- `milvus` — Vector DB, ports 19530/9091

Commented out (Phase 2): Temporal (workflow orchestration), RocketMQ (message queue)

### 4.6 Dockerfiles

**`Dockerfile.api`:** `python:3.12-slim` → install deps → `uvicorn gateway.main:app --host 0.0.0.0 --port 8000`
**`Dockerfile.frontend`:** `node:20-slim` → build Vite app → `npm run dev --host 0.0.0.0` on port 5173

---

## 5. Current Data State

| Item | Status |
|------|--------|
| `frontend/src/data/competitors/competitors_latest.json` | **SKELETON** — brand names + group structure present, but `d1`–`d7` dimension fields empty. Note: "Full 7-dimension data will be populated by scheduled scraping task every 3 days." |
| `frontend/public/data/competitors/competitors_latest.json` | Mirror of above (same skeleton state) |
| `services/competitor-intel/data/competitor_intel.db` | SQLite file exists, used for local scraping runs |
| PostgreSQL | **Not active** — env var defined but no active connection or migrations |
| `competitor-intel.html` | Static HTML dashboard — not confirmed populated |

**Frontend fallback chain in `AppDashboard.tsx`:**
1. Try `/api/v2/dashboard?industry=bag` from ECS (live data)
2. Fall back to `/data/competitors/competitors_latest.json` (static)
3. Fall back to `DEMO_DATA` hardcoded in AppDashboard.tsx

Currently the frontend is showing DEMO_DATA because `competitors_latest.json` is a skeleton and the ECS API connection may not be configured on deployed Vercel.

---

## 6. Scraper Autonomy Assessment

| Scraper | Headless on Linux | Auth Injection from DB | Cookie Expiry Detection | Rate Limiting | Cron Verdict |
|---------|------------------|----------------------|------------------------|---------------|--------------|
| **XHS** | ✅ browser or API | ✅ arch supports (env var or passed param) | ❌ Not implemented | ✅ 2-5s random | **Needs: `profile_dir` + proxy infra OR cookie rotation mechanism** |
| **Douyin** | ✅ browser or API | ✅ arch supports | ❌ Not implemented | ✅ 3-7s random | **Same as XHS** |
| **SYCM** | ✅ browser only | ✅ via `SYCM_COOKIES` (required) | ❌ Not implemented | Unknown | **Needs: persistent authenticated Tmall seller session + periodic re-auth script** |
| **Orchestrator** | ✅ | ✅ profile_dir mode | N/A | N/A | **Can run in cron if profile_dir set; blocked by scraper gaps above** |

**To make all scrapers cron-ready, the following must be built (new work for TASK-09/TASK-11):**
1. Cookie injection from database at runtime (read `platform_connections` table → inject to scraper init)
2. Cookie expiry detection (monitor HTTP 401/redirect responses, set status = 'expired')
3. User notification when cookies expire (prompt to re-authenticate)
4. Proxy rotation infrastructure (for XHS/Douyin public scraping at scale)

**Recommended cron schedule (once ready):**
```bash
# Daily landscape + watchlist scrape (2am HK time)
0 2 * * * python -m services.competitor-intel.orchestrator --full --profile-dir ~/.rebase_profiles

# Scoring + narrative (5am, after scrape)
0 5 * * * python -m services.competitor-intel.scoring && python -m services.competitor-intel.narrative

# Weekly WeChat brief (Sundays 8am)
0 8 * * 0 python -m services.competitor-intel.delivery --send
```

---

## 7. 智能体 Tab CI Features — Validation Benchmark

The existing `AppDashboard.tsx` at `/intelligence` is the OMI production CI tool. CI vFinal must eventually match or exceed these capabilities.

### 7.1 What the 智能体 Tab Delivers Today

**Route:** `/intelligence` → `AppDashboard.tsx` (protected, 656 lines)

**Views within the 智能体 CI section:**

**1. Status Banner**
- Shows data source: "Live data from backend" | "Latest scraped data" | "Demo data · Connect backend for live intelligence"
- Shows `last_updated` timestamp

**2. AI Narrative (top)**
- Displays `data.narrative` — cross-brand strategic summary from Claude
- Example: "Songmont 和 古良吉吉 持续领跑新兴国货赛道，凭借强势的小红书内容矩阵..."

**3. Competitive Landscape Bubble Chart (SVG)**
- X-axis: Threat Index (0-100)
- Y-axis: Momentum Score (0-100)
- Bubble size: WTP Score → `radius = 18 + (wtp/100)*22`
- Quadrant shading + labels: "上升势头强" | "高优先关注" | "动能下滑" | "细分威胁"
- Bubble color: 🔴 high momentum + high threat, 🔵 high momentum low threat, 🟠 low momentum high threat, ⚫ gray
- Interactive hover: brand name tooltip

**4. Brand Rankings Table (sortable)**
- Columns: Brand Name, Momentum Score, Threat Index, WTP Score
- Click header to toggle asc/desc sort
- Up to 3 `trend_signals` tags per row (e.g., "直播销量增长", "内容矩阵扩张")

**5. Action Items Section (bottom)**
- Priority badges: HIGH (red) | MEDIUM (blue) | LOW (gray)
- Title + description per item
- Department tag: [电商部], [品牌部], etc.

### 7.2 Data Structure Consumed by the Dashboard

```typescript
interface BrandScore {
  brand_name: string;
  group: "B" | "C" | "D";
  momentum_score: number;   // 0-100
  threat_index: number;     // 0-100
  wtp_score: number;        // 0-100
  trend_signals: string[];  // up to 3 tags
}

interface DashboardData {
  narrative: string;
  last_updated: string;     // ISO 8601
  brands: BrandScore[];
  action_items: Array<{
    title: string;
    description: string;
    dept: string;
    priority: "high" | "medium" | "low";
  }>;
}
```

### 7.3 What Is Hardcoded vs Dynamic

**Hardcoded:**
- `DEMO_DATA` constant in `AppDashboard.tsx` (used as fallback — always available)
- 4-quadrant chart layout, axis labels, bubble color logic

**Dynamic (from API or static JSON):**
- `narrative` text
- Per-brand scores (momentum, threat, wtp)
- `trend_signals` per brand
- `action_items` list
- `last_updated` timestamp

### 7.4 Full Pipeline → Dashboard Output

```
scraper (orchestrator.py)     → 7-dimension JSON per brand (40+ data points)
temporal.py                   → delta tracking, anomaly flags
scoring.py                    → Momentum Score, Threat Index, WTP Score (0-100 each)
narrative.py + analyzer.py    → AI insights per dimension, strategic conclusion, action items
html_generator.py             → competitor-intel.html static dashboard
delivery.py                   → WeChat Work weekly brief
push_to_github()              → Vercel auto-deploy
AppDashboard.tsx              → bubble chart + table + narrative + action items
```

### 7.5 CI vFinal — Benchmark Targets

The new CI vFinal tab must eventually deliver (matching or exceeding 智能体):

| Feature | 智能体 Today | CI vFinal Goal |
|---------|------------|---------------|
| Brands tracked | 20 (OMI-hardcoded) | User's own competitors (3-10 watchlist + 50-100 landscape) |
| Data depth | 7 dimensions per brand | Same 7 dimensions + user platform data |
| Scores | Momentum, Threat, WTP | Same + Brand Equity Index, Content Effectiveness, Trend Momentum |
| Visualizations | Bubble chart + table | Same + landscape map (all 50-100 brands), trend charts |
| AI narrative | Cross-brand summary | Per-competitor brief + OMI strategic recommendations |
| Action items | Department-tagged | Same + alert feed for significant changes |
| Data freshness | Manual / scheduled | Tiered: weekly landscape, daily watchlist, on-demand deep dive |
| User control | None (OMI-fixed) | Full competitor management (add/remove, paste links, AI suggestions) |

---

## 8. Patterns to Follow

### 8.1 Adding a New Page

**Step-by-step:**
1. Create `frontend/src/pages/NewPage.tsx`:
   ```typescript
   import { useApp } from "../context/AppContext";
   import { t, T } from "../i18n";
   
   export default function NewPage() {
     const { colors: C, lang } = useApp();
     return (
       <div style={{ background: C.bg, color: C.tx, minHeight: "100vh" }}>
         <h1>{t(T.newPage.title, lang)}</h1>
       </div>
     );
   }
   ```

2. Add route in `frontend/src/App.tsx`:
   ```typescript
   import NewPage from "./pages/NewPage";
   // Inside <Routes>:
   <Route path="/new-path" element={<ProtectedRoute><NewPage /></ProtectedRoute>} />
   ```

3. Add nav link in `App.tsx` header (inside `{isLoggedIn && ...}` block):
   ```typescript
   <a href="/new-path" style={{ color: C.tx }}>{t(T.nav.newPage, lang)}</a>
   ```

4. Add translations to `frontend/src/i18n/index.ts`:
   ```typescript
   export const T = {
     // ... existing ...
     nav: {
       // ... existing nav keys ...
       newPage: { en: "New Page", zh: "新页面" },
     },
     newPage: {
       title: { en: "New Page Title", zh: "新页面标题" },
       // ... more keys
     },
   };
   ```

### 8.2 Adding a New Express API Endpoint

1. Add handler in `/backend/server.js` (before catch-all):
   ```javascript
   app.post('/api/new-endpoint', requireSecret(), async (req, res) => {
     const { param } = req.body;
     // ... logic
     res.json({ success: true });
   });
   ```

2. If it should be public (no auth), add to whitelist in `requireSecret()`:
   ```javascript
   const PUBLIC_PATHS = ['/api/onboarding', '/api/auth/verify-code', '/api/new-public-endpoint'];
   ```

3. Add Vercel serverless function at `/api/new-endpoint.js`:
   ```javascript
   export default async function handler(req, res) {
     const response = await fetch(`${process.env.ECS_URL}/api/new-endpoint`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json', 'x-rebase-secret': process.env.API_SECRET },
       body: JSON.stringify(req.body),
     });
     const data = await response.json();
     res.status(response.status).json(data);
   }
   ```

### 8.3 Naming Conventions

| Category | Convention | Example |
|----------|-----------|---------|
| Page files | PascalCase `.tsx` | `AppDashboard.tsx` |
| Component files | PascalCase `.tsx` | `ProtectedRoute.tsx` |
| Component subdirs | feature-name (lowercase) | `components/workflow/` |
| CSS | Inline styles only, use `C.*` | `style={{ color: C.tx }}` |
| i18n keys | `T.pageName.keyName` (camelCase) | `T.home.heroTitle1` |
| API routes | `/api/kebab-case` | `/api/competitor-report/run` |
| Hook files | `use` prefix, camelCase | `useAnimatedCounter.ts` |

### 8.4 Reusable Chart / Visualization Code

All visualization code is inline in page files (no separate chart components yet). For CI vFinal:

| What to Reuse | Where | What It Does |
|---------------|-------|-------------|
| Bubble chart SVG | `AppDashboard.tsx` ~lines 200-350 | Plots brands on 2-axis scatter, quadrant shading, hover tooltips |
| Counter animation | `DiagnosticDashboard.tsx` — `useAnimatedCounter` | Smooth number increment with easing |
| Org chart layout | `DiagnosticDashboard.tsx` — SVG grid | Box layout with connection lines |
| Node graph render | `GraphView.tsx` | SVG node-edge graph, bezier curves, bottleneck animation |

**For the landscape scatter plot (CI vFinal TASK-14):** Copy the bubble chart SVG pattern from `AppDashboard.tsx` and adapt axes (X = avg_price, Y = sales_volume, size = follower_count).

---

## Appendix: Key File Index

| File | Lines | Description |
|------|-------|-------------|
| `frontend/src/App.tsx` | — | All route definitions |
| `frontend/src/context/AppContext.tsx` | — | `useApp()` hook + theme/lang state |
| `frontend/src/theme/colors.ts` | — | `ColorSet` interface + DARK/LIGHT presets |
| `frontend/src/i18n/index.ts` | 167 | `T` translation object + `t()` helper |
| `frontend/src/utils/jwt.ts` | — | `isTokenValid()`, `decodeJwtPayload()` |
| `frontend/src/components/ProtectedRoute.tsx` | 10 | Auth guard |
| `frontend/src/pages/AppDashboard.tsx` | 656 | 智能体 tab — CI validation benchmark |
| `frontend/src/pages/Calculator.tsx` | 1115 | AI ROI diagnostic |
| `frontend/src/pages/WorkflowScout.tsx` | 681 | Workflow discovery tool |
| `frontend/src/components/workflow/GraphView.tsx` | large | SVG graph renderer |
| `backend/server.js` | 23KB | Express app + all routes |
| `services/competitor-intel/config.py` | — | 20 brands + 3 groups |
| `services/competitor-intel/orchestrator.py` | — | Scrape coordination |
| `services/competitor-intel/scoring.py` | — | Momentum/Threat/WTP scores |
| `services/competitor-intel/analysis/anthropic_analyzer.py` | — | Claude Sonnet per-brand analysis |
| `services/competitor-intel/data/competitor_intel.db` | binary | SQLite with historical snapshots |
| `frontend/src/data/competitors/competitors_latest.json` | 61KB | Competitor data (currently skeleton) |
| `vercel.json` | — | Vercel deployment config |
| `.env.example` | — | All environment variable names |
