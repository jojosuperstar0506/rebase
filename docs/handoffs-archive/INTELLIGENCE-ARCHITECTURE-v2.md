# Intelligence Layer — Architecture, Current State & Next Steps

**Last updated:** 2026-04-16
**Authors:** William Chiang, with Claude Code assistance

---

## IMPORTANT: READ BEFORE ANY CODE CHANGES

**For Joanna's Claude session (or any new Claude session):**

1. **Read the entire latest codebase before writing any code.** Run `git pull` first. William and Joanna work in separate Claude sessions — if you write code without reading what already exists, you will create conflicts.
2. **Respect file ownership boundaries.** William owns `backend/` and `services/`. Joanna owns `frontend/`. Do not modify files outside your ownership unless coordinating.
3. **The database table `analysis_results` is the integration contract.** Both sides read/write to it. Do not change its schema without both people agreeing.
4. **All external service config must come from environment variables (`.env`).** Never hardcode URLs, API keys, or credentials. See `.env.example` for all variable names.

---

## 1. WHAT WE'RE BUILDING

**Rebase** is a competitive intelligence platform for Chinese SMBs. It has three layers:

```
┌─────────────────────────────────────────────────────────┐
│  Layer 3: UIUX — User-friendly intelligence dashboard   │  ← Joanna
│  (React on Vercel)                                      │
├─────────────────────────────────────────────────────────┤
│  Layer 2: INTELLIGENCE — AI scoring engine (12 scorers) │  ← William
│  (Python pipelines + DeepSeek API on ECS)               │
├─────────────────────────────────────────────────────────┤
│  Layer 1: DATA COLLECTION — Platform scrapers           │  ← Joanna (setup)
│  (Playwright + cookies on local machine)                │
└─────────────────────────────────────────────────────────┘
```

**The core value proposition:** Convert scattered qualitative data from XHS, Douyin, and Taobao into quantitative scores (x/100) across 12 competitive attributes, so SMB brand owners can instantly understand their positioning vs. competitors — without hours of manual research.

---

## 2. ARCHITECTURE: Unified Analysis Results Table

All intelligence attributes write to the SAME table:

```
analysis_results
├── workspace_id       ← which customer workspace
├── competitor_name    ← which brand
├── metric_type        ← THIS is the key field (see table below)
├── score              ← 0-100 normalized score
├── raw_inputs         ← JSONB with all underlying data
├── ai_narrative       ← AI-generated insight text
├── metric_version     ← "v1.0", "v1.1" etc.
├── analyzed_at        ← timestamp
```

### 12 Intelligence Attributes

| metric_type | Domain | Attribute | Status |
|---|---|---|---|
| `momentum` | Core | Follower growth, content volume | BUILT |
| `threat` | Core | Price overlap, market presence | BUILT |
| `wtp` | Core | Price premium vs category | BUILT |
| `consumer_mindshare` | Consumer | Sentiment score, themes | BUILT |
| `keywords` | Consumer | Keyword cloud, categories, trending | BUILT |
| `trending_products` | Product | Top products, new launches | BUILT |
| `design_profile` | Product | Shapes, materials, colors, aesthetic | BUILT |
| `price_positioning` | Product | Category price map, premium drivers | BUILT |
| `launch_frequency` | Product | Products/month, seasonal pattern | BUILT |
| `voice_volume` | Marketing | Growth rate, voice share, platform split | BUILT |
| `content_strategy` | Marketing | Brand vs consumer labels, perception gap | BUILT |
| `kol_strategy` | Marketing | KOL count, tier mix, campaigns | BUILT |

**All 12 scorers are coded and committed.** They are waiting on scraped data to produce real scores.

### The Contract Between William and Joanna

William's pipelines ALWAYS output:
```json
{
  "metric_type": "keywords",
  "score": 72,
  "raw_inputs": { "keyword_cloud": {...}, "categories": {...}, "trending": [...] },
  "ai_narrative": "该品牌在消费者心目中最高频的关键词是..."
}
```

Joanna's frontend ALWAYS reads:
```typescript
const result = dashboard.scores['keywords'];
// result.score → number for charts
// result.raw_inputs → structured data for detail views
// result.ai_narrative → text for insight cards
```

