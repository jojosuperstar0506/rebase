# OMI Competitive Intelligence — System Specification

**As-built documentation. Describes what exists today, not what should exist.**

Last reviewed: 2026-03-28

---

## 1. Architecture Overview

The system has four components that run independently and are connected only by the filesystem (JSON files and a static HTML dashboard):

```
┌─────────────────────────────────────────────────────────────┐
│  Orchestrator  (services/competitor-intel/orchestrator.py)   │
│  CLI entry point. Iterates brands × platforms, calls        │
│  scrapers, merges results into unified 7-dimension JSON.    │
└─────────┬───────────────┬───────────────┬───────────────────┘
          │               │               │
          ▼               ▼               ▼
   ┌────────────┐  ┌─────────────┐  ┌────────────┐
   │ XHS Scraper│  │Douyin Scraper│  │SYCM Scraper│
   │ D1,D2,D3,  │  │ D1,D2,D4,D5 │  │    D7      │
   │ D4,D6      │  │             │  │            │
   └────────────┘  └─────────────┘  └────────────┘
          │               │               │
          └───────┬───────┘───────┬───────┘
                  ▼               │
   ┌──────────────────────┐      │
   │  competitors_latest  │◄─────┘
   │  .json               │
   └──────────┬───────────┘
              │
      ┌───────┴────────┐
      ▼                ▼
┌───────────┐  ┌──────────────────┐
│  Anthropic │  │  HTML Generator   │
│  Analyzer  │  │  (html_generator  │
│  (optional)│  │   .py)            │
└─────┬─────┘  └────────┬─────────┘
      │                  │
      ▼                  ▼
  Enriches JSON    competitor-intel.html
  with `analysis`  (static file served
  key per brand    by Vercel)
```

**Data flow end-to-end:**

1. Orchestrator iterates 20 brands in priority order, calling each scraper per-platform.
2. Each scraper returns a typed dataclass (`XhsBrandData`, `DouyinBrandData`, `SycmBrandData`).
3. Orchestrator merges the three dataclasses into one dict per brand via `_merge_brand_data()`.
4. All brand dicts are assembled into a single JSON blob (`_assemble_output()`).
5. JSON is written to `competitors_YYYY-MM-DD.json` + `competitors_latest.json`.
6. (Optional) `BrandEquityAnalyzer` reads the JSON, calls Claude per-brand, writes insights back into the JSON under an `analysis` key.
7. (Optional) `DashboardHtmlGenerator` reads the enriched JSON and regenerates `competitor-intel.html`.
8. (Optional) Orchestrator commits and pushes JSON to GitHub, triggering Vercel redeploy.

**What actually runs today:** None of the above runs automatically. The `competitor-intel.html` currently served on Vercel is a hand-authored 4,949-line static HTML file with all data hardcoded inline. The scrapers, analyzer, and HTML generator exist as code but have not been executed in production. The JSON scaffold (`competitors_latest.json`) contains only group/brand names and a note saying data will be populated later.

---

## 2. Data Sources

### 2.1 XHS (小红书) — `xhs_scraper.py`

**What it targets:**
- Search results page: `xiaohongshu.com/search_result?keyword={keyword}&type=51`
- User profile page: `xiaohongshu.com/user/profile/{user_id}`
- UGC review search: same search URL with " 测评" appended to keyword

**How:**
- **Browser mode:** Playwright page automation. Navigates URLs, waits for networkidle + 3s extra, reads accessibility tree snapshot (`page.accessibility.snapshot()`), flattens it to text, then regex-parses. This is the documented "most reliable" approach because XHS aggressively blocks bots.
- **API mode:** httpx GET to the same web URLs (not API endpoints). Parses `window.__INITIAL_STATE__` embedded JSON from the HTML response. Falls back to regex on raw HTML.

**Auth:** Cookie string passed as `Cookie` header. No cookie signing, rotation, or refresh logic.

**Rate limiting:**
- Browser mode: `time.sleep(2)` (blocking, not async) between page navigations.
- API mode: `asyncio.sleep(2 + (time.time() % 3))` — produces 2-5 second delays.

**Proxy:** Optional single proxy URL (`https://` only) passed to httpx. No rotation.

