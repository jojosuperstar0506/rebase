# Intelligence Layer — Architecture, UX, Industry Agnosticism & Cost Structure

> **Last updated:** 2026-04-11
> **Status:** 10 of 12 scorers live. Wave 1 + Wave 2 + most of Wave 3 complete.
> **Latest commit:** `1e8203e` on `main` and `will/ci-database`

---

## ⚠️ INSTRUCTIONS FOR JOANNA'S CLAUDE

**Read this section first. It ensures safe code integration across different Claude sessions.**

### Before ANY Code Changes

1. **Pull latest code:**
   ```bash
   git pull origin main
   ```

2. **Read these files in this exact order** (they represent the current codebase state):

   | Priority | File | Why |
   |----------|------|-----|
   | 1 | `services/competitor_intel/SCORING_METHODOLOGY.md` | Single source of truth for all 12 scorers — formulas, thresholds, data sources, known weaknesses |
   | 2 | `services/competitor_intel/scrapers/xhs_scraper.py` | Enhanced scraper (900+ lines) — full catalog pagination, note enrichment, UGC scraping |
   | 3 | `services/competitor_intel/scrape_runner.py` | Bridges scraper output → PostgreSQL. Understand what fields get saved where |
   | 4 | `services/competitor_intel/scoring_pipeline.py` | Core 3 scorers: momentum, threat, WTP |
   | 5 | All files in `services/competitor_intel/pipelines/` | 7 additional scoring pipelines, each follows the same pattern |
   | 6 | `frontend/src/components/ci/intelligence/AttributeCard.tsx` | Unified card component that renders all metrics with metric-specific previews |
   | 7 | `backend/server.js` | API endpoints — especially the `extraPipelines` array (~line 1580) and `/api/ci/intelligence` endpoint |
   | 8 | `backend/brand_registry.js` | Known brands registry (mostly bags — needs `category` field added per TASK-36) |

3. **Understand the scorer pattern before extending:**
   ```python
   # Every pipeline follows this exact structure:
   METRIC_VERSION = "v1.1"
   
   def run_for_workspace(workspace_id):
       conn = get_conn()
       # 1. Query workspace_competitors for this workspace
       # 2. For each competitor, read from scraped_products + scraped_brand_profiles
       # 3. Compute deterministic score (0-100) using specific formula
       # 4. INSERT INTO analysis_results (workspace_id, competitor_name, metric_type, metric_version, score, raw_inputs)
       conn.commit()
   ```

4. **Check for conflicts before modifying shared files:**
   - **Adding a new pipeline?** → Add module path to `backend/server.js` `extraPipelines` array
   - **Adding a new metric_type?** → Add rendering config to `AttributeCard.tsx` `METRIC_CONFIG`
   - **Changing scraper?** → Read the FULL `xhs_scraper.py` first (900+ lines, complex async state)
   - **Changing DB schema?** → Check `backend/migrations/` for existing migrations, create next numbered file

5. **Version protocol when modifying any scorer:**
   - Increment `METRIC_VERSION` (e.g., `"v1.1"` → `"v1.2"`)
   - Update `SCORING_METHODOLOGY.md` with the change
   - Do NOT delete old `analysis_results` rows — versioning lets us compare old vs new

### Why This Matters
William and Joanna use separate Claude sessions. If Joanna's Claude modifies a file without reading the latest version, it could overwrite William's work or introduce incompatible changes. **Always read before writing.**

---

## 1. ARCHITECTURE: How Parallel Workstreams Integrate

### The Unified Analysis Results Table

All intelligence attributes write to the SAME table:

```
analysis_results (existing table)
├── workspace_id
├── competitor_name
├── metric_type       ← THIS is the key field
├── score             ← 0-100 normalized score
├── raw_inputs        ← JSONB with all the underlying data
├── ai_narrative      ← AI-generated insight text for this metric
├── metric_version    ← "v1.0", "v1.1" etc.
├── analyzed_at       ← timestamp
```

Every new attribute becomes a new `metric_type` value:

