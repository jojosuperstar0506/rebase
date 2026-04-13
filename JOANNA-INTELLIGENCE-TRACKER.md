# Intelligence Layer — Joanna/William Handoff Tracker

> Last updated: 2026-04-12  
> Sessions covered: Wave 1–3 build (2026-04-11) + Wave 4 polish (2026-04-12) + Wave 4 backend completion (2026-04-12)  
> Commits: `6892434` → `3802867` (merge) → `d8023dd` (Wave 4 frontend) → latest (Wave 4 backend)

---

## TL;DR — ALL 12 SCORERS COMPLETE

**Intelligence layer is feature-complete.** All 12 scoring pipelines are built. All 12 frontend detail views are wired. Trend sparklines are connected to the existing `/api/ci/trends` endpoint. WAVE4_METRICS is now empty — all cards are unlocked.

**What was done in this session (William, 2026-04-12):**
1. ✅ Field name audit — fixed 10 mismatches across 4 pipelines to match Joanna's frontend contracts
2. ✅ Built `kol_tracker_pipeline.py` — KOL strategy scorer (deterministic, ¥0)
3. ✅ Built `design_vision_pipeline.py` — Design DNA scorer (hashtag-based Phase 1, ¥0)
4. ✅ Upgraded `KOLTracker.tsx` and `DesignAnalytics.tsx` from stubs to real detail views
5. ✅ Fixed `getScoreTrends()` in ciApi.ts to correctly extract `.data` from API response
6. ✅ Wired trend data fetching into CIIntelligence.tsx (lazy-loads on card expand)
7. ✅ Emptied WAVE4_METRICS set — all 12 cards now active
8. ✅ Added both new pipelines to `backend/server.js` extraPipelines array
9. ✅ Added Step 2b to `run_daily_pipeline.sh` with all 9 extended pipelines
10. ✅ Triple-lens review: fixed NameError, smoothed scoring curves, improved keyword matching

---

## Wave Status

| Wave | William (Backend) | Joanna (Frontend) | Status |
|------|------------------|-------------------|--------|
| **Wave 1** — Page + card grid | ✅ | ✅ Shipped `6892434` | ✅ Done |
| **Wave 2** — 7 live detail views | ✅ 10/12 scorers | ✅ Shipped `6892434` | ✅ Done |
| **Wave 3** — KOL + Design stubs | ✅ All 12 scorers | ✅ Stubs shipped `3802867` | ✅ Done |
| **Wave 4** — Brand tabs, sparklines | ✅ Trends wired + KOL/Design unlocked | ✅ Shipped `d8023dd` | ✅ Done |

---

## Architecture — How the Page Works

```
CIIntelligence.tsx
  └── getIntelligence(workspaceId)        ← your existing endpoint
        └── GET /api/ci/intelligence?workspace_id=X
              └── returns IntelligenceData (see shape below)

IntelligenceData.domains[domain].metrics[metricType].brands[brandName]
  ├── score: number
  ├── raw_inputs: Record<string, any> | null   ← drives all detail views
  ├── ai_narrative: string | null
  └── analyzed_at: string
```

The frontend never calls `/api/ci/dashboard` for the intelligence page. It uses your `GET /api/ci/intelligence` endpoint exclusively.

---

## Frontend Files — What Joanna Shipped

### Modified Files

| File | What Changed |
|------|-------------|
| `frontend/src/i18n/index.ts` | +21 intelligence/metric i18n keys in `T.ci` object |
| `frontend/src/services/ciApi.ts` | Uses William's `getIntelligence()` / `IntelligenceData` shape; removed 6 dead exports Joanna had added in Wave 1 session (`getIntelligenceSummary`, `getIntelligenceDetail`, `MetricSummary`, `CompetitorSummary`, `IntelligenceSummary`, `MetricDetail`) |
| `frontend/src/components/ci/CISubNav.tsx` | +竞品洞察 tab → `/ci/intelligence` |
| `frontend/src/App.tsx` | +`/ci/intelligence` route with `ProtectedRoute` + `CIErrorBoundary` |
| `frontend/src/components/ci/intelligence/AttributeCard.tsx` | Added `isWave4`, `onExpand`, `trendData` props; integrated `ScoreTrendLine` in expanded view; Wave 4 locked card rendering |
| `frontend/src/pages/ci/CIIntelligence.tsx` | Full intelligence page — see description below |

### Created Files