### 2.2 Douyin (抖音) — `douyin_scraper.py`

**What it targets:**
- User search: `douyin.com/search/{keyword}?type=user`
- User profile: `douyin.com/user/{user_id}`
- Video search (for KOL data): `douyin.com/search/{keyword}?type=video`

**How:**
- **Browser mode:** Same Playwright accessibility tree approach as XHS. Explicitly notes that `javascript_tool` execution is blocked by Douyin.
- **API mode:** httpx GET to web URLs. Parses Douyin's `<script id="RENDER_DATA">` tag (URL-encoded JSON) for user search and profile data. Falls back to regex for video search.

**Auth:** Cookie string, same pattern as XHS.

**Rate limiting:**
- Browser: `time.sleep(3)` (blocking).
- API: `asyncio.sleep(3 + (time.time() % 4))` — 3-7 second delays.

### 2.3 SYCM / 生意参谋 — `sycm_scraper.py`

**What it targets:**
- Brand ranking: `sycm.taobao.com/custom/ranking/brand?brandName={name}`
- Product ranking: `sycm.taobao.com/custom/ranking/item?searchText={store}`
- Market overview (endpoint defined but not called): `/custom/market/overview`
- Traffic source (endpoint defined but not called): `/custom/market/traffic`

**How:**
- **Browser mode:** Playwright navigation to SYCM URLs. Checks login state by looking for "登录" in accessibility tree. Then regex-parses the flattened tree for ranking numbers, market share percentages, sales indices, price bands.
- **Cookie mode:** httpx GET with session cookies. Same regex parsing on HTML responses.

**Auth:** Requires active Tmall seller account with 生意参谋 subscription. Cookies expire quickly. No refresh mechanism exists.

**Rate limiting:** `page.wait_for_timeout(2000-3000)` between navigations (browser mode only). No explicit delay in API mode.

### 2.4 What's NOT a data source

- The static HTML dashboard has all data hardcoded. It does **not** read from `competitors_latest.json` or any API. There is no `fetch()` call in the HTML.
- Baidu Index URL is defined in `config.py` (`BAIDU_INDEX_URL`) but no scraper uses it.
- The scorecard tab ("OMI记分卡") and products tab ("热卖商品") in the HTML dashboard contain manually written data, not scraped data.

---

## 3. Data Model

### 3.1 Brand Registry (`config.py`)

Each brand is a dict:

```python
{
    "name": "小CK",              # Chinese display name (primary key)
    "name_en": "Charles & Keith", # English name
    "xhs_keyword": "小CK",       # XHS search term
    "douyin_keyword": "小CK",    # Douyin search term
    "tmall_store": "charleskeith", # Tmall store identifier
    "badge": "东南亚快时尚标杆",   # One-line positioning label
}
```

20 brands in 3 groups:
- **Group D** (4 brands): 快时尚/International — "The Ceiling Above You"
- **Group C** (8 brands): 价值挑战者 — "Your Actual Fight"
- **Group B** (8 brands): 新兴国货 — "Where You Want to Be"

Groups are strategic tiers, not quality tiers. D = aspirational reference, C = direct competitors, B = where OMI wants to be.

### 3.2 Per-Scraper Dataclasses

**`XhsBrandData`** — covers D1, D2, D3, D4, D6:
```
brand_name, scrape_date, scrape_status
D1: d1_search_suggestions: List[str], d1_search_volume_rank: str, d1_related_searches: List[str]
D2: d2_official_followers: int, d2_total_notes: int, d2_total_likes: int, d2_official_account_id: str, d2_official_account_name: str
D3: d3_content_types: Dict[str, int], d3_top_notes: List[Dict], d3_posting_frequency: str, d3_avg_engagement: str
D4: d4_top_kols: List[Dict[str, str]], d4_collab_count: int, d4_celebrity_mentions: List[str]
D6: d6_sentiment_keywords: List[str], d6_positive_keywords: List[str], d6_negative_keywords: List[str], d6_ugc_sample_notes: List[Dict]
```