| metric_type | Attribute | Status | raw_inputs contains |
|-------------|-----------|--------|-------------------|
| `momentum` | Core Health | ✅ Live | follower growth, content volume, engagement, catalog size |
| `threat` | Core Health | ✅ Live | price overlap, social presence, engagement strength |
| `wtp` | Core Health | ✅ Live | price premium vs category avg × sales volume |
| `consumer_mindshare` | Consumer Intel | ✅ Live | engagement_share_pct, ugc_ratio, sentiment (pos/neg keywords), avg_comments |
| `keywords` | Consumer Intel | ✅ Live | keyword_cloud{}, categories{}, trending[] |
| `trending_products` | Product Intel | ✅ Live | top_products[], engagement-ranked notes |
| `design_profile` | Product Intel | ⏳ Wave 4 | dominant_shapes[], materials[], colors[], aesthetic_style |
| `price_positioning` | Product Intel | ✅ Live | price_level, price_bands{}, discount_depth, data_source tier |
| `launch_frequency` | Product Intel | ✅ Live | total_launches_90d, avg_per_week, acceleration_pct, consistency_cv, weekly_breakdown{} |
| `voice_volume` | Marketing Intel | ✅ Live | growth_rate, voice_share_pct, platform_breakdown{} |
| `content_strategy` | Marketing Intel | ✅ Live | total_posts, engagement_per_post, content_type_count, top_content[] |
| `kol_strategy` | Marketing Intel | ⏳ Wave 4 | kol_count, tier_mix{}, campaigns[], (needs structured extraction from D4) |

### The Contract Between William and Joanna

William's pipelines ALWAYS output:
```json
{
  "metric_type": "keywords",
  "score": 72,
  "raw_inputs": { "...full structured data..." },
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

This means:
- William can build any new attribute independently. As long as it writes to analysis_results with the correct metric_type, the dashboard picks it up.
- Joanna can build the display for any attribute independently. She reads from a known structure.
- They never need to sync on data format. The table IS the contract.
- New attributes appear on the dashboard automatically via the generic `AttributeCard` component.

### Data Flow Architecture

```
                       ┌──────────────────────────────────────────────┐
                       │         XHS / Douyin Platforms                │
                       └──────────┬───────────────────────────────────┘
                                  │ scrape_runner.py (daily cron)
                                  ▼
                  ┌───────────────────────────────────┐
                  │         PostgreSQL                  │
                  │  ┌─────────────────────────────┐   │
                  │  │ scraped_brand_profiles       │   │  ← follower_count, engagement_metrics,
                  │  │                               │   │    content_metrics, raw_dimensions (D1-D6)
                  │  └─────────────────────────────┘   │
                  │  ┌─────────────────────────────┐   │
                  │  │ scraped_products             │   │  ← note_id, title, likes, comments,
                  │  │                               │   │    hashtags, image_urls, category
                  │  └─────────────────────────────┘   │
                  └───────────┬───────────────────────┘
                              │ 10 scoring pipelines (deterministic, ¥0)
                              ▼
                  ┌─────────────────────────────────┐
                  │ analysis_results                 │  ← metric_type, score (0-100),
                  │                                   │    raw_inputs (JSONB), metric_version
                  └───────────┬─────────────────────┘
                              │ GET /api/ci/intelligence
                              ▼
                  ┌─────────────────────────────────┐
                  │ Frontend: Intelligence Page       │
                  │ AttributeCard × 12 per competitor │
                  └─────────────────────────────────┘
