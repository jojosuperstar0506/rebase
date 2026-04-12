# Joanna — Intelligence Frontend Build Tracker

> Last updated: 2026-04-11
> Session: Intelligence Layer Wave 1 + 2 + 3 stubs

---

## Wave Status

| Wave | William (Backend) | Joanna (Frontend) |
|------|------------------|-------------------|
| **Wave 1** — Foundation (page + card grid) | ✅ voice_volume, keywords, trending_products | ✅ Built this session |
| **Wave 2** — Detail Views | ✅ consumer_mindshare, price_positioning, launch_frequency, content_strategy | ✅ Built this session |
| **Wave 3** — Stubs | ⏳ kol_tracker ❌, design_vision ❌ | ✅ Stubs built this session |
| **Wave 4** — Vision + Compare | ❌ Not started | 🔜 Blocked on William |

---

## Files Built This Session

### Modified
- [x] `frontend/src/i18n/index.ts` — +22 intelligence keys
- [x] `frontend/src/services/ciApi.ts` — +MetricSummary types + getIntelligenceSummary() + getIntelligenceDetail()
- [x] `frontend/src/components/ci/CISubNav.tsx` — +竞品洞察 tab
- [x] `frontend/src/App.tsx` — +/ci/intelligence route

### Created
- [x] `frontend/src/components/ci/intelligence/AttributeCard.tsx`
- [x] `frontend/src/pages/ci/CIIntelligence.tsx`
- [x] `frontend/src/components/ci/intelligence/KeywordCloud.tsx` (Wave 2)
- [x] `frontend/src/components/ci/intelligence/SentimentPanel.tsx` (Wave 2)
- [x] `frontend/src/components/ci/intelligence/ProductRanking.tsx` (Wave 2)
- [x] `frontend/src/components/ci/intelligence/PriceMap.tsx` (Wave 2)
- [x] `frontend/src/components/ci/intelligence/LaunchTimeline.tsx` (Wave 2)
- [x] `frontend/src/components/ci/intelligence/VoiceVolume.tsx` (Wave 2)
- [x] `frontend/src/components/ci/intelligence/ContentLabels.tsx` (Wave 2)
- [x] `frontend/src/components/ci/intelligence/KOLTracker.tsx` (Wave 3 stub)
- [x] `frontend/src/components/ci/intelligence/DesignAnalytics.tsx` (Wave 3 stub)

---

## Integration Handoff for William

**One backend addition needed to unlock detail views:**

Add to `backend/server.js`:
```javascript
app.get('/api/ci/intelligence/detail', requireSecret, async (req, res) => {
  const { workspace_id, brand_name } = req.query;
  const rows = await db.query(
    `SELECT metric_type, score, raw_inputs, ai_narrative, analyzed_at
     FROM analysis_results WHERE workspace_id=$1 AND competitor_name=$2
     ORDER BY analyzed_at DESC`,
    [workspace_id, brand_name]
  );
  const result = {};
  for (const row of rows.rows) {
    result[row.metric_type] = {
      score: row.score,
      raw_inputs: row.raw_inputs,
      ai_narrative: row.ai_narrative,
      analyzed_at: row.analyzed_at
    };
  }
  res.json(result);
});
```

Route through **existing** `api/ci/dashboard.js` Vercel function via query param — no new serverless function needed (already at Hobby limit of 12).

**Without this endpoint:** AttributeCard grid works (scores + narratives from dashboard). Detail panel shows "Detailed data loading..." gracefully.

---

## Wave 4 Remaining (Joanna)
- [ ] Cross-brand comparison view (side-by-side 2 brands, all attributes)
- [ ] Wire KOLTracker.tsx with real data (after William's kol_tracker_pipeline)
- [ ] Wire DesignAnalytics.tsx with vision data (after William's design_vision_pipeline)
- [ ] Mobile optimization (single-column, card scroll)
- [ ] Score trend sparklines (query analysis_results history)

---

## Data Contract Reference

`getIntelligenceSummary()` reads from existing `/api/ci/dashboard` endpoint:
```
dashboard.brands → flat array of { competitor_name, metric_type, score, ai_narrative, analyzed_at }
```
Reorganized client-side into: `Record<competitor, Record<metricType, MetricSummary>>`

**Live metric_types (10 of 12):**
`momentum` · `threat` · `wtp` · `consumer_mindshare` · `keywords` · `trending_products` · `price_positioning` · `launch_frequency` · `voice_volume` · `content_strategy`

**Wave 4 metric_types (stubs only):**
`kol_strategy` · `design_profile`
