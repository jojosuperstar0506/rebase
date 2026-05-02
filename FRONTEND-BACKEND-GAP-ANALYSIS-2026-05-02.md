# Frontend ↔ Backend Gap Analysis + Workplan Update

**Date:** 2026-05-02
**Author:** Joanna (with Claude)
**Scope:** Map every backend CI endpoint and every frontend fetch helper to find what's wired, what's orphaned, and what's missing. Update the workplan with what's left.

---

## TL;DR

The frontend and backend are **mostly aligned** for V1 (Brief/Analytics/Library work end-to-end). Three categories of gap:

1. **Orphaned components** (3) — features Will built earlier that nobody mounts in any page anymore. **Either delete or remount.**
2. **Backend endpoints unused by V1 frontend** (3) — `intelligence`, `pipeline/status`, `connections/check`. **Either delete or wire.**
3. **Backend rich data, frontend renders thin** (4 cases) — fields the API returns that the UI ignores. Quick wins for richer presentation.

Plus the in-flight items from PR #27 + DATA-FLOW-AND-METRICS-ANALYSIS doc.

---

## 1. Endpoint inventory

### Backend exposes (35 CI endpoints in `backend/server.js`)

| Endpoint | Method | Used by frontend? |
|---|---|---|
| `/api/ci/workspace` | GET | ✅ `getWorkspace` → `useCIData`, CISettings |
| `/api/ci/workspace/me` | GET | ✅ `getWorkspace` |
| `/api/ci/workspace` | POST | ✅ `saveWorkspace` → CISettings |
| `/api/ci/competitors` | GET/POST/DELETE | ✅ `getCompetitors`, `addCompetitor`, `removeCompetitor` |
| `/api/ci/dashboard` | GET | ✅ `getDashboard` → `useCIData` |
| **`/api/ci/intelligence`** | GET | 🔴 `getIntelligence` exists but no page consumes it |
| `/api/ci/brief` | GET | ✅ `getBrief` → CIBrief |
| `/api/ci/analytics` | GET | ✅ `getAnalytics` → CIAnalytics |
| `/api/ci/library` | GET | ✅ `getLibrary` → CIBrief, CILibrary |
| `/api/ci/domain-scores` | GET | ✅ `getDomainScores` → CIBrief |
| `/api/ci/connections` | GET/POST | ✅ `getConnections`, `saveConnection` → CISettings |
| **`/api/ci/connections/check`** | POST | 🔴 No frontend caller |
| **`/api/ci/pipeline/status`** | GET | 🔴 No frontend caller |
| `/api/ci/run-analysis` | POST | ✅ `runAnalysis` → CIBrief (post-PR #27), CISettings |
| `/api/ci/analysis/status` | GET | ✅ `getAnalysisStatus` → CIBrief (post-PR #27) |
| `/api/ci/scrape` | POST | ⚠️ Gated to 503 in V1; intentional |
| `/api/ci/ingest` | POST | — server-to-server only |
| `/api/ci/scrape-targets` | GET | — backend internal |
| `/api/ci/alerts` | GET | ✅ `getAlerts` → **CIAlertFeed component** |
| `/api/ci/alerts/read` | POST | ✅ `markAlertsRead` → CIAlertFeed |
| `/api/ci/alerts/count` | GET | ✅ `getAlertCount` |
| `/api/ci/trends` | GET | ✅ `getScoreTrends` → ciApi.ts (helper exists, no page consumes) |
| `/api/ci/trends/summary` | GET | 🔴 No frontend caller (only the non-summary version used) |
| `/api/ci/deep-dive` | POST/status/result | ✅ `requestDeepDive`, `getDeepDiveStatus`, `getDeepDiveResult` → CISettings |
| `/api/ci/brand-insights` | GET | ✅ `getBrandInsights` → CICompetitors |
| `/api/ci/resolve-brand` | POST | ✅ `resolveBrand` → CISettings |
| `/api/ci/parse-link` | POST | ✅ `parseLink` → CISettings |
| `/api/ci/suggest-competitors` | POST | ✅ `suggestCompetitors` → CISettings |
| `/api/ci/brands/search` | GET | ✅ `searchBrands` → CISettings |
| `/api/ci/admin/cleanup-brand-names` | GET | — admin-only utility |

**3 backend endpoints have no frontend consumer:**
- `/api/ci/intelligence` (full intelligence layer endpoint — was probably superseded by `/api/ci/brief` + `/api/ci/analytics`)
- `/api/ci/connections/check` (probably useful — "is this saved cookie still valid?" check button)
- `/api/ci/pipeline/status` (probably useful — companion to `/api/ci/analysis/status`)
- `/api/ci/trends/summary` (the summary variant)

### Frontend has helpers for all of the above ✓

No frontend fetch helper points to a non-existent backend endpoint. **No 404 risks.**

---

## 2. Orphaned UI components — exist, never mounted

```
$ grep mounted-in-pages for each component:
  CIAlertFeed:     0 pages   🔴 ORPHANED
  CIDrillDownModal: 8 pages  ✅ in use
  CITrendChart:    0 pages   🔴 ORPHANED
  CIWelcomeBanner: 0 pages   🔴 ORPHANED
```

**3 fully-built components don't appear anywhere.** Will probably removed them from page mounts during the Brief/Analytics/Library refactor. Each one has working code + working backend wiring.

| Component | What it does | Decision needed |
|---|---|---|
| `CIAlertFeed` | Live feed of alerts from `/api/ci/alerts` (e.g., "CASSILE just gained 5K followers"). Marks-read on click. | **Mount or delete.** Strong V1.5 candidate — alerts are the most natural "drop in to check" UX |
| `CITrendChart` | Per-metric score sparkline over time using `/api/ci/trends` | **Defer until snapshot table** (Will's §5.3). Currently no historical data anyway |
| `CIWelcomeBanner` | First-time-user empty-state banner | **Mount in CIBrief empty state** — strictly better than current text-only empty state |

**Recommendation:** Mount `CIAlertFeed` on Brief tab (or as a sidebar). Mount `CIWelcomeBanner` in the empty state. Delete `CITrendChart` for now (resurrect when Will builds the snapshot table).

---

## 3. Backend richer than frontend — quick presentation wins

The backend returns several fields the frontend ignores. Each is a small win.

### 3.1 `/api/ci/analytics` returns `priority_rationale` strings

Backend computes a per-metric reason like `"Songmont's voice volume is 70 points behind CASSILE — biggest gap in your watchlist."` Frontend has the field but doesn't display it on each metric card.

**Fix:** ~30 min — add a small italic line under each metric's score in CIAnalytics.

### 3.2 `analysis_results.raw_inputs` is full of useful data

Each scored metric carries its raw input snapshot in JSONB:
```json
{
  "growth_rate": 194.19,
  "follower_growth": 480.65,
  "voice_share_pct": 41.96,
  "platform_breakdown": { "douyin": {...}, "xhs": {...} }
}
```

Frontend never shows this. A "Why this score?" expandable on each metric card would let users interrogate the math. Builds trust + lets them spot bad data (which is exactly what we just hit with the zero-follower bug).

**Fix:** ~1.5 hr — add backend field passthrough on `/api/ci/analytics`, then expandable disclosure in CIAnalytics.

### 3.3 `weekly_briefs.moves[].brand` field

Each move in the brief identifies WHICH brand the event is about. The frontend renders move text but doesn't visually tag the brand (color chip, link to that brand's analytics). A small visual chip (`CASSILE` in the brand color) would make the brief much more scannable.

**Fix:** ~30 min — color chip on each move card.

### 3.4 `scraped_brand_profiles.scraped_at` per-brand recency

After Issue 1's cleanup, we have honest per-brand last-scrape dates. The Brief shows "Updated X days ago" (the brief's own age) but not the underlying scrape recency. Adding "Songmont scraped April 21 (12d), CASSILE scraped April 30 (2d)" in the workspace context block makes data freshness honest at the brand level.

**Fix:** ~45 min (small backend helper to surface per-brand recency, plus UI in workspace context block I just added in PR #27)

---

## 4. The flip side — frontend pretends data exists that doesn't

A few places where the UI alludes to capabilities the backend hasn't built yet:

| Location | What it implies | Backend reality |
|---|---|---|
| CIAnalytics — `delta` field on every metric | Week-over-week change shown as ↑/↓ N | `delta: null` always (no snapshot table; Will's §5.3) |
| CIAnalytics — `trends` per metric | 8-week sparkline | `trends: {}` always (same root cause) |
| CILibrary — multi-week history | Prior weeks of briefs | Only 1 brief exists per workspace today |
| CIBrief — empty state mentions "trigger sync in Settings" | One-click data refresh | `/api/ci/scrape` is 503-gated in V1 (intentional, my Layer A) — copy fixed in PR #27 |

**Severity:** Low. The empty/null states are honest at runtime — they just look thin to a customer expecting trends. Snapshot table is the canonical fix.

---

## 5. Recommended priority order (workplan update)

Combining this gap analysis with DATA-FLOW-AND-METRICS-ANALYSIS-2026-05-02.md, here's the prioritized list of remaining work for V1 polish + V1.5:

### 🔴 Blocking V1 polish (next session)

| # | Action | Owner | Effort | Status |
|---|---|---|---|---|
| 1 | Merge PR #27 (frontend polish) | Joanna click | 1 min | Awaiting click |
| 2 | Confirm cleanup A+B applied successfully on next analysis run | (auto on next cron / Refresh click) | — | Auto |
| 3 | Investigate dark metrics (`brand_insight`, `design_profile`, `kol_strategy` all-zero) | Will (1-2 hr) | medium | Queued |
| 4 | Numeric-coherence coercer in `brand_positioning_pipeline.py` | Will (2-3 hr) | high impact | Queued |
| 5 | `follower_count = 0` guard in scoring pipelines | Will (1 hr) | medium | Queued |

### 🟠 V1.5 polish (week 2)

| # | Action | Owner | Effort | Status |
|---|---|---|---|---|
| 6 | Mount `CIAlertFeed` (orphaned today) — alerts sidebar on Brief tab | Joanna or Will (1 hr) | quick win | New |
| 7 | Mount `CIWelcomeBanner` in CIBrief empty state | Joanna (30 min) | quick win | New |
| 8 | Show `priority_rationale` per metric on Analytics tab | Joanna (30 min) | quick win | New |
| 9 | "Why this score?" expandable using `raw_inputs` on Analytics cards | Joanna or Will (1.5 hr) | trust win | New |
| 10 | Brand chip on each move card in Brief | Joanna (30 min) | UX win | New |
| 11 | Per-brand scrape recency on workspace context block | Joanna (45 min) | trust win | New |
| 12 | Delete or wire `/api/ci/intelligence` + `/api/ci/connections/check` + `/api/ci/pipeline/status` + `/api/ci/trends/summary` | Will (decide first) | depends | New |
| 13 | Admin "pending scrapes" tool (Will's §5.1a) | Will (3 hr) | unblocks new customers | Queued |

### 🟢 V2 (post-launch)

| # | Action | Owner | Effort | Status |
|---|---|---|---|---|
| 14 | Comparison Sets implementation per `SPEC-COMPARISON-SETS-V2.md` | Will (~6 days) | major | Spec ready |
| 15 | `analysis_history` snapshot table → real WoW deltas + trend sparklines (Will's §5.3) | Will (~2 hr) | unlocks Analytics depth | Queued |
| 16 | Wire `CITrendChart` once snapshot table exists | Joanna (1 hr) | follow-on to #15 | Queued |
| 17 | B0 burner XHS account for fresh scraping | Joanna (½ day + 2-3 day pre-warm) | unblocks A4d | Queued |
| 18 | Phase B merchant-side scrapers (抖店 / 品牌号 / 千牛) | Joanna + Will (~1 week each) | unlocks unique data | Queued |
| 19 | Phase D customer installer (one-button) | Will (~1-2 weeks) | self-serve onboarding | Queued |

### 🟢 Long-tail / known issues

| # | Action | Owner | Effort | Status |
|---|---|---|---|---|
| 20 | Auto-segmentation prompt iteration (per spec) | Will (post-#14) | depends | Queued |
| 21 | Customer email notifications when brief is ready | Will (30 min, hook exists) | quick | Queued |
| 22 | Workspace switcher UI for users with 2+ workspaces | TBD (2-3 days) | post-V1 | Queued |

---

## 6. Decision points for next sync with William

1. **Orphaned components** — keep + remount, or delete? My vote: keep `CIAlertFeed`, mount in Brief sidebar. Delete `CITrendChart` until snapshot table. Mount `CIWelcomeBanner` in empty state.
2. **Orphaned backend endpoints** (`intelligence`, `connections/check`, `pipeline/status`, `trends/summary`) — delete or wire? My vote: delete `intelligence` (superseded by brief+analytics); keep `pipeline/status` and `connections/check` for V1.5 admin/diagnostics; delete `trends/summary` (the non-summary version covers the use case).
3. **Priority of #4 vs #14** — does the numeric-coherence coercer in `brand_positioning` (V1 fix for hallucinated deltas) come before Comparison Sets (V2 feature)? My vote: yes — fixing trust today beats new features tomorrow.

---

## 7. Updated workplan summary (one-sheet for ROADMAP)

For the next 2 weeks:

**Week 1 (May 2-9):**
- Will: Items 3, 4, 5 (dark metrics, coercer, zero-follower guard)
- Joanna: Items 6-11 (mount alert feed, welcome banner, priority rationale, raw_inputs disclosure, brand chips, per-brand recency)
- Together: Pick #12 endpoint cleanup decisions

**Week 2 (May 9-16):**
- Will: Item 13 (admin pending-scrapes), start Item 14 (comparison sets schema + backfill)
- Joanna: B0 burner account procurement + pre-warm
- Together: Field a couple real customer onboardings to test the full flow

**Week 3+ (post-launch):**
- Comparison sets phase 2 + 3 (William)
- Snapshot table + sparklines (William)
- Merchant-side scrapers (Joanna + William)