```

### What Changed: Social Signal Proxies (Path 2 Decision)

Our scrapers collect from XHS + Douyin (not Tmall/JD). We made a deliberate decision to **reframe 4 scorers** to use social signals as proxies for traditional e-commerce metrics:

| Scorer | Traditional Metric | Our Social Proxy | Why It Still Works |
|--------|-------------------|-----------------|-------------------|
| **Mindshare** | Star ratings + review count | Engagement share + sentiment keywords + comment depth | XHS comments/saves reflect real consumer perception — arguably more authentic than filtered Tmall reviews |
| **Pricing** | Product listing prices | Profile avg_price + Douyin shop prices + price_range JSONB | Profile-level pricing captures brand positioning even without per-SKU data |
| **Launch Pace** | New SKU first-seen dates | New note first-seen dates + profile note_count delta | On XHS, a new note IS the brand's public "launch" — product reveals, campaigns, collections |
| **Hot Products** | Unit sales volume | Note engagement (likes) | The most-liked content IS what consumers are responding to |

**Path to higher accuracy:** Adding a Taobao product scraper (public pages) in a future sprint would upgrade scores automatically — no pipeline code changes needed, just richer data flowing in.

### File Ownership (Updated)

```
William owns (backend pipelines + API):
  services/competitor_intel/
  ├── SCORING_METHODOLOGY.md          ← SECRET SAUCE document
  ├── scoring_pipeline.py             ← Core 3: momentum, threat, WTP         ✅ BUILT
  ├── scrape_runner.py                ← Scraper → DB bridge                   ✅ BUILT
  ├── run_daily_pipeline.sh           ← Daily cron orchestration              ✅ BUILT
  ├── scrapers/
  │   ├── xhs_scraper.py              ← Enhanced: catalog + enrichment + UGC  ✅ BUILT
  │   └── douyin_scraper.py           ← Douyin scraper (less enhanced)        ✅ BUILT
  ├── pipelines/
  │   ├── keyword_pipeline.py         ← Keywords (1B)                         ✅ BUILT
  │   ├── voice_volume_pipeline.py    ← Voice volume (3A)                     ✅ BUILT
  │   ├── product_ranking_pipeline.py ← Hot products (2A)                     ✅ BUILT
  │   ├── price_analysis_pipeline.py  ← Price positioning (2C)               ✅ BUILT
  │   ├── launch_tracker_pipeline.py  ← Launch frequency (2D)                ✅ BUILT
  │   ├── mindshare_pipeline.py       ← Consumer mindshare (1A)              ✅ BUILT
  │   ├── content_strategy_pipeline.py← Content strategy (3B)                ✅ BUILT
  │   ├── kol_tracker_pipeline.py     ← KOL strategy (3C)                    ⏳ TODO
  │   └── design_vision_pipeline.py   ← Design DNA (2B)                      ⏳ TODO
  backend/
  ├── server.js                       ← API endpoints (extraPipelines array)  ✅ BUILT
  ├── brand_registry.js               ← Known brands (needs category field)   🟡 NEEDS UPDATE
  └── migrations/
      ├── 001-005                     ← Existing migrations                   ✅ BUILT
      └── 005_data_retention.sql      ← 90-day auto-prune                    ✅ BUILT

Joanna owns (frontend display):
  frontend/src/
  ├── components/ci/intelligence/
  │   ├── AttributeCard.tsx           ← Generic card for any metric_type      ✅ BUILT (William started)
  │   ├── KeywordCloud.tsx            ← Detail view                           ⏳ TODO
  │   ├── SentimentPanel.tsx          ← Detail view                           ⏳ TODO
  │   ├── ProductRanking.tsx          ← Detail view                           ⏳ TODO
  │   ├── DesignAnalytics.tsx         ← Detail view                           ⏳ TODO
  │   ├── PriceMap.tsx                ← Detail view                           ⏳ TODO
  │   ├── LaunchTimeline.tsx          ← Detail view                           ⏳ TODO
  │   ├── VoiceVolume.tsx             ← Detail view                           ⏳ TODO
  │   ├── ContentLabels.tsx           ← Detail view                           ⏳ TODO
  │   └── KOLTracker.tsx              ← Detail view                           ⏳ TODO
  ├── pages/ci/
  │   ├── CIIntelligence.tsx          ← Intelligence page                     ✅ BUILT (William started)
  │   ├── CIDashboard.tsx             ← Main dashboard                        ✅ BUILT
  │   └── CISettings.tsx              ← Competitor setup + analysis trigger    ✅ BUILT
  └── services/
      └── ciApi.ts                    ← CI API client functions                ✅ BUILT