The table IS the contract. No syncing needed on data format.

---

## 3. CURRENT DEPLOYMENT STATE (as of 2026-04-16)

### What's Working

| Component | Location | Status |
|---|---|---|
| Backend (Node.js + Express) | ECS `8.217.242.191:3000` | Running via PM2 |
| PostgreSQL database | ECS localhost:5432 | Connected, all tables exist |
| `DATABASE_URL` | `.env` on ECS | Correct password set |
| `API_SECRET` | ECS `.env` + Vercel env | Synced (both `<API_SECRET_REDACTED>`) |
| `DEEPSEEK_API_KEY` | ECS `.env` | Set (`sk-0fe6c...`) |
| Python dependencies | ECS | `psycopg2`, `httpx` installed |
| All 12 scoring pipelines | `services/competitor_intel/pipelines/` | Code complete, committed |
| Brand name cleanup endpoint | `POST /api/ci/admin/cleanup-brand-names` | Working (0 bad names) |
| Vercel proxy → ECS | `api/ci.js` + `vercel.json` rewrite | Configured |
| Vercel env vars | `ECS_URL`, `API_SECRET`, `ANTHROPIC_API_KEY` | All set |
| Frontend intelligence page | Vercel (auto-deploy from main) | Deployed |

### What's NOT Working Yet

| Component | Blocker | Owner |
|---|---|---|
| **Scraper** | No platform cookies/profile set up | **Joanna** |
| **Real scores** | No scraped data in DB → pipelines return empty | Blocked by scraper |
| **Trend sparklines** | Need multiple days of data to show trends | Needs time after scraper runs |
| **Alert detection** | Not wired to pipeline output | William (low priority) |

### Existing Test Data in Database

```
Workspace: 0cf0e691-... (brand: "j", category: 服装)
  Competitors: CASSILE, Songmont, 古良吉吉, j

Workspace: ba09bdc1-... (brand: Nike, category: 鞋类)
  Competitors: Adidas, 安踏, 李宁
```

---

## 4. FILE OWNERSHIP (No Conflicts)

```
William owns:
  backend/
    ├── server.js              (all API endpoints — 25+ CI routes)
    ├── db.js                  (PostgreSQL connection pool)
    ├── migrate.js             (database migrations)
    └── migrations/            (4 SQL migration files)
  services/competitor_intel/
    ├── scoring_pipeline.py    (main scorer — momentum, threat, WTP)
    ├── narrative_pipeline.py  (AI cross-brand narratives)
    ├── alert_detector.py      (anomaly detection)
    ├── db_bridge.py           (Python ↔ PostgreSQL bridge)
    ├── scrape_runner.py       (scraper orchestrator)
    ├── setup_profiles.py      (browser profile setup)
    └── pipelines/
        ├── keyword_pipeline.py          (1B)
        ├── mindshare_pipeline.py        (1A)
        ├── product_ranking_pipeline.py  (2A)
        ├── design_vision_pipeline.py    (2B)
        ├── price_analysis_pipeline.py   (2C)
        ├── launch_tracker_pipeline.py   (2D)
        ├── voice_volume_pipeline.py     (3A)
        ├── content_strategy_pipeline.py (3B)
        └── kol_tracker_pipeline.py      (3C)

Joanna owns:
  frontend/src/
    ├── pages/ci/CIIntelligence.tsx     (intelligence page)
    └── components/ci/intelligence/
        ├── IntelligenceOverview.tsx     (grid of attribute cards)
        ├── AttributeCard.tsx           (generic card component)
        ├── KeywordCloud.tsx            (1B detail view)
        ├── SentimentPanel.tsx          (1A detail view)
        ├── ProductRanking.tsx          (2A detail view)
        ├── DesignAnalytics.tsx         (2B detail view)
        ├── PriceMap.tsx                (2C detail view)
        ├── LaunchTimeline.tsx          (2D detail view)
        ├── VoiceVolume.tsx             (3A detail view)
        ├── ContentLabels.tsx           (3B detail view)
        └── KOLTracker.tsx              (3C detail view)
```