**`DouyinBrandData`** — covers D1, D2, D4, D5:
```
brand_name, scrape_date, scrape_status
D1: d1_search_suggestions: List[str], d1_trending_topics: List[str]
D2: d2_official_followers: int, d2_total_videos: int, d2_total_likes: int, d2_official_account_id: str, d2_official_account_name: str, d2_verified: bool
D4: d4_top_creators: List[Dict[str, str]], d4_brand_mentions_count: int, d4_hashtag_views: Dict[str, str]
D5: d5_live_status: str, d5_live_viewers: int, d5_shop_product_count: int, d5_live_frequency: str, d5_avg_live_viewers: str, d5_top_selling_products: List[Dict]
```

**`SycmBrandData`** — covers D7:
```
brand_name, scrape_date, scrape_status
D7: d7_tmall_rank: str, d7_category_share: str, d7_monthly_sales_index: str, d7_price_band: str, d7_top_products: List[Dict], d7_traffic_sources: Dict[str, str], d7_conversion_index: str, d7_repeat_purchase_rate: str
```

### 3.3 Merged 7-Dimension JSON (per brand)

The orchestrator's `_merge_brand_data()` produces this structure per brand:

```json
{
  "brand_name": "小CK",
  "brand_name_en": "Charles & Keith",
  "group": "D",
  "group_name": "快时尚/International",
  "badge": "东南亚快时尚标杆",
  "scrape_date": "2026-03-28",
  "scrape_status": { "xhs": "success", "douyin": "partial", "sycm": "skipped" },
  "d1_brand_search_index": { "xhs_suggestions": [], "xhs_related": [], "douyin_suggestions": [], "douyin_trending": [] },
  "d2_brand_voice_volume": { "xhs": { "followers": 0, "notes": 0, "likes": 0, "account_name": "", "account_id": "" }, "douyin": { "followers": 0, "videos": 0, "likes": 0, "account_name": "", "account_id": "", "verified": false } },
  "d3_content_strategy": { "content_types": {}, "top_notes": [], "posting_frequency": "", "avg_engagement": "" },
  "d4_kol_ecosystem": { "xhs_kols": [], "xhs_collab_count": 0, "xhs_celebrity_mentions": [], "douyin_creators": [], "douyin_mentions_count": 0, "douyin_hashtag_views": {} },
  "d5_social_commerce": { "live_status": "unknown", "live_viewers": 0, "shop_product_count": 0, "live_frequency": "", "avg_live_viewers": "", "top_selling_products": [] },
  "d6_consumer_mindshare": { "sentiment_keywords": [], "positive_keywords": [], "negative_keywords": [], "ugc_samples": [] },
  "d7_channel_authority": { "tmall_rank": "", "category_share": "", "monthly_sales_index": "", "price_band": "", "top_products": [], "traffic_sources": {}, "conversion_index": "" }
}
```

### 3.4 Top-Level Output JSON

```json
{
  "scrape_date": "2026-03-28",
  "scrape_version": "7dim-v1",
  "dashboard_html": "/competitor-intel.html",
  "brands_count": 20,
  "groups": { "D": { "name": "...", "subtitle": "...", "brands": ["小CK", ...] }, ... },
  "brands": { "小CK": { /* merged per-brand object */ }, ... }
}
```

After analyzer runs, brands gain an `analysis` key, and the top-level object gains `cross_brand_analysis`.

### 3.5 Storage

- **JSON files:** Written to `COMPETITOR_DATA_DIR` (default: `frontend/src/data/competitors/`). Two files per run: dated snapshot + `competitors_latest.json` overwrite.
- **HTML dashboard:** Written to `COMPETITOR_HTML_DIR` (default: `frontend/public/`). Single file: `competitor-intel.html`.
- **No database.** Everything is flat files committed to git.

---

## 4. Analysis Logic

### 4.1 Anthropic Analyzer (`anthropic_analyzer.py`)

**What it does:**

1. **Per-brand analysis:** Sends the full merged JSON for one brand to Claude with a prompt asking for d1-d7 insights, strategic conclusion, threat level, opportunity areas, and action items. Expected response is structured JSON.
2. **Cross-brand comparison:** Sends a summary of all brands (name, group, follower counts, threat level) to Claude for landscape analysis, top threats, emerging trends, positioning advice, and market gaps.
3. **OMI action items generation:** Sends brand summaries to Claude for 10 priority action items with department assignment, priority, rationale, and timeline.