```

### Integration Checkpoints (Updated)

**Checkpoint 1 (Wave 1) — ✅ COMPLETE:**
- William: All 3 deterministic pipelines (voice_volume, keywords, product_ranking) writing to analysis_results.
- Joanna: Intelligence tab with AttributeCard component rendering metric cards.
- Verified: data flows from pipeline → database → API → frontend.

**Checkpoint 2 (Wave 2 + partial Wave 3) — ✅ COMPLETE:**
- William: consumer_mindshare, price_positioning, content_strategy, launch_frequency pipelines added.
- All 10 scorers producing scores. AttributeCard has metric-specific preview renderers for each.

**Checkpoint 3 (Wave 4) — ⏳ REMAINING:**
- kol_strategy and design_profile pipelines to be built.
- Detail views for each attribute (Joanna's frontend work).
- Cross-brand comparison view.

---

## 2. USER EXPERIENCE: How Intelligence Flows for the End User

### Intelligence Page Layout (Desktop) — Built

The CI tab has a sub-nav: `总览 | 竞品洞察 | 市场全景 | 竞品追踪 | 设置 | 帮助`

```
┌──────────────────────────────────────────────────────────┐
│  竞品洞察 — Intelligence Overview                        │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │ 🔍 AI Executive Summary                              ││
│  │ AI-generated narrative about key changes this week    ││
│  │ [Full Report →]                                      ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ┌─────────── Consumer Intelligence ─────────┐          │
│  │ ┌────────────┐ ┌────────────┐              │          │
│  │ │ 消费心智 72 │ │ 关键词   85 │              │          │
│  │ │ [preview]  │ │ [preview]  │              │          │
│  │ └────────────┘ └────────────┘              │          │
│  └────────────────────────────────────────────┘          │
│  ┌─────────── Product Intelligence ──────────┐          │
│  │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │          │
│  │ │热门68│ │设计 —│ │价格74│ │新品51│       │          │
│  │ └──────┘ └──────┘ └──────┘ └──────┘       │          │
│  └────────────────────────────────────────────┘          │
│  ┌─────────── Marketing Intelligence ────────┐          │
│  │ ┌────────────┐ ┌────────────┐ ┌──────────┐ │          │
│  │ │ 品牌声量 81│ │ 内容策略 65│ │ KOL  —  │ │          │
│  │ └────────────┘ └────────────┘ └──────────┘ │          │
│  └────────────────────────────────────────────┘          │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Compare: [Brand A ▼] vs. [Brand B ▼]                ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

### What's Built in AttributeCard.tsx

Each card now has metric-specific preview renderers:
- **Price positioning:** Mini bar chart of price band distribution + avg price + premium ratio + discount depth
- **Launch frequency:** 90-day totals + avg/week + acceleration arrow (↑/↓) + recent launch titles with dates
- **Consumer mindshare:** Engagement share % + sentiment ratio with emoji + avg comments + positive/negative keyword tags (green/red)
- **Content strategy:** Total posts + engagement per post + content type count + top content titles with like counts
- **Keywords:** Top keyword tags
- **Voice volume:** Growth percentage + follower/content/engagement breakdown
- **Hot products:** Top products with engagement metrics

### What Joanna Can Build Next (Frontend)

1. **Detail views for each metric** — Expand from the preview into a full panel/modal with:
   - Rich data visualization (keyword cloud, price chart, launch timeline)
   - AI narrative explaining what the data means
   - "Compare brands" toggle showing the same attribute across all competitors

2. **Compare mode** — Side-by-side comparison of 2 brands across all attributes

3. **Score trend sparklines** — Show how each score changes over time (query `analysis_results` history)

### Skeleton/Loading Pattern

When attributes haven't been computed yet (no data):
- Card shows attribute name + "—" score + "Analysis pending" message
- A progress indicator shows which attributes are being computed
- As each pipeline completes, the card animates from skeleton → real data

---

## 3. INDUSTRY AGNOSTICISM

### Current State

The brand registry has ~27 handbag brands. The AI suggestion endpoint sends ALL these brands to DeepSeek regardless of the user's category. This causes wrong suggestions (e.g., user sets up Nike/鞋类 but gets bag brands).

**TASK-36 (planned, not yet built) addresses this:**

### Fix 3a: Category-Aware AI Suggestions

```javascript
// Current (broken):
const prompt = "Known brands in our database: [27 bag brands]. Suggest competitors for Nike..."
// DeepSeek sees 27 bag brands → suggests bag brands

// Fixed:
const prompt = `You must suggest competitors in the SAME CATEGORY as "${brand_category}".
You are NOT limited to brands in our database — suggest any real brand in ${brand_category}.`
```

### Fix 3b: Category Field in Brand Registry

```javascript
// Add category to each brand in brand_registry.js:
{ name: 'Songmont', category: '女包', ... }
{ name: '小CK', category: '女包', ... }

// searchBrands() filters by category:
function searchBrands(query) {
  return KNOWN_BRANDS.filter(b =>
    b.name.includes(query) || b.category.includes(query) || ...
  );
}
```

### Fix 3c: Scoring Formula Generalization (Future)

The scoring formulas use weights tuned for bags but work for any category. For beta, use default weights. Refine category-specific weights as users in different industries onboard.

```python
CATEGORY_WEIGHTS = {
  '_default': {'follower_growth': 0.3, 'content_volume': 0.3, 'engagement': 0.4},
  '女包': {'follower_growth': 0.3, 'content_volume': 0.3, 'engagement': 0.4},
  '咖啡': {'follower_growth': 0.2, 'content_volume': 0.2, 'engagement': 0.2, 'location_count': 0.4},
}
```