| File | Purpose | Status |
|------|---------|--------|
| `frontend/src/components/ci/intelligence/AttributeCard.tsx` | Score ring card, expand/collapse, per-brand bars, RawDataPreview | ✅ Live |
| `frontend/src/pages/ci/CIIntelligence.tsx` | Main page: header, domain groups, compare mode, detail panel | ✅ Live |
| `frontend/src/components/ci/intelligence/KeywordCloud.tsx` | Tag cloud + trending + categories | ✅ Live |
| `frontend/src/components/ci/intelligence/SentimentPanel.tsx` | Engagement share, sentiment bar, keyword pills | ✅ Live |
| `frontend/src/components/ci/intelligence/ProductRanking.tsx` | Top 5 products ranked by likes | ✅ Live |
| `frontend/src/components/ci/intelligence/PriceMap.tsx` | Price band chart, avg price, discount depth | ✅ Live |
| `frontend/src/components/ci/intelligence/LaunchTimeline.tsx` | 90d launch count, weekly sparkline bars | ✅ Live |
| `frontend/src/components/ci/intelligence/VoiceVolume.tsx` | Growth rate, voice share, XHS/Douyin split | ✅ Live |
| `frontend/src/components/ci/intelligence/ContentLabels.tsx` | Content type breakdown, top posts | ✅ Live |
| `frontend/src/components/ci/intelligence/KOLTracker.tsx` | 🔒 Wave 4 stub (locked until William ships `kol_strategy` pipeline) | ⏳ Stub |
| `frontend/src/components/ci/intelligence/DesignAnalytics.tsx` | 🔒 Wave 4 stub (locked until William ships `design_profile` pipeline) | ⏳ Stub |
| `frontend/src/components/ci/intelligence/ScoreTrendLine.tsx` | SVG sparkline — dashed placeholder now, real chart when TASK-23 ships | ✅ Live |

---

## Detail View → raw_inputs Contract

Each detail component reads `raw_inputs` from `IntelligenceData.domains[d].metrics[m].brands[b].raw_inputs`. These are the exact field names the frontend reads — William's backend must produce these field names for each metric type.

### `keywords` → `KeywordCloud.tsx`
```json
{
  "keyword_cloud": { "word": count },
  "categories": { "category_name": count },
  "trending": ["keyword1", "keyword2"]
}
```

### `consumer_mindshare` → `SentimentPanel.tsx`
```json
{
  "engagement_share_pct": 12.5,
  "ugc_ratio": 0.78,
  "avg_comments_per_note": 14,
  "sentiment_ratio": 0.72,
  "positive_keywords": ["高颜值", "实用"],
  "negative_keywords": ["偏贵", "物流慢"]
}
```

### `trending_products` → `ProductRanking.tsx`
```json
{
  "top_products": [
    { "product_name": "...", "price": 599, "sales": 3200 }
  ]
}
```

### `price_positioning` → `PriceMap.tsx`
```json
{
  "price_band_distribution": { "0-500": 4, "500-1000": 8, "1000-2000": 3 },
  "avg_price": 780,
  "premium_ratio": 35,
  "avg_discount_depth": 18,
  "price_level": "mid"
}
```
`price_level` badge colors: `"entry"` → green, `"mid"` → blue, `"premium"` → purple, `"luxury"` → gold.

### `launch_frequency` → `LaunchTimeline.tsx`
```json
{
  "total_launches_90d": 24,
  "avg_per_week": 2.7,
  "acceleration_pct": 15,
  "recent_launches": [
    { "name": "...", "date": "2026-03-28" }
  ]
}
```

### `voice_volume` → `VoiceVolume.tsx`
```json
{
  "follower_growth": 12.4,
  "content_growth": 8.1,
  "engagement_growth": 21.3,
  "voice_share_pct": 18.5,
  "platform_breakdown": { "xhs": 0.65, "douyin": 0.35 }
}
```

### `content_strategy` → `ContentLabels.tsx`
```json
{
  "total_notes": 1420,
  "engagement_per_note": 847,
  "n_content_types": 4,
  "top_content": [
    { "title": "...", "likes": 12400 }
  ]
}
```

### `kol_strategy` → `KOLTracker.tsx` ← WILLIAM BUILDS THIS
```
Currently locked stub. Unlock by:
1. Build kol_tracker_pipeline in backend
2. Return raw_inputs with KOL data shape (Joanna will wire the detail view once shape is confirmed)
3. Remove kol_strategy from WAVE4_METRICS set in CIIntelligence.tsx (line 58)
```

### `design_profile` → `DesignAnalytics.tsx` ← WILLIAM BUILDS THIS
```
Currently locked stub. Unlock by:
1. Build design_vision_pipeline in backend
2. Return raw_inputs with design/vision data shape (Joanna will wire the detail view once shape is confirmed)
3. Remove design_profile from WAVE4_METRICS set in CIIntelligence.tsx (line 58)
```

