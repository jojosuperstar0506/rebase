# SPEC: Comparison Sets + Auto-Segmentation (V1.5 / V2)

**Status:** Draft for review
**Author:** Joanna (with Claude)
**Date:** 2026-05-02
**Owner suggestion:** William
**Effort estimate:** 5-7 days (1 week sprint)

---

## TL;DR

Today, a workspace = (brand + flat list of competitors). Customers can't slice their competitive landscape — Songmont vs. CASSILE looks the same as Songmont vs. COACH, even though those tell completely different stories.

**This spec proposes:** when a customer adds 10-20 competitors, the system **auto-segments** them into meaningful clusters (e.g., "国际启发品牌", "价值挑战者", "国潮新锐"), and each cluster becomes its own comparison set with its own Brief / Analytics / Library.

The customer can also create / edit / delete comparison sets manually. Segmentation is suggested, not forced.

---

## Why this matters (product reasoning)

The strategic value of competitive intel comes from **comparing yourself to the right peer group**, not "all competitors averaged together":
- **vs. International luxury** → "Are we hitting their design quality / brand prestige?"
- **vs. Domestic value challengers** → "Are we losing on price / volume?"
- **vs. New 国潮 brands** → "Are we losing the cultural narrative / Gen Z mindshare?"

Lumping all 15 competitors into one Brief averages out signal across these very different threats. The customer ends up with a generic "you're losing on voice volume" verdict that doesn't tell them which battle to fight.

**With segmentation, the same scrape data produces 3 sharper Briefs:**
- "vs International — your design quality matches but you're invisible on Xiaohongshu compared to COACH"
- "vs Value — CASSILE is winning the ¥500-800 tier; consider price adjustment"
- "vs 国潮 — 古良吉吉's UGC is 4× yours; cultural-narrative investment needed"

Same data, 3× the strategic value.

---

## Architectural context: why Option B not Option A