### Fix 3d: Design Taxonomy Generalization (Wave 4)

When the vision-based design_profile scorer is built, the taxonomy must be parameterized by category, not hardcoded for bags.

---

## 4. COST STRUCTURE & TIERED ANALYSIS

### Cost Per Analysis Run — Updated Reality

**Key insight from the build session:** All 10 live scorers are **¥0 cost** — pure math, jieba, sorting. No LLM calls needed for Wave 1 scoring.

| Component | What it Does | Cost per Brand | Frequency | Status |
|-----------|-------------|---------------|-----------|--------|
| **Scraping** | XHS/Douyin data collection | ¥0 (runs on local machine) | Daily | ✅ Built |
| **Keyword extraction** | Jieba segmentation + counting | ¥0 (local computation) | Every scrape | ✅ Built |
| **Product ranking** | Sort + delta computation | ¥0 (local computation) | Every scrape | ✅ Built |
| **Voice volume** | Growth rate math | ¥0 (local computation) | Every scrape | ✅ Built |
| **Price analysis** | Cascading data sources, deterministic scoring | ¥0 (deterministic) | Every scrape | ✅ Built |
| **Launch frequency** | First-seen date tracking, weekly aggregation | ¥0 (deterministic) | Every scrape | ✅ Built |
| **Consumer mindshare** | Engagement share + sentiment keywords | ¥0 (deterministic) | Every scrape | ✅ Built |
| **Content strategy** | Content metrics + engagement efficiency | ¥0 (deterministic) | Every scrape | ✅ Built |
| **AI narrative** | DeepSeek synthesis per brand | ~¥0.03 | Daily | ✅ Built |
| **Cross-brand synthesis** | DeepSeek executive summary | ~¥0.05 | Daily | ✅ Built |
| **Sentiment analysis (LLM)** | DeepSeek comment classification | ~¥0.05 per brand | Weekly | ⏳ Future upgrade |
| **KOL tracking** | Structured extraction from D4 | ¥0 (deterministic) | Weekly | ⏳ Wave 4 |
| **Design vision** | Sonnet vision per product image | ~¥1.00 (50 images) | Monthly | ⏳ Wave 4 |

### Actual Monthly Cost (Current State)

| Brands Tracked | Scoring Cost | Narrative Cost | Total | Notes |
|---------------|-------------|---------------|-------|-------|
| 5 | ¥0 | ~¥5/month | ~¥5/month | AI narratives only |
| 10 | ¥0 | ~¥10/month | ~¥10/month | All 10 scorers are free |
| 20 | ¥0 | ~¥20/month | ~¥20/month | Scale linearly |

This is significantly cheaper than the original estimate because we chose deterministic scoring (Path 2) over LLM classification for most attributes.

### Tiered Refresh Strategy (Implemented)

```
EVERY SCRAPE (daily for watchlist):
├── Voice volume growth rates     (¥0, deterministic)      ✅
├── Product ranking changes       (¥0, deterministic)      ✅
├── New product detection         (¥0, deterministic)      ✅
├── Keyword frequency update      (¥0, jieba)              ✅
├── Price positioning             (¥0, deterministic)      ✅
├── Launch frequency              (¥0, deterministic)      ✅
├── Consumer mindshare            (¥0, deterministic)      ✅
└── Content strategy              (¥0, deterministic)      ✅

DAILY (one LLM call):
├── AI narrative refresh          (~¥0.05, DeepSeek)       ✅
└── Alert detection               (¥0, deterministic)      ✅

DATA RETENTION (daily):
└── 005_data_retention.sql        (¥0, prunes >90 days)    ✅

FUTURE — WEEKLY (moderate LLM cost):
├── LLM sentiment analysis        (~¥0.50 for 10 brands)  ⏳
└── KOL tracking pipeline         (¥0, deterministic)     ⏳

FUTURE — MONTHLY (expensive vision calls):
├── Design analytics refresh      (~¥10 for 10 brands)    ⏳
└── Full cross-brand comparison   (~¥0.50, Sonnet)        ⏳
```

### Data Retention Policy (New — Built)

To prevent infinite DB growth:
- `scraped_products`: auto-delete > 90 days
- `scraped_brand_profiles`: auto-delete > 90 days (keeps at least 2 per brand for growth comparison)
- `analysis_results`: auto-delete > 180 days (keeps latest per metric per competitor)
- `ci_*_jobs`: auto-delete completed/failed > 30 days