---

## 5. UX: Intelligence Page Design

```
Sub-nav: 总览 | 竞品洞察 | 市场全景 | 竞品追踪 | 设置 | 帮助
              ↑ Intelligence page

┌──────────────────────────────────────────────────────────┐
│  竞品洞察 — Intelligence Overview                        │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │ AI Executive Summary                                 ││
│  │ 本周最显著变化：Songmont在小红书的声量增长15%...      ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ┌── Consumer ──┐  ┌────── Product ──────┐  ┌─Marketing─┐│
│  │ 消费心智  72 │  │ 热门商品  68        │  │ 声量  81  ││
│  │ 关键词    85 │  │ 设计分析  —         │  │ 内容  65  ││
│  │              │  │ 价格定位  74        │  │ KOL   43  ││
│  │              │  │ 新品频率  51        │  │           ││
│  └──────────────┘  └────────────────────┘  └───────────┘│
│                                                          │
│  Compare: [Brand A ▼] vs. [Brand B ▼]                   │
└──────────────────────────────────────────────────────────┘
```

**Interaction flow:**
1. Land on page → see AI executive summary + 12 attribute cards with scores
2. Click any card → expands to detail view with data visualizations + AI narrative
3. Compare mode → select two brands, see all attributes side-by-side
4. Skeleton state → cards without data show "Analysis pending" with progress indicator

---

## 6. DATA FLOW: End-to-End Pipeline

```
Joanna's machine                    ECS Server
┌──────────────┐                    ┌────────────────────────────────┐
│ Scraper      │ ──writes to DB──→ │ scraped_brand_profiles         │
│ (Playwright) │ ──writes to DB──→ │ scraped_products               │
└──────────────┘                    │                                │
                                    │ Scoring pipelines read ↑       │
                                    │ ┌────────────────────────────┐ │
                                    │ │ 12 Python scorers          │ │
                                    │ │ + DeepSeek API calls       │ │
                                    │ └──────────┬─────────────────┘ │
                                    │            ↓ writes            │
                                    │ analysis_results (scores)      │
                                    │ analysis_narratives (insights) │
                                    │                                │
                                    │ Node.js API reads ↑            │
                                    │ ┌────────────────────────────┐ │
                                    │ │ GET /api/ci/intelligence    │ │
                                    │ │ GET /api/ci/dashboard       │ │
                                    │ └──────────┬─────────────────┘ │
                                    └────────────┼──────────────────-┘
                                                 │
                                    Vercel proxy (api/ci.js)
                                                 │
                                    ┌────────────┴──────────────────┐
                                    │ Frontend React app            │
                                    │ Intelligence page shows scores│
                                    └───────────────────────────────┘
```

### What the Scraper Writes (db_bridge.py functions)

**`save_brand_profile(platform, brand_name, data)`** → `scraped_brand_profiles` table:
- `follower_count`, `total_products`, `avg_price`
- `engagement_metrics` (JSONB): total_likes, total_notes
- `content_metrics` (JSONB): content_types

**`save_products(platform, brand_name, products)`** → `scraped_products` table:
- `product_id`, `product_name`, `price`, `original_price`
- `sales_volume`, `review_count`, `rating`
- `category`, `material_tags`, `image_urls`, `product_url`

### What the Pipelines Read

Each pipeline calls `get_conn()` from `db_bridge.py` and queries these tables. Example flow:
1. `keyword_pipeline.py` reads `scraped_brand_profiles.content_metrics` → extracts keywords → scores → writes to `analysis_results` with `metric_type='keywords'`
2. `price_analysis_pipeline.py` reads `scraped_products.price` → computes price bands → scores → writes to `analysis_results` with `metric_type='price_positioning'`

---

## 7. COST STRUCTURE

| Tier | Brands | Daily Cost | Monthly Cost | What's Included |
|---|---|---|---|---|
| **Core** | 10 | ~¥1/day | ~¥30/month | Keywords, voice volume, product ranking, AI narrative |
| **Deep** | 10 | ~¥3/day | ~¥90/month | + Sentiment, price, content labels, KOL tracking |
| **Full** | 10 | ~¥5/day | ~¥150/month | + Design vision (monthly), launch frequency |