**Scoring/weighting:** None. There is no numeric scoring, no weighting model, no threshold logic. All analysis is free-form LLM output. The prompt asks for `threat_level: "high/medium/low"` but this is a string field parsed from Claude's response, not computed.

**Response parsing:** `_safe_json_parse()` tries four strategies in order:
1. Direct `json.loads()`
2. Regex extraction of ```json``` code block
3. Find first `{` to last `}`
4. Find first `[` to last `]`
Falls back to `{"raw_text": response}` if all fail.

**API usage:**
- Uses `anthropic` Python SDK (sync `client.messages.create()` called inside async functions — not truly async).
- Default model: `claude-sonnet-4-20250514` (from env var `ANTHROPIC_MODEL`).
- `max_tokens`: 4096 for per-brand and action items, 2048 for cross-brand.
- No retry logic. No rate limiting. No token budget tracking.

### 4.2 Content Classification (XHS scraper)

The XHS scraper has a hardcoded content type classifier in `_classify_content_types()`:

```python
{
    "穿搭OOTD": ["穿搭", "ootd", "搭配", "outfit"],
    "测评对比": ["测评", "对比", "评测", "review", "pk"],
    "开箱": ["开箱", "unbox", "到手"],
    "日常搭配": ["日常", "上班", "通勤", "daily"],
    "好物推荐": ["推荐", "安利", "好物", "种草"],
}
```

Video notes are classified as "视频" regardless of title. Anything unmatched goes to "其他". Classification is first-match: a note matching "穿搭" won't also be counted under "好物推荐" even if it contains "推荐".

### 4.3 Sentiment Classification (XHS scraper)

Hardcoded word list of 26 Chinese terms. Presence-based (word appears → counted), not frequency or context-aware:

- **Positive (20):** 好看, 质感, 高级, 百搭, 轻便, 大容量, 实用, 性价比, 颜值, 做工, 五金, 皮质, 耐用, 惊艳, 精致, 大气, 小众, 独特, 气质
- **Negative (6):** 偏硬, 偏重, 容易刮, 掉色, 塌, 廉价

Splitting is done by set membership, not by NLP.

---

## 5. Output Format

### 5.1 The Static HTML Dashboard (what's actually deployed)

`competitor-intel.html` — 4,949 lines of self-contained HTML/CSS/JS. Five tabs:

| Tab | Content | Data Source |
|-----|---------|-------------|
| **OMI记分卡** | OMI brand diagnosis, Gap-to-Target scorecard with KPIs (天猫排名, 抖音粉丝, XHS声量, etc.), department-level targets | Hardcoded in HTML |
| **热卖商品** | Tmall + Douyin product rankings, price band filters (¥0-220, ¥220-630, ¥630+), channel tabs (天猫/抖音) | Hardcoded in HTML |
| **竞品情报** | Per-brand 7-dimension accordion briefs for all 20 brands. Sidebar navigation by group. Each brand has D1-D7 sections with search tags, follower counts, content analysis, KOL data, live commerce status, consumer sentiment, and Tmall ranking. Ends with strategic conclusion + department action items. | Hardcoded in HTML |
| **材质定价矩阵** | Canvas scatter plot: X=price, Y=material quality. 11 brands plotted including OMI. Materials: PU → 二层皮 → 真皮 → 植鞣皮. | Hardcoded JS arrays |
| **品牌定位图** | Canvas scatter plot: X=线上声量, Y=材质品质. Same 11 brands. | Hardcoded JS arrays |

Each brand brief in the 竞品情报 tab follows this structure:
```
Brand header (name, badge, data date)
├── D1 品牌搜索指数 — XHS + Douyin search suggestion tags, insight
├── D2 品牌声量 — Follower/notes/likes cards per platform, insight
├── D3 内容策略 — Content type breakdown, sample posts, insight
├── D4 明星/KOL生态 — Celebrity endorsements, KOL names, insight
├── D5 社交电商引擎 — Live status, shop products, strategy, insight
├── D6 消费者心智 — Positive/negative keyword tags, UGC samples, insight
├── D7 渠道权威度 — Tmall rank, category share, price band, insight
└── ⚡ 综合战略结论 — Strategic conclusion + department action items
```