(See Joanna's earlier architectural review.)

**Option A** (multi-workspace per user) — schema-supported today, ships in days, but:
- "OMI" duplicated across 3 workspaces = 3× LLM cost / 3× cron load
- Renaming brand or category requires 3 edits
- Customer cognitively manages 3 separate "places" instead of 3 views of one place

**Option B** (this spec — comparison sets within ONE workspace):
- Single source of truth for company info
- Cheaper LLM cost per customer
- Auto-segmentation suggests cuts the customer might not have thought to make
- Compatible with multi-workspace later (a user with 2 actual brands like "OMI Bags" + "OMI Shoes" still gets 2 workspaces, each with its own comparison sets)

---

## Data model

### New table: `comparison_sets`

```sql
CREATE TABLE comparison_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Display
  name TEXT NOT NULL,                 -- "vs 国际启发品牌"
  name_en TEXT,                       -- "vs International inspiration"
  description TEXT,                   -- 1-line: "luxury foreign brands setting design direction"
  color TEXT,                         -- hex token for UI tags
  display_order INTEGER NOT NULL DEFAULT 0,

  -- Segmentation provenance
  segment_type TEXT NOT NULL,         -- 'auto' | 'manual' | 'all'
  segment_label TEXT,                 -- canonical label key: 'international_luxury' | 'value_challenger' | 'guochao_emerging' | 'custom'
  generated_by TEXT,                  -- 'system_v1' | 'user' | 'admin'

  -- Lifecycle
  is_active BOOLEAN NOT NULL DEFAULT true,  -- soft-delete via is_active=false; preserves history
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (workspace_id, segment_label)  -- one auto-set per label per workspace
);

CREATE INDEX idx_comparison_sets_workspace ON comparison_sets(workspace_id) WHERE is_active = true;
```

### Modified table: `workspace_competitors`

Add a join column. Each competitor can belong to MULTIPLE comparison sets (e.g., COACH is "international_luxury" AND "premium_pricing").

```sql
-- Migration: add comparison_set_id, allow many-to-many
ALTER TABLE workspace_competitors
  ADD COLUMN comparison_set_id UUID REFERENCES comparison_sets(id) ON DELETE CASCADE,
  ADD COLUMN added_by TEXT;  -- 'auto' | 'user'

-- Drop old uniqueness, add new one allowing the same brand in multiple sets
ALTER TABLE workspace_competitors DROP CONSTRAINT IF EXISTS workspace_competitors_pkey;
ALTER TABLE workspace_competitors ADD CONSTRAINT workspace_competitors_unique
  UNIQUE (workspace_id, brand_name, comparison_set_id);
```

**Backfill:** for every existing workspace, create a default comparison_set named "All competitors" (`segment_label='all'`) and re-link all `workspace_competitors` rows to it. **Zero data loss.**

### Modified tables: `weekly_briefs`, `content_recommendations`, `product_opportunities`, `white_space_opportunities`

Each gains:
```sql
ADD COLUMN comparison_set_id UUID REFERENCES comparison_sets(id) ON DELETE CASCADE;
```

**Backfill:** every existing brief is associated with the workspace's "All competitors" set. The UI can default to showing this set if no other has been generated yet.

---

## Auto-segmentation logic

The system runs segmentation when:
1. A user finishes onboarding (initial comp list submitted)
2. A user manually triggers "Re-segment my competitors" from settings
3. A user adds N≥3 new competitors after onboarding

### Approach: hybrid LLM + rule-based, with user override

**Step 1 — Enrichment.** For each competitor brand, gather signals:
- Price tier (from `scraped_brand_profiles.avg_price` if available, else config default)
- Origin (international / domestic / hybrid — inferred from name + brand metadata)
- Brand age (year founded, where known — populated as we scrape)
- Category sub-segment (luxury / mid-market / value / emerging)
- Aesthetic descriptor (from `design_vision` analysis if present)

**Step 2 — LLM clustering pass.** Call DeepSeek with:
```
Given the user's brand "{own_brand}" in category "{category}",
and these competitor brands with their signals:
  - COACH: international, luxury (¥2000+), USA, established
  - MK: international, mid-luxury (¥1500-3000), USA, established
  - CASSILE: domestic, mid-market (¥500-1000), CN, growing fast
  - 古良吉吉: domestic, premium (¥800-1500), CN, design-driven, young
  ...
Cluster these competitors into 2–4 strategically meaningful groups.
For each cluster, return:
  - Chinese label (e.g., "国际启发品牌")
  - English label
  - 1-sentence rationale ("brands defining luxury design direction the user aspires to")
  - Member brand names

Return JSON.
```

**Step 3 — Apply clustering.** For each returned cluster, create a `comparison_sets` row + link members. Keep the "All competitors" set as a fallback.

**Step 4 — User override.** UI shows clusters with: "We grouped your competitors like this. Drag to move, edit names, or click 'Keep flat'."

### Standard cluster labels (seed list — extensible)

To prevent LLM hallucination of inconsistent labels across users, ship with a curated label vocabulary:

| `segment_label` | Chinese name | When applied |
|---|---|---|
| `international_luxury` | 国际启发品牌 / 国际奢侈品 | Foreign-origin, premium price, design leadership |
| `international_value` | 国际快时尚 / 国际中端 | Foreign-origin, mid-low price, volume play |
| `domestic_value` | 价值挑战者 | Domestic, mid-low price, growing share |
| `domestic_premium` | 国货精品 | Domestic, premium price, established |
| `guochao_emerging` | 国潮新锐 | Domestic, design-driven, recent (post-2018), high social engagement |
| `niche_specialty` | 垂直品类专家 | Single-product-line focus, depth over breadth |
| `direct_competitor` | 直接竞争者 | Same price range + same category sub-segment |
| `aspirational` | 标杆品牌 | Higher-tier inspiration target |
| `custom` | (user-named) | Any user-created set |

LLM is constrained to pick from this list (or `custom`) — guarantees consistent UI tags across customers.

---

## API changes

### New endpoints

```
GET    /api/ci/comparison-sets?workspace_id=X
       → list all active comparison sets, ordered by display_order

POST   /api/ci/comparison-sets
       body: { workspace_id, name, name_en, segment_label, competitor_brand_names[] }
       → create a manual or override set

PATCH  /api/ci/comparison-sets/:id
       body: { name?, display_order?, is_active?, competitor_brand_names? }
       → rename, reorder, soft-delete, or update membership

POST   /api/ci/comparison-sets/segment
       body: { workspace_id }
       → trigger auto-segmentation (runs DeepSeek clustering, creates sets)
```

### Modified endpoints

All four V1 endpoints gain optional `?comparison_set_id=X` query param. **Default behavior:** if param absent, use the customer's primary set (display_order = 0, typically the first auto-generated cluster, with "All competitors" as the always-available fallback).

```
GET /api/ci/brief?workspace_id=X&comparison_set_id=Y
GET /api/ci/analytics?workspace_id=X&comparison_set_id=Y
GET /api/ci/library?workspace_id=X&comparison_set_id=Y
GET /api/ci/domain-scores?workspace_id=X&comparison_set_id=Y
```

---

## Pipeline changes

Each LLM pipeline must scope by `comparison_set_id`:
- `brand_positioning_pipeline.py` — generates verdict + 3 moves PER comparison_set
- `gtm_content_pipeline.py` — generates content drafts PER comparison_set
- `product_opportunity_pipeline.py` — generates product concepts PER comparison_set
- `white_space_pipeline.py` — generates white space PER comparison_set
- `domain_aggregation_pipeline.py` — rolls up scores PER comparison_set (different competitor sets → different rollups)

**Loop pattern in `run_analysis_for_workspace.sh`:**
```bash
for set_id in $(psql -t -c "SELECT id FROM comparison_sets WHERE workspace_id='$WID' AND is_active"); do
  python -m services.competitor_intel.brand_positioning_pipeline \
    --workspace-id $WID --comparison-set-id $set_id
  # ... etc for each pipeline
done
```

**Cost implication:** N comparison sets = N× LLM calls per pipeline. For a workspace with 3 sets, weekly cron = 3× brief calls + 3× content + 3× product + 3× white space = **~12 DeepSeek calls/week per workspace** (up from 4). At DeepSeek pricing this is still well under $0.50/customer/month, but worth flagging.

**Mitigation if cost becomes a concern:** charge per-comparison-set in pricing, or default to 2 sets max (auto + "All competitors") with users paying to add more.

---

## Frontend changes

### Brief / Analytics / Library tabs

Add a comparison-set switcher above the content area:
```
┌────────────────────────────────────────────┐
│  [国际启发 ▼] [价值挑战者] [国潮新锐] [+ New]  │  ← tabs/pills
├────────────────────────────────────────────┤
│  Brief content for currently selected set │
└────────────────────────────────────────────┘
```

When user clicks a different tab → fetch with `?comparison_set_id=`. Local state preserves last-selected set per workspace.

### Onboarding flow

After the user enters their brand + competitors, add a step:
```
"We grouped your 12 competitors into 3 clusters that make
strategic sense for {brand_name}:

  ✦ 国际启发品牌  (4)  COACH, MK, Kipling, 小CK
  ✦ 价值挑战者     (5)  La Festin, NUCELLE, FOXER, ...
  ✦ 国潮新锐        (3)  古良吉吉, 裘真, 西木汀

[Looks good — generate my first Brief]
[Let me adjust →]"
```

If user clicks "Let me adjust", they go to a drag-and-drop view to move brands between clusters, rename clusters, or "Keep flat (one Brief vs all competitors)".

### CI Settings page

New section: "Manage comparison sets". List active sets with:
- Edit name / description
- Manage members (add/remove brands)
- Delete (soft, sets `is_active=false`)
- "Re-segment all my competitors" button (re-runs LLM clustering)

---

## Migration plan (zero-downtime)

1. **Migration 007 — additive:** create `comparison_sets` table, add nullable `comparison_set_id` column to `workspace_competitors` and the 4 brief tables.
2. **Backfill script:** for every existing workspace, create one `comparison_sets` row with `segment_label='all'`, name `"全部竞品"` / `"All competitors"`, then update all dependent rows to point to it.
3. **Switch reads:** API endpoints accept optional `comparison_set_id`; default to the workspace's primary set if absent. **Old clients keep working.**
4. **Make column NOT NULL:** once all rows are backfilled, alter `comparison_set_id` to NOT NULL on the dependent tables.
5. **Ship auto-segmentation:** deploy the segmentation pipeline. Run for existing customers via admin trigger (no automatic re-segmentation of existing data — opt-in only, to avoid surprising users with a different Brief layout).

**Rollback path:** Drop NOT NULL constraint, migrate dependent rows back to "All" set, drop comparison_sets table. Zero data loss because nothing was ever destroyed.

---

## Phasing — what ships when

### Phase 1 — Schema + backfill (1.5 days)
- Migration 007
- Backfill script
- API endpoints accept `comparison_set_id` (default to "All")
- No UI yet — same behavior as today, just plumbed differently

### Phase 2 — Manual comparison sets (1.5 days)
- CI Settings page: create / edit / delete sets
- Brief / Analytics / Library tabs: comparison-set switcher
- Pipelines loop over sets in `run_analysis_for_workspace.sh`

### Phase 3 — Auto-segmentation (2 days)
- DeepSeek clustering prompt + label vocabulary
- Onboarding flow shows suggested clusters
- "Re-segment" button in settings
- Standard cluster labels seeded

### Phase 4 — Polish + measurement (1 day)
- Cost dashboard (LLM calls/comparison set/workspace)
- Telemetry: which clusters do users actually open vs. ignore
- Default-display logic refined (most-recently-viewed set sticks)

**Total: ~6 days = 1 sprint.**

---

## What this DOESN'T do (out of scope for this spec)

- Multi-workspace per user (still 1 workspace at a time; comparison sets are *within* a workspace)
- Cross-workspace comparison sets (not supported — too complex for V2, defer to V3)
- Custom segmentation rules (e.g., "auto-cluster by price tier only") — first version is LLM-driven only
- Customer-defined cluster vocabulary (locked to the seed list to keep UI consistent)
- Real-time re-clustering as a customer adds/removes competitors (re-segment is a manual button for now)

---

## Open questions for William

1. **Cost ceiling.** Comfortable with ~12 DeepSeek calls/workspace/week as the new baseline? If pricing tiers limit segments, where's the cap?
2. **Migration safety on prod data.** Migration 007 is additive but the backfill touches every existing workspace. Want a dry-run on staging first?
3. **Default cluster on first load.** When a customer lands on `/ci/brief` for the first time, do we show the auto-generated "primary" cluster or "All competitors"? The first feels more useful but is more opinionated.
4. **What happens on segment-membership changes?** If a user moves COACH from `international_luxury` → `direct_competitor`, do we (a) regenerate the affected briefs immediately (cost), (b) wait until next cron, or (c) just flag the brief as "stale" and prompt regeneration?

---

## Appendix: connection to existing code

- `services/competitor_intel/config.py` `BRAND_GROUPS` already groups OMI's 20 spec'd competitors into 3 buckets (快时尚/International, 价值挑战者, 新兴国货) — this is the same idea, but needs to migrate from dev config → DB → user-editable
- `services/competitor_intel/category_baselines.py` — category-aware baselines already work; cluster-aware baselines (different baselines per cluster) are a future extension worth considering
- `services/competitor_intel/brand_positioning_pipeline.py` — the prompt pattern William established works as a template; clustering pipeline mirrors its shape (load context → build prompt → call DeepSeek → coerce → write)