**Cost principles:**
1. Deterministic first, AI second — if computable with math, don't use an LLM
2. Cache AI outputs — skip if underlying data hasn't changed
3. DeepSeek for classification, Sonnet only for vision — DeepSeek is 10x cheaper
4. Batch, don't stream — process all brands in one pipeline run
5. User-controlled refresh for expensive analyses

---

## 8. JOANNA'S TO-DO: SCRAPER SETUP

> **Claude instruction:** This section contains Joanna's complete to-do list. Read every step carefully. Do NOT skip steps or reorder them — they have dependencies. Do NOT modify any files under `backend/` or `services/` — those are William's. Before writing ANY code, run `git pull` and read the existing codebase first.

This is the **only remaining blocker** before the product can be tested end-to-end. Everything else (backend, database, API, frontend, Vercel deployment) is complete and working.

### Joanna's Access Credentials

You have two sets of credentials. Keep them safe and do not commit them anywhere.

**A. SSH access to ECS server (needed for the scraper workflow)**

SSH lets your computer talk to our server in Hong Kong. Think of it as a secure remote connection. You'll need this to let your scraper write data to our database.

```
Server:   8.217.242.191
Username: joanna
Password: JoannaRebase2026
```

**How to test SSH access (do this first to make sure it works):**

1. Open **Terminal** on your Mac (search "Terminal" in Spotlight, or find it in Applications → Utilities)
2. Copy and paste this exact command:
   ```bash
   ssh joanna@8.217.242.191
   ```
3. If this is your first time connecting, you'll see a message like:
   ```
   The authenticity of host '8.217.242.191' can't be established.
   Are you sure you want to continue connecting (yes/no/[fingerprint])?
   ```
   **Type `yes` and press Enter.** This is normal for first-time connections.
4. It will ask for your password:
   ```
   joanna@8.217.242.191's password:
   ```
   Type `JoannaRebase2026` and press Enter. **The password won't show as you type — no dots, no stars, nothing. This is normal.** Just type it and press Enter.
5. If successful, you'll see something like:
   ```
   [joanna@iZj6c90td47u2dknvpts1bZ ~]$
   ```
   This means you're now logged into the server. 
6. Type `exit` and press Enter to disconnect. You're done testing.

**Common issues:**
- "Connection refused" or "Connection timed out" → Check your internet connection. If on a corporate/university network, SSH might be blocked — try from home WiFi or mobile hotspot.
- "Permission denied" → Double-check the password. It's case-sensitive: `JoannaRebase2026` (capital J, capital R, capital A).
- Password looks like it's not typing → That's normal. The terminal hides password input for security. Just type it and press Enter.

**B. Alibaba Cloud console (optional — for viewing server status)**

This is the web dashboard for managing our cloud infrastructure. You don't need this for the scraper setup, but it's here if you ever need to check server status or logs.

```
Sign-in URL:  https://signin.alibabacloud.com
Account ID:   5071674200231983
Username:     joannazhang
Password:     [same password you used before — contact William if forgotten]
```