Every insight and action item is hand-written analysis, not LLM-generated. The writing style is Chinese with occasional English section headers.

### 5.2 The HTML Generator (not in production)

`html_generator.py` can regenerate `competitor-intel.html` from JSON data. It produces a different (simpler) layout than the hand-authored dashboard:
- Two-column: sidebar + main content area
- Same 7-dimension accordion per brand
- Same CSS color scheme (#0d0d14 dark background, #667eea accent)
- Missing: the OMI记分卡 tab, 热卖商品 tab, 材质定价矩阵 canvas, 品牌定位图 canvas
- Only generates the 竞品情报 view

The generator's output and the static dashboard are **structurally incompatible** — the generator would overwrite the hand-authored dashboard's tabs and charts.

### 5.3 Weekly Brief

There is no weekly brief. The system has no email, Slack, WeChat, or any push delivery mechanism built in. The `.env.example` has `REPORT_EMAIL` and `WECHAT_WORK_WEBHOOK` vars from a separate "Competitor Intelligence Agent" section (the Node.js `backend/agents/competitor-intel.js`), but those are unrelated to this Python pipeline.

---

## 6. Dependencies

### 6.1 Python Packages (`requirements.txt`)

| Package | Version | Used For |
|---------|---------|----------|
| `httpx` | >=0.27.0 | HTTP client for API mode scraping |
| `anthropic` | >=0.39.0 | Claude API for analysis |
| `playwright` | >=1.40.0 | Browser automation for browser mode |
| `asyncio-compat` | >=0.1.0 | Async compatibility (questionable necessity) |
| `python-dateutil` | >=2.8.0 | Date parsing (imported nowhere in the codebase) |

Commented out:
- `rotating-proxies` — mentioned as optional for Aliyun
- `apscheduler` — mentioned as optional for scheduling

### 6.2 External Services

| Service | Required | Auth Method |
|---------|----------|-------------|
| XHS web | For D1-D4,D6 | Cookie string |
| Douyin web | For D1-D2,D4-D5 | Cookie string |
| SYCM (sycm.taobao.com) | For D7 | Tmall seller session cookies |
| Anthropic API | For analysis (optional) | API key |
| GitHub | For auto-deploy push (optional) | Personal access token |

### 6.3 API Keys / Secrets (env vars)

```
ANTHROPIC_API_KEY     — Claude API
ANTHROPIC_MODEL       — defaults to claude-sonnet-4-20250514
XHS_COOKIES           — XHS session cookie string
DOUYIN_COOKIES        — Douyin session cookie string
SYCM_COOKIES          — 生意参谋 session cookie string
SCRAPER_PROXY         — single proxy URL
GITHUB_TOKEN          — for git push
COMPETITOR_DATA_DIR   — JSON output directory
COMPETITOR_HTML_DIR   — HTML output directory
GITHUB_REPO           — repo slug
GIT_BRANCH            — target branch
```

### 6.4 Infrastructure

Current: None. The pipeline has not been deployed.

Planned (from README and plan docs): Alibaba Cloud Hong Kong ECS for running scrapers on a cron. GitHub Actions workflow (`competitor-intel-scrape.yml`) was authored but could not be pushed due to PAT missing `workflow` scope.

---

## 7. Known Limitations

### 7.1 The Static Dashboard vs. The Pipeline Are Disconnected

The biggest gap: the HTML dashboard served on Vercel has **all data hardcoded inline**. It does not read from `competitors_latest.json`. Running the scraper pipeline and updating the JSON file has zero effect on what users see. The HTML generator exists but produces a simpler layout that would overwrite the hand-authored dashboard (losing the scorecard, products, matrix, and positioning tabs).

### 7.2 Scrapers Have Never Run

The scraper code is untested against live platforms. XHS and Douyin aggressively block automated access; the regex-based parsing likely needs significant tuning when encountering real HTML responses. The `window.__INITIAL_STATE__` and `RENDER_DATA` structures these platforms use change frequently.

### 7.3 Blocking Sleeps in Async Code

`xhs_scraper.py` lines 113, 118 and `douyin_scraper.py` lines 91, 96 use `time.sleep()` (blocking) instead of `await asyncio.sleep()` inside async functions. This blocks the event loop during browser mode scraping.

### 7.4 Anthropic Client Is Sync Inside Async Functions

`anthropic_analyzer.py` uses `client.messages.create()` (sync) inside `async def analyze_brand()`. The `anthropic` library has an `AsyncAnthropic` client, but it's not used. This means all Claude API calls block the event loop.

### 7.5 No Retry Logic Anywhere

Scrapers, analyzer, and git push all have try/except blocks that log errors and move on. No retries, no exponential backoff. A single transient failure (network timeout, rate limit) means that brand's data is lost for that run.

### 7.6 Cookie Management Is Manual

All three platforms require session cookies. Cookies expire (XHS/Douyin within hours-days, SYCM even faster). There is no cookie refresh, validation, or expiry detection mechanism. The system will silently produce empty/failed results when cookies expire.

### 7.7 Hardcoded Sentiment Word List

The 26-word sentiment list in `_extract_sentiment_keywords()` is a fixed set of Chinese bag-review terms. It's presence-based (no weighting, no context), can't detect new sentiment patterns, and doesn't distinguish between "好看" appearing in "不好看" vs "真的好看".

### 7.8 Content Classifier Is Naive

First-match keyword classification means a note titled "穿搭测评对比" gets classified as "穿搭OOTD" and never counted as "测评对比". The categories are hardcoded and not validated against actual XHS content taxonomy.

### 7.9 `python-dateutil` and `asyncio-compat` Are Unused

`python-dateutil` is in requirements.txt but never imported. `asyncio-compat` is listed but the codebase uses standard `asyncio` directly.

### 7.10 No Input Validation on Cookie Strings

Cookie strings are passed directly to HTTP headers without validation. Malformed or empty cookies produce silent failures (HTTP 302 to login pages parsed as "no data found").

### 7.11 Proxy Support Is Minimal

Single proxy URL, `https://` protocol only, no rotation, no health checking. The httpx `proxies` parameter format used (`{"https://": url}`) will be deprecated in newer httpx versions.

### 7.12 Git Push Is Naive

`push_to_github()` uses `subprocess.run(["git", "push"])` with no auth token configuration — it relies on whatever git credentials are configured in the environment. The `GITHUB_TOKEN` env var is checked for existence but never actually used in the push command.

### 7.13 HTML Generator Cannot Reproduce the Full Dashboard

`html_generator.py` only generates the 竞品情报 (competitor briefs) view. It cannot produce the OMI scorecard, product rankings, material-price matrix canvas, or brand positioning canvas. If the generator overwrites `competitor-intel.html`, those sections are lost.

### 7.14 Chart Data Is Hardcoded in JS

The material-price matrix and brand positioning chart have brand coordinates hardcoded in JavaScript arrays (11 brands each, not all 20). These cannot be updated by the scraping pipeline. Only 11 of 20 brands appear, and one (GROTTO) is not in the 20-brand registry at all.

### 7.15 SYCM Endpoints Are Guesses

The SYCM scraper constructs URLs like `sycm.taobao.com/custom/ranking/brand?brandName=...` but these are not documented public APIs. The actual SYCM interface uses encrypted parameters, signed requests, and dynamic token rotation. The regex parsing assumes plain HTML responses from what are likely JavaScript-rendered SPAs.

### 7.16 No Deduplication Across Runs

The dated JSON snapshots (`competitors_2026-03-28.json`, etc.) accumulate with no cleanup policy. The `competitors_latest.json` is a full overwrite, so there's no way to detect changes between runs or track trends over time.

### 7.17 Default CLI Behavior Scrapes Only 5 Brands

When the orchestrator is run without `--full` or `--brand`, it defaults to `SCRAPE_PRIORITY[:5]` — only CASSILE, 裘真, Songmont, La Festin, and Cnolés蔻一. This is undocumented in the README which only shows `--full` examples.

### 7.18 `ANTHROPIC_MODEL` Is Defined Twice

Both `config.py` and `anthropic_analyzer.py` read `ANTHROPIC_MODEL` from env vars, with different defaults: `config.py` defaults to `claude-sonnet-4-20250514`, `anthropic_analyzer.py` also defaults to `claude-sonnet-4-20250514`. They're consistent now but the duplication is a maintenance risk. The analyzer uses its own copy, not the one from config.
