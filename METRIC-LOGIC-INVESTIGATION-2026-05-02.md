# Metric Logic Investigation — What Should We Compute, How, and Why

**Date:** 2026-05-02
**Author:** Joanna (with Claude)
**Status:** ⚠️ **SUPERSEDED IN PART** by `SPEC-COMPOSITE-INDICES-V1.md` (2026-05-03)

> **What's still useful in this doc:** §1 (the 16-metric inventory), §2 Categories A & B (root-cause findings on dark metrics — `brand_insight` is a narrative not a score; `design_profile` + `kol_strategy` need scraper coverage), §6 (open product questions which are now answered in the indices spec).
>
> **What's superseded:** §3 (4-tier proposal), §4 (UI implications) — replaced by the 3-pillar composite-indices framework. Read the spec for the locked design.

---

## TL;DR

The 3 "dark metrics" we flagged are actually two different problems:

| Metric | Issue | Real fix |
|---|---|---|
| `brand_insight` | **Not actually broken.** Score=0 is a placeholder; rich DeepSeek narrative is in the `ai_narrative` field. **The frontend is hiding the narrative and showing the 0.** | Frontend display fix (~30 min) |
| `design_profile` | Scoring pipeline works. **Scraper isn't capturing inputs**: `material_tags`, `image_urls`, `raw_dimensions.d3.top_notes` are all empty for every brand. | Scraper coverage upgrade (post-burner work) |
| `kol_strategy` | Same root cause — **scraper isn't capturing** `raw_dimensions.d4.note_authors` / `d4.kols`. | Same — scraper coverage upgrade |

Plus a strategic question I think we should answer before we ship more metrics: **of our 16 metric types, which ones actually drive customer decisions?** Some are doing real work; others are filler.

---

## 1. The 16 metrics we currently compute

Pulled fresh from `analysis_results` for the Songmont workspace:

| # | metric_type | Songmont score | Has narrative? | Has raw_inputs? | Honest about itself? |
|---|---|---|---|---|---|
| 1 | `voice_volume` | 15 | — | ✅ | ⚠️ misleading (poisoned by zero-follower bug; fixed today) |
| 2 | `consumer_mindshare` | 35 | — | ✅ | ✅ |
| 3 | `consumer_domain` (rollup) | 26 | — | ✅ | ✅ |
| 4 | `content_strategy` | 55 | — | ✅ | ✅ |
| 5 | `design_profile` | 0 | — | ✅ (but inputs empty) | 🔴 dark — looks broken |
| 6 | `keywords` | 18 | — | ✅ | ✅ |
| 7 | `kol_strategy` | 0 | — | ✅ (but inputs empty) | 🔴 dark — looks broken |
| 8 | `launch_frequency` | 77 | — | ✅ | ✅ |
| 9 | `marketing_domain` (rollup) | 15 | — | ✅ | ⚠️ low because voice_volume poisoned it |
| 10 | `momentum` | 4 | — | ✅ | ⚠️ very low — derived from poisoned voice_volume |
| 11 | `price_positioning` | 73 | — | ✅ | ✅ |
| 12 | `product_domain` (rollup) | 72 | — | ✅ | ✅ |
| 13 | `threat` | 18 | — | ✅ | ✅ |
| 14 | `trending_products` | 36 | — | ✅ | ✅ |
| 15 | `wtp` | 100 | — | ✅ | ⚠️ capped — Songmont AND 古良吉吉 both at 100 = scoring lacks resolution |
| 16 | `brand_insight` | **0** | **✅ 145 chars** | — | 🔴 frontend shows "0", hides the narrative |

---

## 2. Three categories of issue

### Category A — `brand_insight` is a narrative, not a metric

Looking at `narrative_pipeline.py`:

```python
# This is what the pipeline writes:
INSERT INTO analysis_results
    (workspace_id, competitor_name, metric_type, metric_version, score, ai_narrative)
VALUES (%s, %s, 'brand_insight', 'v1.0', 0, %s)
```

The `0` is **literally hardcoded as a placeholder** because the row is a TEXT field disguised as a metric. The actual content is the AI-generated narrative like:

> *"松沐品牌拥有极高的支付意愿得分（100.0/100），表明其品牌溢价和消费者认可度很强，但其市场动量与威胁指数均低于50分..."*

**The frontend is showing the 0 instead of the narrative.** This is a display bug, not a data bug.

**Fix:** Either
- Don't render `brand_insight` in the metric grid (it's not numeric)
- OR render its `ai_narrative` field instead of its `score`
- Best: surface it as an **insights panel** at the top of Analytics or under each competitor's card

### Category B — `design_profile` + `kol_strategy` are dark because the scraper doesn't feed them

The pipelines work. The scraper just doesn't capture the inputs they need:

```python
# design_vision_pipeline.py expects:
- scraped_products.material_tags     # All rows: NULL
- scraped_products.image_urls        # All rows: NULL
- raw_dimensions.d3.top_notes        # Empty []

# kol_tracker_pipeline.py expects:
- raw_dimensions.d4.note_authors     # Empty []
- raw_dimensions.d4.kols             # Empty []
- raw_dimensions.d3.top_notes        # Empty []
```

Today the XHS scraper captures **profile-level stats only** (follower count, total likes). The note-feed enrichment (which would populate `top_notes`, `note_authors`, hashtags, image URLs) was scaffolded but isn't running.