How to use:
1. Go to https://signin.alibabacloud.com
2. Select **"RAM User"** login (NOT "Alibaba Cloud Account" — that's William's admin login)
3. Enter the full username: `joannazhang@5071674200231983.onaliyun.com`
4. Enter your password
5. Complete MFA if prompted (you may need your phone's authenticator app)
6. Once logged in: search "ECS" in the top search bar → click the instance to see server status

> **For everything below, you only need SSH access (A).** The Alibaba Cloud console (B) is optional.

---

### Summary of Joanna's Tasks

| # | Task | Time | Requires |
|---|---|---|---|
| 1 | Pull latest code | 1 min | Git |
| 2 | Install Python dependencies | 5 min | Python 3.8+ |
| 3 | Set up browser profiles (XHS, Douyin login) | 10 min | XHS + Douyin mobile apps |
| 4 | Configure `.env` on your machine | 5 min | Text editor |
| 5 | Start SSH tunnel to ECS database | 1 min | SSH access |
| 6 | Test database connectivity | 2 min | Step 5 running |
| 7 | Run a test scrape (single brand) | 5 min | Steps 3-6 complete |
| 8 | Run full scrape (all competitors) | 15 min | Step 7 succeeds |
| 9 | Trigger scoring pipeline | 2 min | Step 8 complete |
| 10 | Test the frontend end-to-end | 15 min | Step 9 complete |

**No dependency on William.** All steps can be completed independently using the SSH tunnel approach below.

### Step 1: Pull Latest Code

```bash
cd "Will & Joanna's SMB idea"
git pull origin main
```

Confirm you see the latest commit: `db921e6 merge: resolve conflict in brand name guard`

### Step 2: Install Python Dependencies

```bash
pip install -r services/competitor-intel/requirements.txt
pip install psycopg2-binary
playwright install chromium
```

Verify installation:

```bash
python3 -c "import psycopg2; import httpx; from playwright.sync_api import sync_playwright; print('All dependencies OK')"
```

**Expected output:** `All dependencies OK`

If any import fails, install the missing package individually:
- `pip install psycopg2-binary` (PostgreSQL driver)
- `pip install httpx` (HTTP client)
- `pip install playwright && playwright install chromium` (browser automation)

### Step 3: Set Up Browser Profiles (Manual Login Required)

This opens a Chrome window for each platform. You log in manually, and the session is saved so scraping can reuse your login without re-authenticating.

```bash
python -m services.competitor-intel.setup_profiles
```

The script will walk you through three platforms:

**Platform 1: 小红书 (XHS / RedNote)**
1. A Chrome window opens to xiaohongshu.com
2. Click the login button in the top-right corner
3. Scan the QR code with your **XHS mobile app**
4. Wait until the page reloads and shows your profile
5. Go back to the terminal and press Enter

**Platform 2: 抖音 (Douyin)**
1. A Chrome window opens to douyin.com
2. Click '登录' (Login) in the top-right corner
3. Scan the QR code with your **Douyin mobile app**
4. Wait until the page reloads and shows your profile
5. Go back to the terminal and press Enter

**Platform 3: 生意参谋 (SYCM)** — Skip if you don't have a Taobao seller account.

After completion, note the profile directory path. Default is `~/rebase-scraper-profile`.

To set up only one platform (e.g., if XHS session expires later):
```bash
python -m services.competitor-intel.setup_profiles --platform xhs
```

### Step 4: Configure `.env` on Your Machine

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Open `.env` in a text editor and set these values (**replace the placeholder values only**):

```env
# Database — use localhost because the SSH tunnel (Step 5) maps it to ECS
# Get the password from William; do NOT paste real values here.
DATABASE_URL=postgresql://rebase_app:<DB_PASSWORD>@localhost:5432/rebase

# Scraper profile directory (from Step 3 — adjust path for your machine)
# Mac example:
SCRAPER_PROFILE_DIR=/Users/joanna/rebase-scraper-profile
# Windows example:
# SCRAPER_PROFILE_DIR=C:/rebase-scraper-profile

# API secret — must match ECS and Vercel. Get from William.
API_SECRET=<API_SECRET_FROM_WILLIAM>

# DeepSeek — needed if you run scoring locally (otherwise only ECS needs it)
DEEPSEEK_API_KEY=<DEEPSEEK_KEY_FROM_WILLIAM>
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

> **🔒 NOTE (added 2026-05-24 after secret-leak incident):** the original
> version of this doc had real secret values written inline. They were
> rotated when the leak was discovered. Never commit live secret values
> to docs — use placeholders like `<DEEPSEEK_KEY_FROM_WILLIAM>` and pass
> the real values via WeChat/Slack/encrypted note instead.

**Important:** The `DATABASE_URL` uses `localhost:5432` — this works because the SSH tunnel in Step 5 forwards your local port 5432 to the ECS database. Do NOT change this to the ECS IP directly.

**Do NOT commit `.env` to git.** It contains secrets and is already in `.gitignore`.

### Step 5: Start SSH Tunnel to ECS Database

The ECS database port (5432) is not publicly exposed for security. Instead, you connect through an SSH tunnel. This is secure and **does not require William to do anything**.

**Open a NEW terminal window** (keep it open the entire time you're working) and run:

```bash
ssh -L 5432:localhost:5432 joanna@8.217.242.191 -N
```

This command:
- Forwards your local port 5432 → ECS port 5432 through an encrypted SSH tunnel
- The `-N` flag means "don't open a shell, just forward the port"
- **Keep this terminal window open.** If you close it, the tunnel closes and DB access stops.

**If you get "port already in use"** (e.g., you have local PostgreSQL running):
```bash
ssh -L 15432:localhost:5432 joanna@8.217.242.191 -N
```
Then update your `.env` to use port 15432:
```env
DATABASE_URL=postgresql://rebase_app:<DB_PASSWORD>@localhost:15432/rebase
```

**If SSH fails with "permission denied":**
- Double-check the password William gave you
- If still failing, contact William to reset: `passwd joanna` on ECS

### Step 6: Test Database Connectivity

In a **different terminal** from the SSH tunnel, run:

```bash
python3 -c "
import psycopg2
conn = psycopg2.connect('postgresql://rebase_app:<DB_PASSWORD>@localhost:5432/rebase')
cur = conn.cursor()
cur.execute('SELECT COUNT(*) FROM workspace_competitors')
print(f'Connected! {cur.fetchone()[0]} competitors in database.')
conn.close()
"
```

**Expected output:** `Connected! 7 competitors in database.`

**If this fails with "connection refused":**
- The SSH tunnel is not running. Go back to Step 5 and make sure the tunnel terminal is still open.

**If this fails with "password authentication failed":**
- The database password may have changed. Ask William.

### Step 7: Run a Test Scrape (Single Brand)

Start with one brand on one platform to verify the full scraping pipeline:

```bash
python -m services.competitor-intel.scrape_runner --platform xhs --brand "Songmont"
```

**Expected output (success):**
```
[SCRAPE] xhs / Songmont (keyword: Songmont, tier: watchlist)
[DB] Saved brand profile: xhs / Songmont
[DB] Saved 20 products: xhs / Songmont
```

**If it fails with "cookies expired" or "login required":**
- Re-run `python -m services.competitor-intel.setup_profiles --platform xhs`

**If it fails with "connection refused" on the database:**
- The SSH tunnel may have closed. Check the tunnel terminal (Step 5) and restart if needed.

### Step 8: Run Full Scrape (All Competitors)

Once the single-brand test succeeds, scrape all competitors for both platforms:

```bash
# XHS scrape (all watchlist brands)
python -m services.competitor-intel.scrape_runner --platform xhs --tier watchlist

# Douyin scrape (all watchlist brands)
python -m services.competitor-intel.scrape_runner --platform douyin --tier watchlist
```

This will scrape all brands in the database: CASSILE, Songmont, 古良吉吉, j, Adidas, 安踏, 李宁.

**Verify data was written:**

```bash
python3 -c "
import psycopg2
conn = psycopg2.connect('postgresql://rebase_app:<DB_PASSWORD>@localhost:5432/rebase')
cur = conn.cursor()
cur.execute('SELECT platform, brand_name, scraped_at FROM scraped_brand_profiles ORDER BY scraped_at DESC LIMIT 10')
for row in cur.fetchall():
    print(f'{row[0]:8s} | {row[1]:15s} | {row[2]}')
conn.close()
"
```

**Expected:** A list of rows showing each brand scraped with a recent timestamp.

### Step 9: Trigger Scoring Pipeline

Now that scraped data exists, trigger the AI scoring engine. You can do this two ways:

**Option A: From the frontend** (easiest)
1. Open the Vercel deployment URL in your browser
2. Navigate to CI → Settings
3. Click "Run Analysis"

**Option B: Via command line** (if frontend isn't accessible)
```bash
curl -X POST -H "Content-Type: application/json" \
  -H "x-rebase-secret: <API_SECRET_REDACTED>" \
  -d '{"workspace_id":"0cf0e691-89f4-46f5-8c6f-ad227339e600"}' \
  "http://8.217.242.191:3000/api/ci/run-analysis"
```

**Expected:** `{"job_id":"...","status":"queued","total_brands":4,...}`

Wait 30-60 seconds for the pipelines to finish, then check status:

```bash
curl -H "x-rebase-secret: <API_SECRET_REDACTED>" \
  "http://8.217.242.191:3000/api/ci/analysis/status?workspace_id=0cf0e691-89f4-46f5-8c6f-ad227339e600"
```

**Expected:** `{"status":"complete","completed_brands":4,...}`

### Step 10: Test the Frontend End-to-End

Follow the full testing plan in **Section 9** below. The key things to verify:

1. Open the Vercel deployment URL
2. Navigate to **竞品洞察** (Intelligence) page
3. Confirm: attribute cards show real scores (not "Analysis pending")
4. Click cards to see detail views with data
5. Try brand comparison

**Send William a message once testing is complete** with:
- Which tests passed / failed
- Any error messages you encountered
- Screenshots of the Intelligence page with real data

### Known Scraper Limitations (for future improvement)

1. **Currently only scrapes brand homepages** — misses individual product posts across the platform. Future: expand to keyword-based search scraping.
2. **Only scrapes titles, not full note content** — limits keyword analysis depth. Future: scrape full post body text.
3. **Cookies expire every 7-14 days** — must re-run `setup_profiles --platform <name>` when auth fails. Future: auto-detect expiry and notify.
4. **No proxy rotation** — high scrape volumes may trigger rate limiting. Keep to <50 brands for now.

---

## 9. TESTING PLAN

### Prerequisites Checklist

Before testing, confirm ALL of these are true. If any item is unchecked, go back and complete it first.

- [ ] `git pull` on your local machine — latest code (Section 8, Step 1)
- [ ] Python dependencies installed — `psycopg2`, `httpx`, `playwright` (Section 8, Step 2)
- [ ] Browser profiles set up — XHS and Douyin logged in (Section 8, Step 3)
- [ ] `.env` configured on your machine with `DATABASE_URL`, `SCRAPER_PROFILE_DIR`, `API_SECRET` (Section 8, Step 4)
- [ ] SSH tunnel running in a separate terminal (Section 8, Step 5)
- [ ] Database connectivity confirmed — Step 6 prints "Connected!" (Section 8, Step 6)
- [ ] Scraper has run at least once — `scraped_brand_profiles` table has data (Section 8, Steps 7-8)
- [ ] Scoring pipeline triggered — `analysis_results` table has scores (Section 8, Step 9)
- [ ] ECS backend is running — `pm2 status` shows `online` on ECS
- [ ] Vercel is deployed with latest code

### Test 1: Database Connectivity (from ECS)

```bash
# SSH into ECS
curl -H "x-rebase-secret: $API_SECRET" "http://localhost:3000/health"
```

**Expected:** `{"status":"ok","db":"connected",...}`

### Test 2: API Secret Authentication

```bash
curl -H "x-rebase-secret: WRONG_SECRET" "http://localhost:3000/api/ci/dashboard?workspace_id=0cf0e691-89f4-46f5-8c6f-ad227339e600"
```

**Expected:** `401 Unauthorized` or `403 Forbidden`

```bash
curl -H "x-rebase-secret: $API_SECRET" "http://localhost:3000/api/ci/dashboard?workspace_id=0cf0e691-89f4-46f5-8c6f-ad227339e600"
```

**Expected:** JSON with dashboard data (scores may be empty if pipelines haven't run yet)

### Test 3: Scoring Pipeline Execution

```bash
# Trigger analysis
curl -X POST -H "Content-Type: application/json" \
  -H "x-rebase-secret: $API_SECRET" \
  -d '{"workspace_id":"0cf0e691-89f4-46f5-8c6f-ad227339e600"}' \
  "http://localhost:3000/api/ci/run-analysis"
```

**Expected:** `{"job_id":"...","status":"queued","total_brands":4,...}`

Wait 30 seconds, then check:

```bash
curl -H "x-rebase-secret: $API_SECRET" \
  "http://localhost:3000/api/ci/analysis/status?workspace_id=0cf0e691-89f4-46f5-8c6f-ad227339e600"
```

**Expected:** `{"status":"complete","completed_brands":4,...}`

### Test 4: Verify Scores in Database

```bash
psql -U rebase_app -d rebase -c "
  SELECT metric_type, competitor_name, score, analyzed_at 
  FROM analysis_results 
  WHERE workspace_id='0cf0e691-89f4-46f5-8c6f-ad227339e600' 
  ORDER BY analyzed_at DESC LIMIT 20;
"
```

**Expected:** Rows with scores (0-100) for each competitor × metric_type combination

### Test 5: Intelligence API Endpoint

```bash
curl -H "x-rebase-secret: $API_SECRET" \
  "http://localhost:3000/api/ci/intelligence?workspace_id=0cf0e691-89f4-46f5-8c6f-ad227339e600"
```

**Expected:** JSON with all 12 metric_types, scores, raw_inputs, and ai_narratives

### Test 6: Frontend End-to-End (in browser)

1. Open the Vercel deployment URL in your browser
2. Navigate to the CI section
3. Select/create a workspace (if needed)
4. Go to **竞品洞察** (Intelligence) page
5. **Verify:**
   - [ ] AI Executive Summary appears at the top
   - [ ] 12 attribute cards are visible, grouped by Consumer/Product/Marketing
   - [ ] Cards with data show scores (0-100) and sparklines
   - [ ] Cards without data show "Analysis pending" skeleton
   - [ ] Clicking a card expands to detail view with data visualization
   - [ ] Brand comparison dropdown works
6. Go to **Dashboard** (总览) page
7. **Verify:**
   - [ ] Bubble chart shows competitor positioning
   - [ ] Scores are populated (not all zeros)
   - [ ] "Run Analysis" button in Settings triggers a new scoring run

### Test 7: Vercel → ECS Proxy

Open browser DevTools (Network tab) while on the Intelligence page:
- API calls should go to `/api/ci/intelligence?workspace_id=...`
- Response should be 200 with JSON data
- If 502: Vercel can't reach ECS (check `ECS_URL` in Vercel env vars)
- If 401/403: API_SECRET mismatch between Vercel and ECS

### Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| "Backend unreachable" | ECS_URL wrong in Vercel | Check Vercel env vars |
| 502 Bad Gateway | ECS server down | SSH to ECS, run `pm2 restart rebase-backend` |
| All scores are 0 or empty | No scraped data | Run scraper first (Section 8) |
| "password authentication failed" | DB password mismatch | Run `ALTER USER rebase_app WITH PASSWORD '<DB_PASSWORD>';` on ECS |
| Pipeline spawned but no results | Python import errors | Check `pm2 logs --lines 50` on ECS |
| Cookies expired | Platform auth expired | Re-run `setup_profiles --platform xhs` |

---

## 10. INDUSTRY AGNOSTICISM (Future)

The system is designed to work beyond handbags:
- `workspace.brand_category` drives all AI prompts dynamically
- Brand registry can expand per category
- Design taxonomy is parameterized (bag-specific → configurable per industry)
- For beta: focused on bags (服装/女包). Other categories work but won't have pre-populated brand suggestions.

---

## 11. FUTURE IMPROVEMENTS (Backlog)

| Item | Priority | Owner | Notes |
|---|---|---|---|
| Expand scraper to full post content (not just titles) | High | Joanna | Improves keyword + sentiment quality |
| Scrape product-level posts beyond brand homepage | High | Joanna | Captures broader market signal |
| Wire alert detection to pipeline output | Medium | William | Detect >15% score changes |
| Trend data seeding for sparklines | Medium | William | Needs multiple days of data |
| Email digest (daily/weekly summary) | Medium | William | Resend API already configured |
| Auto-detect cookie expiry + notify | Low | William | Avoid silent scrape failures |
| WebSocket for real-time pipeline progress | Low | William | Replace polling with push |
| Design vision (Sonnet image analysis) | Low | William | Expensive — monthly only |
| Cross-brand comparison view polish | Low | Joanna | Side-by-side for all 12 attributes |