Implemented in `backend/migrations/005_data_retention.sql`, runs daily via `run_daily_pipeline.sh`.

---

## 5. WHAT WAS BUILT (April 11 Session — Details)

### A. Enhanced XHS Scraper

**File:** `services/competitor_intel/scrapers/xhs_scraper.py`

Before: Scraped ~10 note titles from a single search page.
After: Scrapes 200-300 notes per brand with full detail.

| New Method | What It Does |
|-----------|-------------|
| `_scrape_xhs_note_catalog_api()` | Paginates all notes from brand profile via cursor API (max 300 notes) |
| `_scrape_xhs_note_detail_api()` | Visits individual note pages — extracts body text, hashtags, tagged products (with prices), comments, sponsored flag, author info |
| `_enrich_top_notes()` | Enriches top 50 most-liked notes with full detail |
| `_scrape_xhs_ugc_catalog_api()` | Searches 4 variants: "{brand}", "{brand}+测评", "{brand}+推荐", "{brand}+避雷" to capture consumer-generated content |
| `_parse_like_count()` | Handles "1.2万", "3456", int inputs for safe count parsing |

### B. Enhanced Scrape Runner

**File:** `services/competitor_intel/scrape_runner.py`

Now saves to PostgreSQL:
- Full note catalog (200-300 notes) as `scraped_products`
- UGC notes separately with `product_id: "ugc-{brand}-{i}"`
- Enriched `raw_dimensions`: body_text, hashtags, tagged_products, is_sponsored, brand_collab, author_followers, top_comments, image_count
- `d4.note_authors` (authors with >10K followers as KOL proxy)
- `d6.consumer_comments` (actual comment text from enriched notes)

### C. 4 New Scoring Pipelines

| Pipeline | metric_type | Score Formula |
|----------|------------|---------------|
| `mindshare_pipeline.py` | `consumer_mindshare` | Engagement share (35pts) + UGC volume (30pts) + sentiment signal from D6 keywords (20pts) + comment depth (15pts) |
| `price_analysis_pipeline.py` | `price_positioning` | Cascading data sources: product prices → profile avg_price → price_range → Douyin shop. Level vs category (35pts) + breadth (25pts) + discount signal (20pts) + data confidence (20pts) |
| `launch_tracker_pipeline.py` | `launch_frequency` | Note first-seen dates grouped by ISO week. Frequency (40pts) + acceleration (30pts) + consistency/CV (30pts) |
| `content_strategy_pipeline.py` | `content_strategy` | D3 top_notes + content_types. Volume (25pts) + engagement efficiency (35pts) + type diversity (20pts) + posting consistency (20pts) |

### D. SCORING_METHODOLOGY.md (The Secret Sauce)

**File:** `services/competitor_intel/SCORING_METHODOLOGY.md` — 400+ lines

This is the single most valuable document in the Intelligence layer. It documents:
- Every scorer's exact formula, inputs, thresholds
- Known weaknesses of each scorer
- Improvement roadmap with checkboxes
- Versioning protocol
- Score interpretation guide (80-100 Dominating, 60-79 Strong, etc.)
- Data quality tiers (High/Medium/Low/None)

**Anyone modifying a scorer MUST update this document.**

### E. Bug Fixes from Triple-Lens Review

| Bug | Fix |
|-----|-----|
| Field name mismatch `comments` vs `comments_count` in scraper | Standardized to `comments_count` |
| Convoluted acceleration logic in launch_tracker | Rewrote as clear if/elif/else with 4 branches |
| Wrong field priority in AttributeCard (`p.name` before `p.product_name`) | Fixed to `p.product_name \|\| p.name` |
| Null safety in xhs_scraper note detail parser | Fixed: `(state.get("note") or {}).get(...)` |

---

## 6. WHAT'S REMAINING (Prioritized)

### Priority 1: Deployment (Immediate — William)

| Task | Notes |
|------|-------|
| `git pull origin main` on ECS | Get commit `1e8203e` on production |
| Run migration 005 | `psql -f backend/migrations/005_data_retention.sql` |
| Restart PM2 | `pm2 restart all` |
| Set up scraper machine | Needs valid XHS/Douyin cookies for daily scraping |

### Priority 2: TASK-36 — AI Suggestions + Analysis Progress Bar

**Plan exists at:** `C:\Users\wchiang\.claude\plans\jazzy-crafting-bengio.md`