**Why:** the note-feed scrape requires more navigations per brand (~20-30 extra per scrape), which would have rate-limited us even faster. After the ban, we tightened to a minimum-nav budget.

**Fix:** post-burner-account work. Once we have an account that can absorb more scrapes, enable the note-feed enrichment in the XHS scraper.

**Interim fix today:** display these metrics as `"Coverage pending — needs note-feed scrape"` instead of `0`. Honest about the gap.

### Category C — Voice-volume poisoning (already fixed)

The Issue 1 fix from today (deleting buggy zero-follower rows) addresses this. **Re-running the scoring pipeline + brief generation will produce corrected scores.** Without re-running, the 15/85 inversion still appears in the UI.

---

## 3. The bigger strategic question

**Of our 16 metrics, which actually drive customer decisions?**

Lumping all 16 onto the Analytics tab is "throwing the kitchen sink at the customer." A handbag brand owner doesn't need 16 numbers to know what to do tomorrow morning.

I propose we tier them:

### Tier 1 — Decision-driving (must show, prominent placement)

These directly answer "what should I do this week?"

| Metric | Customer question it answers | Confidence |
|---|---|---|
| `voice_volume` | Am I gaining or losing share of voice? | High (after fix) |
| `consumer_mindshare` | Are customers thinking about me? | High |
| `launch_frequency` | Are competitors out-shipping me? | High |
| `price_positioning` | Am I priced right for the market? | High |

### Tier 2 — Strategic context (show as drill-downs / context cards)

These answer "what's happening around me?"

| Metric | Customer question | Confidence |
|---|---|---|
| `trending_products` | What products are hot in my category? | Medium |
| `content_strategy` | What content patterns are working? | Medium |
| `keywords` | What search terms drive traffic in my space? | Medium |

### Tier 3 — Diagnostic / interpretive (show on demand)

These answer "should I worry about Brand X specifically?"

| Metric | Customer question | Confidence |
|---|---|---|
| `momentum` | Is this competitor gaining or losing? | Low (composite — derived) |
| `threat` | Should I worry about this competitor? | Low (composite — derived) |
| `wtp` | Is this brand premium-worthy? | Low (capped at 100; lacks resolution) |

### Tier 4 — Data not yet available (display "coverage pending")

| Metric | What's blocking | Fix path |
|---|---|---|
| `design_profile` | Note-feed scrape disabled | Post-burner |
| `kol_strategy` | Same | Post-burner |
| `brand_insight` | Frontend hides the narrative | Frontend fix today |

### Tier 5 — Internal rollups (not user-facing as line items)

These should appear as **headlines**, not as rows in a grid. The user sees them at the top of Analytics:
- `consumer_domain` → "Consumer signal"
- `product_domain` → "Product signal"
- `marketing_domain` → "Marketing signal"

Not 3 of the 16 line items.

---

## 4. Proposed UI implications

Based on the tiering above, the Analytics tab today shows 12 metrics + 3 white-space + 5 priority. I propose:

### Top of Analytics
- **3 domain headlines** (consumer / product / marketing) with own-vs-best-competitor — already there, looks great
- **New: Brand insights panel** — surface `brand_insight` narrative for each competitor as scrollable cards with the AI text. (Currently dark.)

### Tier 1 priority block
- **4 must-show metrics** front and center with bigger visualization
- "If you only look at one number" — pick the worst one for the user

### Tier 2 strategic context block
- 3 medium-priority metrics shown as smaller cards with "drill in for details"

### Tier 3 collapsible "more metrics"
- Expandable section: momentum, threat, WTP shown smaller, with explanatory tooltips

### Tier 4 honest dark badge
- "Design profile — coverage pending (next sprint)" — honest, shows the roadmap, doesn't hide the gap

---

## 5. Specific actions this raises

| # | Action | Effort | Owner | When |
|---|---|---|---|---|
| 1 | Frontend: stop showing `brand_insight` as a 0-score metric. Display `ai_narrative` as a panel. | 30 min | Joanna | Today |
| 2 | Frontend: replace 0 score with "Coverage pending" badge for `design_profile` + `kol_strategy` | 30 min | Joanna | Today |
| 3 | Trigger re-analysis on Songmont workspace so scoring picks up the cleaned scrape data | 5 min (click Refresh on live site after PR #27 is deployed) | Joanna | Today |
| 4 | Decide tier-1 / tier-2 / tier-3 metric grouping with William | discussion | Both | Next sync |
| 5 | Re-organize Analytics page per the tiering | 2-3 hrs | Joanna | After #4 |
| 6 | Enable note-feed enrichment in XHS scraper | 1 day | Joanna | Post-burner (B0) |
| 7 | Add "WTP cap" handling — when 2+ brands at 100, surface "tied at top" instead of identical 100s | 30 min | Will | V1.5 |

---

## 6. Open question for you

**Does the tiering above match how you think a brand owner reads this page?**

Specifically:
- Are voice_volume + mindshare + launch_frequency + price_positioning really the 4 that matter most? Or would you tier differently?
- Is `wtp` (willingness to pay) actually useful, or should we drop it given it caps at 100 and lacks resolution?
- Is `momentum` + `threat` (composite-derived) more useful than the underlying primitives, or just adds noise?

These are product calls, not engineering calls. Worth thinking through before we re-organize the UI.