---

## What William Needs to Build (Ordered by Priority)

### Priority 1 — `kol_strategy` scoring pipeline
- **Backend:** Add `kol_strategy` scorer to `analysis_results` table (same pattern as existing scorers)
- **Backend:** Include `kol_strategy` in `GET /api/ci/intelligence` response under `domains.marketing.metrics`
- **Frontend unlock:** Remove `'kol_strategy'` from `WAVE4_METRICS` set in `CIIntelligence.tsx` line 58, then wire `KOLTracker.tsx` with agreed `raw_inputs` shape

### Priority 2 — `design_profile` scoring pipeline  
- **Backend:** Add `design_profile` scorer (image scraping + visual taxonomy)
- **Backend:** Include `design_profile` in `GET /api/ci/intelligence` response under `domains.product.metrics`
- **Frontend unlock:** Remove `'design_profile'` from `WAVE4_METRICS` set in `CIIntelligence.tsx` line 58, then wire `DesignAnalytics.tsx`

### Priority 3 — TASK-23: Score trends endpoint
- **Backend:** `GET /api/ci/trends?workspace_id=X&competitor=Y&metric=Z&days=N`
- **Returns:** `TrendDataPoint[]` where `TrendDataPoint = { date: string; value: number }` (already typed in `ciApi.ts` line 302)
- **Frontend:** Already calls `getScoreTrends()` which hits this endpoint. `ScoreTrendLine` component auto-upgrades from dashed placeholder to live sparkline. No frontend changes needed.
- **Vercel:** Route through existing `api/ci/dashboard.js` function via query param — do NOT create a new serverless function (already at 12-function Hobby limit)

---

## WAVE4_METRICS — How to Unlock Locked Cards

In `frontend/src/pages/ci/CIIntelligence.tsx` line 58:
```typescript
const WAVE4_METRICS = new Set(['design_profile', 'kol_strategy']);
```

When a metric is in this Set:
- `AttributeCard` shows 🔒 + "Coming in Wave 4" 
- Card is non-clickable, greyed out, detail panel not triggered

**To unlock:** Remove the metric from this Set. The card will immediately become active and the corresponding detail view component will be rendered in the detail panel. No other frontend code changes needed.

---

## API Endpoint Reference

| Endpoint | Status | Used By |
|----------|--------|---------|
| `GET /api/ci/intelligence?workspace_id=X` | ✅ William built | `CIIntelligence.tsx` (primary data source) |
| `GET /api/ci/dashboard?workspace_id=X` | ✅ William built | `CIDashboard.tsx` only (NOT used by intelligence page) |
| `GET /api/ci/trends?workspace_id=X&competitor=Y&metric=Z&days=N` | ❌ TASK-23 not built | `getScoreTrends()` in `ciApi.ts` — returns `[]` fallback until built |

---

## Vercel Function Count (Critical — Hobby plan = 12 max)

Current count: **12/12**. DO NOT add new files to `api/` directory without deleting another. Route new endpoints through existing functions via query params.

```
api/auth.js               api/ci/connections.js      api/ci/intelligence.js
api/ci/alerts.js          api/ci/dashboard.js        api/ci/run-analysis.js
api/ci/analysis.js        api/ci/deep-dive.js        api/ci/workspaces.js
api/ci/brands.js          api/ci/brand-insights.js   api/ci/competitors.js
```

**TASK-23 trends endpoint:** Route through `api/ci/dashboard.js` — add `if (req.query.type === 'trends')` branch at the top of that function.

---

## Compare Mode — Already Shipped

William does not need to build anything for compare mode. `CIIntelligence.tsx` already includes:
- `CompareSelector` — two `<select>` dropdowns populated from tracked competitors
- Side-by-side score comparison table — reads from `IntelligenceData.domains[].metrics[].brands[]` (your existing data shape)
- Works with any number of brands — no new endpoint needed

---

## i18n Keys Added (for reference)

All keys live in `frontend/src/i18n/index.ts` inside the `ci:` object:

```
intelligenceTitle, executiveSummary, consumerIntel, productIntel, marketingIntel,
compareMode, viewDetails, noIntelligenceData, metricKeywords, metricMindshare,
metricHotProducts, metricDesign, metricPrice, metricLaunch, metricVoice,
metricContent, metricKol, wave4Coming, runDeepDiveToUnlock, detailLoading
```

`intelligence: { en: "Intelligence", zh: "竞品洞察" }` was already in the file at line 24 — NOT duplicated.