**Fix 1: AI Suggestions (category-aware)**
- Problem: User sets up Nike (鞋类) but gets bag brand suggestions
- Files to change: `backend/server.js` (~lines 1702-1731), `backend/brand_registry.js`
- Add `category` field to each brand, update DeepSeek prompt to be category-aware

**Fix 2: Analysis Progress Bar (job tracking)**
- Problem: Analysis is fire-and-forget, no progress visibility
- New table: `ci_analysis_jobs` (queued → scoring → narrating → complete → failed)
- New endpoints: `POST /api/ci/run-analysis`, `GET /api/ci/analysis/status`
- Update: `scoring_pipeline.py` to accept `--job-id` and write progress
- Update: Frontend to poll every 3s and show multi-stage progress bar

### Priority 3: Joanna's Frontend Detail Views

| Component | What It Shows | Data Source |
|-----------|-------------|-------------|
| KeywordCloud.tsx | Interactive word cloud from jieba output | `raw_inputs.keywords[]` |
| SentimentPanel.tsx | Positive/negative themes, consumer quotes | `raw_inputs.positive_keywords[]`, `raw_inputs.consumer_comments[]` |
| ProductRanking.tsx | Ranked product/note list with engagement | `raw_inputs.top_products[]` |
| PriceMap.tsx | Price band distribution chart | `raw_inputs.price_bands{}` |
| LaunchTimeline.tsx | Weekly launch cadence timeline | `raw_inputs.weekly_breakdown{}` |
| VoiceVolume.tsx | Growth chart with platform breakdown | `raw_inputs.platform_breakdown{}` |
| ContentLabels.tsx | Content type distribution + top content | `raw_inputs.top_content[]` |
| Cross-brand comparison | Side-by-side all attributes | Query multiple competitors |

### Priority 4: Wave 4 Scorers

| Scorer | What's Needed | Estimated Effort |
|--------|--------------|-----------------|
| **Design DNA** | (1) Image download from scraped note URLs, (2) Sonnet vision API, (3) Material/style classification | 1-2 days |
| **KOL Strategy** | (1) Extract structured KOL data from `raw_dimensions.d4`, (2) Build KOL engagement scoring | 1 day |

### Priority 5: Data Quality Improvements

| Improvement | Impact | Effort |
|------------|--------|--------|
| Taobao product scraper (public pages) | Real prices + sales → price and hot product scorers upgrade from proxy to direct | 2-3 days |
| LLM sentiment analysis (replace keyword-based) | Consumer mindshare scorer becomes much more nuanced | 1 day, ~¥1/run |
| Douyin scraper enhancement (match XHS depth) | All scorers get richer cross-platform data | 2 days |
| Comment sentiment classification | D6 consumer_comments → pos/neg/neutral via DeepSeek | 1 day |

---

## REVISED IMPLEMENTATION PLAN

### Wave 1: Foundation + Quick Wins — ✅ COMPLETE

**William (backend pipelines):**
- ✅ Created `services/competitor_intel/pipelines/` directory structure
- ✅ Built 3 deterministic pipelines: voice_volume, keyword_extraction, product_ranking
- ✅ Each writes to analysis_results with its metric_type
- ✅ Updated run_daily_pipeline.sh to include new pipelines

**Joanna (frontend skeleton):**
- ✅ Intelligence page (`/ci/intelligence`) with sub-nav — William built initial version
- ✅ Generic AttributeCard component — William built with metric-specific previews
- ✅ IntelligenceOverview with domain groups — William built initial layout
- ⏳ Detail views for each attribute — Joanna to build

### Wave 2: Mindshare + Price + Content — ✅ COMPLETE

**William:**
- ✅ Built mindshare_pipeline (engagement share + UGC + sentiment keywords, deterministic)
- ✅ Built price_analysis_pipeline (cascading data sources, deterministic)
- ✅ Built content_strategy_pipeline (volume + efficiency + diversity, deterministic)
- ✅ Built launch_tracker_pipeline (first-seen tracking, weekly frequency, acceleration)

**Joanna:**
- ⏳ Build detail views for each new metric
- ⏳ Build "Compare brands" dropdown for side-by-side

### Wave 3: Scraper Enhancement + Data Quality — ✅ COMPLETE

**William:**
- ✅ Enhanced XHS scraper: full catalog pagination (200-300 notes)
- ✅ Individual note enrichment (body text, hashtags, products, comments)
- ✅ UGC catalog scraping (4 search variants)
- ✅ Created SCORING_METHODOLOGY.md (secret sauce document)
- ✅ Built 005_data_retention.sql (90-day auto-prune)

### Wave 4: Vision AI + KOL + Polish — ⏳ NEXT

**William:**
- ⏳ Build kol_tracker_pipeline (extract from D4 raw_dimensions)
- ⏳ Build design_vision_pipeline (Sonnet vision, batch processing)
- ⏳ TASK-36: Fix AI suggestions + analysis progress bar
- ⏳ Audit all code for hardcoded "女包" → replace with workspace.brand_category

**Joanna:**
- ⏳ Build detail views for all 10 attributes (see Priority 3 table above)
- ⏳ Build cross-brand comparison view
- ⏳ Mobile optimization for intelligence page
- ⏳ Score trend sparklines (query analysis_results history)

---

## Key Decisions Log (Updated)

| Date | Decision | Who | Context |
|------|----------|-----|---------|
| 2026-04-11 | Path 2: Reframe scorers for social data (XHS/Douyin) instead of waiting for Tmall/JD scrapers | William | 4 scorers rewritten to use social signal proxies. Scores are directionally accurate. Adding Taobao later auto-upgrades. |
| 2026-04-11 | Deterministic scoring for Wave 1-3 (¥0 cost) | William | All 10 live scorers use math, not LLMs. Tradeoff: less nuanced but zero cost per run. |
| 2026-04-11 | 90-day data retention policy | William | Prevents infinite DB growth. Keeps at least 2 snapshots per brand for growth comparison. |
| 2026-04-11 | SCORING_METHODOLOGY.md as single source of truth | William | Every formula, threshold, weakness documented. Anyone modifying a scorer MUST update this doc. |
| 2026-04-11 | METRIC_VERSION tagging in every pipeline | William | Old scores never deleted. Versions let us track methodology improvements over time. |
| 2026-04-11 | XHS notes = "products" in scraped_products table | William | Reuses existing schema. A note on XHS IS the brand's public product showcase. likes = sales_volume, comments = review_count. |
| 2026-04-11 | Enhanced scraper: 200-300 notes per brand (was 10) | William | Full catalog pagination + top-50 enrichment + 4-variant UGC search. Data quality dramatically improved. |

---

## Score Interpretation Guide

| Score | Meaning | What We Tell The Owner |
|-------|---------|----------------------|
| 80-100 | Dominating | "You're leading here. Protect this advantage." |
| 60-79 | Strong | "Solid position. Small optimizations can widen the gap." |
| 40-59 | Average | "You're in the pack. This is a differentiable opportunity." |
| 20-39 | Weak | "Competitors are ahead. This is a whitespace to address." |
| 0-19 | Critical | "Significant gap. Prioritize this in next quarter." |

---

## How to Add a New Scorer (Step-by-Step)

1. **Create pipeline:** `services/competitor_intel/pipelines/your_pipeline.py`
   - Copy the structure from any existing pipeline (e.g., `content_strategy_pipeline.py`)
   - Set `METRIC_VERSION = "v1.0"` and your `metric_type` string

2. **Register pipeline:** In `backend/server.js`, add to `extraPipelines` array:
   ```javascript
   'services.competitor_intel.pipelines.your_pipeline',
   ```

3. **Add frontend config:** In `AttributeCard.tsx`, add to `METRIC_CONFIG`:
   ```typescript
   your_metric: { label: 'Your Metric', icon: '📊', domain: 'product' }
   ```

4. **Update documentation:** Add scorer details to `SCORING_METHODOLOGY.md`

5. **Test:** Run manually:
   ```bash
   python -m services.competitor_intel.pipelines.your_pipeline --workspace-id UUID
   ```

---

## Verification Checklist

- [ ] All 10 pipelines run without errors: `python -m services.competitor_intel.scoring_pipeline --all`
- [ ] Analysis results in DB: `SELECT metric_type, COUNT(*) FROM analysis_results GROUP BY metric_type`
- [ ] Frontend Intelligence page shows score rings for all 10 metrics
- [ ] Data retention runs: `psql -f backend/migrations/005_data_retention.sql`
- [ ] Scraper collects 200+ notes per brand (not just 10)
- [ ] UGC notes in DB: `SELECT COUNT(*) FROM scraped_products WHERE product_id LIKE 'ugc-%'`
