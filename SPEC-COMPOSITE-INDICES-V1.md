# SPEC: Composite Indices Framework — V1

**Status:** 🔒 Locked for implementation
**Author:** Joanna (with Claude)
**Date:** 2026-05-03
**Effort:** 4-5 days of focused implementation
**Owner:** William (proposed)

---

## 0. About this doc

**This is THE source of truth for the Rebase composite-indices framework.** All design decisions, formulas, schemas, and implementation phases live here.

**Earlier docs that this supersedes (for the indices framework specifically):**
- `METRIC-LOGIC-INVESTIGATION-2026-05-02.md` §3-§5 — the original tiering discussion. Its root-cause findings on dark metrics still stand; its tier proposal is replaced by this spec.

**Earlier docs to read for context (not framework, but useful background):**
- `DATA-FLOW-AND-METRICS-ANALYSIS-2026-05-02.md` — pipeline trace + 3 critical issues + DB cleanups already applied
- `FRONTEND-BACKEND-GAP-ANALYSIS-2026-05-02.md` — endpoint inventory + workplan
- `WILL-TO-JOANNA-2026-04-30.md` — William's Day 1 + Day 2 + lifecycle handoff
- `WILLIAM-HANDOFF-2026-04-23.md` — scraper hardening context

**Independent V2 work (does not block or interact with this spec):**
- `SPEC-COMPARISON-SETS-V2.md` — workspace comparison sets / auto-segmentation. Separate concern.

---

## 1. TL;DR

Replace the user-facing surface of 16 raw scraped scores with **12 proprietary composite indices** organized in **3 pillars**. Each pillar has a hero index (always visible) plus 2-4 supporting indices (one click away). Underlying raw pipelines stay intact and become the inputs to the composite layer.

```
ANALYTICS PAGE — 3 hero numbers visible at a glance
├── 🎯 Brand Equity              HERO: Brand Heat
│     · Brand NPS · Pricing Power Index · Loyalty Index
│
├── 📣 Marketing Engine          HERO: Content Velocity Index
│     · Influencer Footprint · Search Dominance
│
└── 🚀 Commerce Engine           HERO: Hero Product Index (爆品)
      · Launch Cadence · Trend Capture · Innovation Score · Promotional Discipline
```

**Key decisions:**
- ✅ Pre-compute indices to a new `composite_indices` table (recompute on `/api/ci/run-analysis` trigger)
- ✅ Index name first on UI ("Brand Heat" not "BH"); customers learn the language
- ✅ Same algorithm across all consumer-brand categories; per-category baselines + hero customization handle the differences
- ✅ Versioned (`v1.0`, `v1.1`, ...) — never silently change algorithm of a published index

---

## 2. Why composite indices, not raw metrics

### The strategic argument

Today's product surface is 16 raw scraped scores. Strategic problem: **anyone can scrape XHS.** The data is commoditized. The product moat is the *algorithm we apply to the data*, not the data itself.

Three reasons composite indices are the right user-facing layer:

1. **Moat / defensibility.** "Brand NPS = 67 derived from sentiment classifier + recommendation language detection + comment depth analysis" is something competitors can't trivially replicate. "voice_volume = 42, mindshare = 35" is.

2. **Customer language.** A brand owner cites *"our NPS is 67"* in a board meeting. They do not cite *"voice_volume_score=42, mindshare=35, sentiment_pos_pct=58."* Composite scores are the language of strategic conversation.

3. **Pricing power.** "We sell the Rebase Brand Index" supports a higher price point than "we sell scraped competitor data." Same data; very different positioning.

### The trade-off accepted

Composite scores hide complexity. That's the point — but it cuts both ways:
- ✅ For users: "Our NPS dropped 8 points this week" is actionable.
- ❌ For trust: if the calc is wrong, customers don't know — they just feel something's off.

Three things make this work (all required, not optional):
1. **Show the math on demand** — every index has an "Explain this score" expandable that lists inputs + weights.
2. **Stable methodology** — once `v1.0` ships, never change the algorithm without bumping to `v1.1` and publishing a changelog.
3. **External validation (later)** — eventually benchmark our NPS against actual customer surveys.

---

## 3. The framework — 3 pillars × 12 indices

### Pillar 1 — Brand Equity *(how customers see them)*

The "perception" pillar. Tells you how the brand is regarded by its customers, regardless of what the brand does.

| Index | Hero? | Question it answers | Confidence |
|---|---|---|---|
| **Brand Heat** | 🌟 HERO | Are they gaining or losing momentum? | High — direct from voice volume + sentiment trend |
| **Brand NPS** | | Do customers recommend them? | High — proprietary classifier on Chinese UGC |
| **Pricing Power Index** | | Can they charge a premium? | High — current `wtp` becomes an input |
| **Loyalty Index** | | Do customers come back? | Medium — inferable from UGC repeat-author patterns |

### Pillar 2 — Marketing Engine *(how they create demand)*

The "tactics" pillar. Tells you how the brand is running its demand-generation playbook.

| Index | Hero? | Question it answers | Confidence |
|---|---|---|---|
| **Content Velocity Index** | 🌟 HERO | Is their content engine running well? | High — composes content_strategy + engagement |
| **Influencer Footprint** | | Are they in the right KOL conversations? | Low until note-feed scrape enabled (post-burner) |
| **Search Dominance** | | Do they own their category's search terms? | Medium — current `keywords` pipeline is the input |

### Pillar 3 — Commerce Engine *(what they ship + sell)*

The "outcome" pillar. Tells you how their products are actually performing in market.

| Index | Hero? | Question it answers | Confidence |
|---|---|---|---|
| **Hero Product Index** (爆品) | 🌟 HERO | How strong is their hit-product engine? | Medium — composes trending_products + UGC concentration |
| **Launch Cadence** | | Are they shipping at the right pace? | High — current `launch_frequency` is the input |
| **Trend Capture Index** | | Are they riding emerging trends quickly? | Medium — new pipeline; differentiator |
| **Innovation Score** | | Are they creating new vs iterating? | Medium — new pipeline; collab/limited-drop detection |
| **Promotional Discipline** | | Are they managing discounts healthily, or panic-selling? | Medium — new pipeline; sale-cadence + discount-depth |

**Total: 3 heroes always visible + 9 supporting one click away = 12 indices.**

---

## 4. Per-index spec

For each index: name (CN + EN), version, the question, the inputs, the formula sketch, the confidence today, and the drill-down "explain" structure.

### 4.1 Brand Heat (品牌热度)
**Version:** `v1.0`
**Pillar:** Brand Equity (HERO)
**Question:** "Are they gaining or losing momentum?"

**Inputs:**
- `voice_volume.score` (existing pipeline) — weight 0.40
- `consumer_mindshare.score` (existing pipeline) — weight 0.25
- Sentiment polarity trend (positive_pct vs prior period) — weight 0.20
- UGC posting volume slope (last 4 weeks) — weight 0.15

**Formula sketch:**
```
brand_heat = (
  0.40 * voice_volume_score +
  0.25 * consumer_mindshare_score +
  0.20 * normalize_to_100(sentiment_polarity_change) +
  0.15 * normalize_to_100(ugc_volume_slope)
)
```
Output: 0-100. Direction (↑/↓/→) computed from week-over-week delta when available.

**Drill-down "Explain this score":**
- "Voice volume rose +15% week-over-week"
- "Sentiment is 72% positive, up from 68% last week"
- "UGC posting volume grew from 142 to 178 posts/week"
- "Net effect: brand heat at 78, up from 71 last week"

**Confidence today:** High. All inputs exist and are working.

---

### 4.2 Brand NPS (品牌净推荐值)
**Version:** `v1.0`
**Pillar:** Brand Equity
**Question:** "Do customers recommend them?"

**Inputs:**
- Sentiment polarity classifier on UGC (existing) — weight 0.35
- Recommendation language detection (新增 — pattern matches 推荐 / 必入 / 回购 / 种草 / 安利 / 闭眼买) — weight 0.30
- Comment depth (avg comment length on brand-tagged posts) — weight 0.20
- Detractor signals (避雷 / 踩雷 / 不推荐 / 退货 mentions) — weight 0.15 (negative)

**Formula sketch:**
```
nps_proxy = (
  0.35 * (sentiment_pos_pct - sentiment_neg_pct) +
  0.30 * recommendation_language_density +
  0.20 * normalize_to_100(avg_comment_depth) -
  0.15 * detractor_signal_density
) * 2  # scale to -100 to +100 like real NPS
```
Output: -100 to +100 (matches real NPS convention; most consumer brands fall in 20-70 range).

**Drill-down:**
- "62% of UGC mentions are positive; 9% negative"
- "Recommendation phrases ('推荐', '回购', '必入') appear in 31% of mentions"
- "Detractor phrases ('避雷', '踩雷') appear in 4% of mentions"
- "Net effect: Brand NPS = 53"

**Confidence today:** High once classifier ships. Sentiment classifier already exists (`mindshare_pipeline`); recommendation/detractor pattern matchers are new but trivial.

---

### 4.3 Pricing Power Index (PPI / 溢价能力指数)
**Version:** `v1.0`
**Pillar:** Brand Equity
**Question:** "Can they charge a premium?"

**Inputs:**
- `wtp.score` (existing pipeline) — weight 0.30
- `price_positioning.score` (existing pipeline) — weight 0.30
- Sale-frequency penalty (% of time on sale, last 4 weeks) — weight 0.20 (negative)
- Value-mention sentiment ("贵但值" / "性价比" classification) — weight 0.20

**Formula sketch:**
```
ppi = (
  0.30 * wtp_score +
  0.30 * price_positioning_score +
  0.20 * (100 - sale_frequency_pct) +
  0.20 * value_mention_score
)
```
Output: 0-100. Resolves the WTP cap problem (current wtp scores cap at 100; PPI uses wider input range).

**Drill-down:**
- "Average price ¥1,280 — 47% above category baseline"
- "On sale 12% of the time (vs 28% category average) — lower discount discipline"
- "78% of value mentions describe the brand as 'premium / 值'"
- "Net PPI: 82"

**Confidence today:** High. Inputs exist; just composition layer needed.

---

### 4.4 Loyalty Index (品牌忠诚度)
**Version:** `v1.0`
**Pillar:** Brand Equity
**Question:** "Do customers come back?"

**Inputs:**
- Repeat-author UGC rate (% of UGC authors mentioning the brand more than once in trailing 90 days) — weight 0.40
- Return-purchase mentions ("回购", "再买", "二次购买") — weight 0.30
- Brand-tag persistence (avg time between same-author mentions) — weight 0.20
- Negative-experience-but-staying signals ("有点小问题但还是会买" pattern) — weight 0.10

**Formula sketch:**
```
loyalty_index = (
  0.40 * normalize_to_100(repeat_author_rate) +
  0.30 * return_purchase_mention_density +
  0.20 * brand_tag_persistence_score +
  0.10 * tolerance_signal_density
)
```
Output: 0-100.

**Drill-down:**
- "23% of UGC authors mentioned the brand 2+ times in last 90 days"
- "Return-purchase phrases appear in 18% of brand-tagged posts"
- "Avg time between same-author mentions: 47 days"
- "Net Loyalty: 64"

**Confidence today:** Medium. Requires UGC author tracking which the scraper captures but not all of it is being computed today.

---

### 4.5 Content Velocity Index (CVI / 内容动能指数)
**Version:** `v1.0`
**Pillar:** Marketing Engine (HERO)
**Question:** "Is their content engine running well?"

**Inputs:**
- Posts-per-week (last 4 weeks, weighted toward platforms with biggest reach) — weight 0.30
- Avg engagement rate per post (likes + comments + saves / followers) — weight 0.30
- Content-format diversity (mix of note types: 图文 / 视频 / 直播 / 探店) — weight 0.20
- KOL-vs-organic mix (organic UGC ratio is healthy) — weight 0.20

**Formula sketch:**
```
cvi = (
  0.30 * normalize_to_100(weighted_posts_per_week) +
  0.30 * normalize_to_100(avg_engagement_rate) +
  0.20 * content_format_entropy_score +
  0.20 * organic_ugc_ratio_score
)
```
Output: 0-100.

**Drill-down:**
- "Posting 12.3 posts/week (avg 8.5 in category) — healthy cadence"
- "Avg engagement rate 3.2% (category 2.1%) — strong"
- "Format mix: 60% 图文, 25% 视频, 15% 直播 — well-diversified"
- "47% of mentions are organic (non-KOL) — healthy"
- "Net CVI: 76"

**Confidence today:** High. Most inputs exist in `content_strategy` pipeline; some new derivations.

---

### 4.6 Influencer Footprint (KOL足迹)
**Version:** `v1.0`
**Pillar:** Marketing Engine
**Question:** "Are they in the right KOL conversations?"

**Inputs:**
- KOL tier mix (nano / micro / mid / macro distribution — healthy brands have a balanced pyramid) — weight 0.35
- KOL engagement frequency (posts per quarter from each KOL) — weight 0.25
- KOL exclusivity (% of KOLs who only post for this brand vs many) — weight 0.20
- KOL post-performance lift (KOL post engagement / org post engagement ratio) — weight 0.20

**Formula sketch:**
```
influencer_footprint = (
  0.35 * tier_balance_score +
  0.25 * normalize_to_100(avg_kol_post_frequency) +
  0.20 * exclusivity_score +
  0.20 * normalize_to_100(kol_lift_ratio)
)
```
Output: 0-100.

**Drill-down:**
- "12 KOLs active in last quarter"
- "Tier mix: 40% nano, 33% micro, 17% mid, 10% macro — pyramid shape healthy"
- "3 of the 12 KOLs are brand-exclusive (25%) — good loyalty"
- "KOL posts get 2.4× org engagement — strong lift"
- "Net Footprint: 71"

**Confidence today:** Low until note-feed scrape is enabled (post-burner). Pipeline exists (`kol_tracker`) but inputs are dark.

---

### 4.7 Search Dominance (搜索话语权)
**Version:** `v1.0`
**Pillar:** Marketing Engine
**Question:** "Do they own their category's search terms?"

**Inputs:**
- Branded keyword search share (% of category search queries containing brand name) — weight 0.40
- Owned-term ranking (avg rank for brand's strategic keywords) — weight 0.30
- Long-tail capture (% of long-tail category queries the brand appears for) — weight 0.20
- Keyword growth trend (week-over-week new keywords entered) — weight 0.10

**Formula sketch:**
```
search_dominance = (
  0.40 * branded_search_share +
  0.30 * (100 - normalize_to_100(avg_strategic_rank)) +
  0.20 * long_tail_capture_pct +
  0.10 * normalize_to_100(keyword_growth_slope)
)
```
Output: 0-100.

**Drill-down:**
- "Brand name appears in 8.2% of category search queries (+1.4% WoW)"
- "Avg rank for top 10 strategic keywords: position 4.2"
- "Captures 23% of long-tail '通勤包', '生日礼物' queries"
- "Net Dominance: 67"

**Confidence today:** Medium. `keywords` pipeline exists; new derivations needed.

---

### 4.8 Hero Product Index (爆品指数) 🆕
**Version:** `v1.0`
**Pillar:** Commerce Engine (HERO)
**Question:** "How strong is their hit-product engine?"

**Inputs:**
- Top-3-product engagement concentration (what % of brand's UGC mentions are tied to top 3 SKUs) — weight 0.30
- Hero product velocity (week-over-week growth rate of #1 SKU's mention count) — weight 0.30
- Organic 种草 rate (UGC-driven product mentions vs paid/KOL) — weight 0.25
- Sold-out signals (detection of "卖断货" / "已售罄" / "断货" / "再补货" mentions) — weight 0.15

**Formula sketch:**
```
hero_product_index = (
  0.30 * top3_concentration_score +
  0.30 * normalize_to_100(top1_velocity) +
  0.25 * organic_seeding_rate +
  0.15 * normalize_to_100(soldout_signal_density)
)
```
Output: 0-100. A brand with one viral hit scores higher than one with a wide flat catalog of mediocre sellers.

**Drill-down:**
- "Top 3 SKUs account for 68% of brand UGC mentions — strong concentration"
- "Top SKU 'Songmont 通勤包' growing +23% week-over-week"
- "62% of product mentions are organic (non-KOL) — healthy 种草 rate"
- "Sold-out signals appear in 4% of recent UGC — moderate scarcity"
- "Net Hero Product Index: 79"

**Confidence today:** Medium. `trending_products` pipeline exists; sold-out detection + per-product UGC concentration are new derivations.

---

### 4.9 Launch Cadence (上新节奏)
**Version:** `v1.0`
**Pillar:** Commerce Engine
**Question:** "Are they shipping at the right pace?"

**Inputs:**
- New SKUs per month (last 3 months avg) — weight 0.40
- Campaign-event detection (Brand Week / Anniversary / 双11 patterns) — weight 0.30
- Launch impact (avg engagement on launch posts vs baseline) — weight 0.20
- Cadence regularity (variance in inter-launch days — lower = more disciplined) — weight 0.10 (inverse)

**Formula sketch:**
```
launch_cadence = (
  0.40 * normalize_to_100(new_skus_per_month, category_baseline) +
  0.30 * campaign_event_detection_score +
  0.20 * normalize_to_100(launch_impact_ratio) +
  0.10 * (100 - cadence_variance_normalized)
)
```
Output: 0-100.

**Drill-down:**
- "Shipping 3.4 new SKUs/month (category 2.1) — fast"
- "Detected 'Brand Week' in March, 'Anniversary Drop' in April"
- "Launch posts get 1.8× baseline engagement"
- "Cadence variance low (σ=4 days) — disciplined"
- "Net Cadence: 82"

**Confidence today:** High. `launch_frequency` pipeline + product feed.

---

### 4.10 Trend Capture Index (趋势捕捉)
**Version:** `v1.0`
**Pillar:** Commerce Engine
**Question:** "Are they riding emerging trends quickly?"

**Inputs:**
- Trend-emergence lag (days from a trend's first detection in category to brand's first post about it) — weight 0.40 (inverse)
- Trend adoption rate (% of trending hashtags brand has used in trailing 30 days) — weight 0.30
- Trend-aligned launch lag (days between trend emergence and brand's first product launch tied to it) — weight 0.20 (inverse)
- Sustained trend participation (multi-touch on the same trend, vs one-and-done) — weight 0.10

**Formula sketch:**
```
trend_capture = (
  0.40 * (100 - normalize_to_100(avg_trend_emergence_lag_days)) +
  0.30 * trend_adoption_rate_pct +
  0.20 * (100 - normalize_to_100(trend_to_launch_lag_days)) +
  0.10 * sustained_trend_participation_score
)
```
Output: 0-100.

**Drill-down:**
- "On average detects trends 4.2 days after first category appearance (category avg 7.1 days)"
- "Has used 67% of trending hashtags in last 30 days"
- "Avg 12 days between trend emergence and tie-in launch"
- "Sustained participation on 8 of 10 recent trends"
- "Net Trend Capture: 73"

**Confidence today:** Medium — requires NEW trend-detection pipeline. Differentiator metric.

---

### 4.11 Innovation Score (创新评分)
**Version:** `v1.0`
**Pillar:** Commerce Engine
**Question:** "Are they creating new vs iterating?"

**Inputs:**
- Collab/limited-drop detection (mentions of "联名" / "限量" / "联合发售") — weight 0.35
- New material/silhouette diversity (entropy of design tags across last 6 months of launches) — weight 0.25
- Brand-first signals ("首发" / "全球首款" / "独家") — weight 0.25
- Distinctive feature mentions (% of UGC describing product as "novel / unusual / different") — weight 0.15

**Formula sketch:**
```
innovation_score = (
  0.35 * collab_drop_density +
  0.25 * design_diversity_entropy +
  0.25 * brand_first_signal_density +
  0.15 * distinctive_feature_mention_pct
)
```
Output: 0-100.

**Drill-down:**
- "3 collabs in last 6 months ('联名' detected with: artist X, brand Y, IP Z)"
- "Design tag entropy: 0.74 (high diversity — wide range of materials/silhouettes)"
- "First-launch signals in 12% of recent product posts"
- "18% of UGC describes products as 'unique / unusual'"
- "Net Innovation: 68"

**Confidence today:** Low — requires NEW collab-detection pipeline + design tag analysis.

---

### 4.12 Promotional Discipline (促销纪律)
**Version:** `v1.0`
**Pillar:** Commerce Engine
**Question:** "Are they managing discounts healthily, or panic-selling?"

**Inputs:**
- Sale-event frequency (% of weeks with active promotion) — weight 0.30 (inverse)
- Avg discount depth (% off when on sale) — weight 0.25 (inverse, but moderate discounts are fine)
- Price stability over time (variance of avg_price across last 90 days) — weight 0.25 (inverse)
- Sale-driven engagement spike-and-collapse pattern detection — weight 0.20 (negative — panic patterns hurt score)

**Formula sketch:**
```
promo_discipline = (
  0.30 * (100 - normalize_to_100(sale_weeks_pct)) +
  0.25 * (100 - excessive_discount_penalty(avg_discount_pct)) +
  0.25 * (100 - normalize_to_100(price_variance)) +
  0.20 * (100 - panic_pattern_score)
)
```
Output: 0-100. High score = healthy discount discipline; low = panic-selling / brand erosion.

**Drill-down:**
- "On sale 18% of weeks (category healthy range: 15-25%)"
- "Avg discount depth 22% (moderate — not eroding brand value)"
- "Price variance σ=¥45 over 90d (low — stable)"
- "No panic-pattern detected"
- "Net Promo Discipline: 76"

**Confidence today:** Medium — pricing data exists in `scraped_products`; some derivations are new.

---

## 5. Category-aware hierarchy

### The principle

**Same algorithm computes every index for every brand. Per-category configuration determines (a) what 'good' means and (b) which indices are hero vs supporting for the customer's category.**

This unlocks the cross-industry vision later. OMI's "Trend Capture Index = 78" can be compared to a sneaker brand's "Trend Capture Index = 82" — the score means the same thing.

### Schema: `services/competitor_intel/index_hierarchy.py` (new)

```python
"""
Per-category index hierarchy.

Determines which indices are hero (always visible) vs supporting (one click
away) for a customer's category. The category is read from
workspaces.brand_category at API request time.

Adding a new category:
  1. Add an entry below
  2. Pick the 3 hero indices that matter most for that category
  3. The remaining 9 fill into supporting

The hero/supporting designation is purely DISPLAY — the same 12 indices
are computed for every brand. Customers in different categories just see
different ones at the top of their dashboard.
"""

INDICES = (
    'brand_heat', 'brand_nps', 'pricing_power_index', 'loyalty_index',
    'content_velocity_index', 'influencer_footprint', 'search_dominance',
    'hero_product_index', 'launch_cadence', 'trend_capture_index',
    'innovation_score', 'promotional_discipline',
)

CATEGORY_INDEX_HIERARCHY = {
    # Default for any consumer brand category not explicitly listed
    '_default': {
        'pillars': {
            'brand_equity': {
                'hero': 'brand_heat',
                'supporting': ['brand_nps', 'pricing_power_index', 'loyalty_index'],
            },
            'marketing_engine': {
                'hero': 'content_velocity_index',
                'supporting': ['influencer_footprint', 'search_dominance'],
            },
            'commerce_engine': {
                'hero': 'hero_product_index',
                'supporting': [
                    'launch_cadence', 'trend_capture_index',
                    'innovation_score', 'promotional_discipline',
                ],
            },
        },
    },

    # ---- Joanna's existing brand_category enum coverage ----
    '女包': {  # womenswear handbags
        # _default works as-is for handbags (the framework was tuned here)
        'inherits': '_default',
    },
    '男包': {
        'inherits': '_default',
    },
    '箱包配件': {
        'inherits': '_default',
    },
    '鞋类': {  # footwear — slight emphasis on KOL footprint over launch cadence
        'pillars_override': {
            'commerce_engine': {
                'hero': 'hero_product_index',
                'supporting': [
                    'trend_capture_index',  # promoted — sneakerheads care about trends
                    'launch_cadence',
                    'innovation_score',  # collabs huge in footwear
                    'promotional_discipline',
                ],
            },
        },
    },
    '服饰': {  # apparel
        'inherits': '_default',
    },

    # ---- Future categories (placeholder structure for V1.5+) ----
    '美妆个护': {  # cosmetics + personal care
        'pillars_override': {
            'brand_equity': {
                'hero': 'brand_nps',  # NPS matters more in beauty (efficacy claims)
                'supporting': ['brand_heat', 'pricing_power_index', 'loyalty_index'],
            },
            'commerce_engine': {
                'hero': 'hero_product_index',
                'supporting': [
                    'innovation_score',  # promoted — formulation novelty drives beauty
                    'trend_capture_index',
                    'launch_cadence',
                    'promotional_discipline',
                ],
            },
        },
    },
    '食品饮料': {  # food & beverage
        'pillars_override': {
            'brand_equity': {
                'hero': 'loyalty_index',  # repeat-purchase is the game
                'supporting': ['brand_heat', 'brand_nps', 'pricing_power_index'],
            },
        },
    },
    '家居生活': {  # home goods
        'pillars_override': {
            'brand_equity': {
                'hero': 'pricing_power_index',  # price + value > novelty for kitchenware
                'supporting': ['brand_nps', 'brand_heat', 'loyalty_index'],
            },
        },
    },
    '其他': {
        'inherits': '_default',
    },
}


def get_hierarchy(brand_category: str) -> dict:
    """Return the resolved hierarchy for a category, applying inheritance."""
    cfg = CATEGORY_INDEX_HIERARCHY.get(brand_category) or CATEGORY_INDEX_HIERARCHY['_default']
    if 'inherits' in cfg:
        base = CATEGORY_INDEX_HIERARCHY[cfg['inherits']]
        return base
    if 'pillars_override' in cfg:
        result = {'pillars': dict(CATEGORY_INDEX_HIERARCHY['_default']['pillars'])}
        for pillar_name, override in cfg['pillars_override'].items():
            result['pillars'][pillar_name] = override
        return result
    return cfg
```

### Per-category baselines (separate concern)

The existing `services/competitor_intel/category_baselines.py` already provides per-category numeric baselines (e.g. "average price for 女包 = ¥587"). The composite layer reads from this when normalizing inputs. **No new file needed; just extend the existing one with any new baselines required by the new indices.**

---

## 6. Pre-compute architecture

### DB schema: `composite_indices` table (new — Migration 008)

```sql
-- backend/migrations/008_composite_indices.sql

CREATE TABLE composite_indices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL,
  index_name TEXT NOT NULL,                  -- e.g. 'brand_heat', 'pricing_power_index'
  index_version TEXT NOT NULL,               -- 'v1.0', 'v1.1', ...
  pillar TEXT NOT NULL,                      -- 'brand_equity' | 'marketing_engine' | 'commerce_engine'

  -- The number
  score NUMERIC NOT NULL,                    -- 0-100 (for most); -100 to +100 for Brand NPS

  -- The math
  inputs JSONB NOT NULL,                     -- { "voice_volume_score": 42, "sentiment_polarity_change": +0.04, ... }
  weights JSONB NOT NULL,                    -- { "voice_volume_score": 0.40, ... } — published with each version
  explain_text JSONB NOT NULL,               -- pre-rendered drill-down bullet points for UI
                                             -- e.g. { "zh": ["Voice volume...", ...], "en": [...] }

  -- Direction (for hero indices)
  direction TEXT,                            -- 'gaining' | 'steady' | 'losing' | NULL (when no prior period)
  delta NUMERIC,                             -- WoW change (NULL if no prior week)

  -- Lifecycle
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Uniqueness: latest score per (workspace, competitor, index, version) on a given day
  UNIQUE (workspace_id, competitor_name, index_name, index_version,
          (computed_at::date))
);

CREATE INDEX idx_composite_indices_workspace ON composite_indices(workspace_id, computed_at DESC);
CREATE INDEX idx_composite_indices_lookup ON composite_indices(workspace_id, competitor_name, index_name, computed_at DESC);
```

### Compute layer: `services/competitor_intel/composite_indices.py` (new)

```python
"""
Composite-index composition layer.

Reads from analysis_results (16 raw scored metrics) + scraped_products +
raw_dimensions, composes 12 user-facing indices, writes to composite_indices.

Run by: services/competitor_intel/run_analysis_for_workspace.sh
        as the FINAL stage after all raw scoring + domain aggregation.

To add a new index:
  1. Add an INDEX_DEFS entry
  2. Implement the compute_X function
  3. Bump the version if you change an existing one
  4. Add UI mapping in frontend/src/services/ciIndices.ts (new)
"""

INDEX_DEFS = {
    'brand_heat': {
        'version': 'v1.0',
        'pillar': 'brand_equity',
        'compute': compute_brand_heat,
    },
    'brand_nps': {
        'version': 'v1.0',
        'pillar': 'brand_equity',
        'compute': compute_brand_nps,
    },
    # ... 10 more
}

def compute_all_for_workspace(workspace_id: str) -> None:
    """Compute all 12 indices for every competitor in the workspace."""
    # 1. Read latest analysis_results per (metric_type, competitor)
    # 2. Read latest scraped_products + raw_dimensions
    # 3. For each competitor × index:
    #    a. Call compute_X function
    #    b. Capture inputs + weights for "explain"
    #    c. Render drill-down explain_text
    #    d. Write to composite_indices
    ...

def compute_brand_heat(competitor_data: dict) -> dict:
    """Returns { score, inputs, weights, explain_text, direction, delta }"""
    voice = competitor_data['voice_volume_score']
    mindshare = competitor_data['consumer_mindshare_score']
    sentiment_delta = competitor_data['sentiment_polarity_change']
    ugc_slope = competitor_data['ugc_volume_slope']

    score = (
        0.40 * voice +
        0.25 * mindshare +
        0.20 * normalize_to_100(sentiment_delta * 100) +
        0.15 * normalize_to_100(ugc_slope * 10)
    )

    return {
        'score': round(score, 1),
        'inputs': {
            'voice_volume_score': voice,
            'consumer_mindshare_score': mindshare,
            'sentiment_polarity_change': sentiment_delta,
            'ugc_volume_slope': ugc_slope,
        },
        'weights': {
            'voice_volume_score': 0.40,
            'consumer_mindshare_score': 0.25,
            'sentiment_polarity_change': 0.20,
            'ugc_volume_slope': 0.15,
        },
        'explain_text': {
            'zh': [
                f"声量得分 {voice} (权重 40%)",
                f"消费者心智 {mindshare} (权重 25%)",
                f"情感倾向 WoW 变化 {sentiment_delta:+.1%} (权重 20%)",
                f"UGC 量斜率 {ugc_slope:+.1%} (权重 15%)",
            ],
            'en': [
                f"Voice volume score: {voice} (weight 40%)",
                f"Consumer mindshare: {mindshare} (weight 25%)",
                f"Sentiment polarity change WoW: {sentiment_delta:+.1%} (weight 20%)",
                f"UGC volume slope: {ugc_slope:+.1%} (weight 15%)",
            ],
        },
        'direction': direction_from_delta(score, prior_score),
        'delta': score - prior_score if prior_score else None,
    }
```

### Cron / orchestrator integration

Modify `services/competitor_intel/run_analysis_for_workspace.sh` to add a final stage:

```bash
# Stage 8 (NEW): compute composite indices
echo "[Stage 8] Computing composite indices…"
python -m services.competitor_intel.composite_indices --workspace-id $WID

# Stage 9 (existing): brand_positioning_pipeline (Brief)
# ... unchanged
```

The Brief pipeline (`brand_positioning_pipeline.py`) optionally reads from `composite_indices` instead of (or in addition to) `analysis_results` for richer prompts. **Backwards-compatible** — Brief works either way.

---

## 7. API design

### New endpoint: `GET /api/ci/indices`

```
GET /api/ci/indices?workspace_id=<UUID>
```

**Response:**
```typescript
{
  workspace_brand_name: string;
  brand_category: string;
  hierarchy: {
    pillars: {
      brand_equity: {
        hero: 'brand_heat';
        supporting: ['brand_nps', 'pricing_power_index', 'loyalty_index'];
      };
      marketing_engine: { ... };
      commerce_engine: { ... };
    };
  };
  indices_by_competitor: {
    [brand_name: string]: {
      [index_name: string]: {
        score: number;
        version: string;
        pillar: 'brand_equity' | 'marketing_engine' | 'commerce_engine';
        direction: 'gaining' | 'steady' | 'losing' | null;
        delta: number | null;
        explain_text: { zh: string[]; en: string[] };
        // weights/inputs available via separate endpoint for power users:
      };
    };
  };
  computed_at: string;  // ISO timestamp
}
```

### Optional power-user endpoint: `GET /api/ci/indices/explain`

```
GET /api/ci/indices/explain?workspace_id=<UUID>&competitor=<name>&index=<name>
```

Returns `{ inputs, weights, formula_text, version, methodology_url }` for the "Show full math" expandable.

### Existing endpoints unchanged

`/api/ci/brief`, `/api/ci/analytics`, `/api/ci/library`, `/api/ci/domain-scores` continue to work as today. **The composite-indices layer is additive, not replacing.**

---

## 8. UI / Analytics restructure

### Top of Analytics page

Replace the current 12-metric grid with **3 pillar cards stacked vertically**:

```
┌─────────────────────────────────────────────────────────────────┐
│ 🎯 BRAND EQUITY                                                  │
│   Brand Heat ▲ 78  (+3 WoW)                                     │
│   ─────────────────────────────────                              │
│   Brand NPS  53   |  Pricing Power 82   |  Loyalty 64           │
│                                                                  │
│   [▾ Show all Brand Equity indices]                              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 📣 MARKETING ENGINE                                              │
│   Content Velocity ▲ 76  (+5 WoW)                                │
│   ─────────────────────────────────                              │
│   Influencer Footprint  Coverage pending  |  Search Dom. 67     │
│                                                                  │
│   [▾ Show all Marketing Engine indices]                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 🚀 COMMERCE ENGINE                                               │
│   Hero Product Index ▲ 79  (+8 WoW)                              │
│   ─────────────────────────────────                              │
│   Launch Cadence 82  |  Trend Capture 73  |  Innovation 68  |   │
│   Promo Discipline 76                                            │
│                                                                  │
│   [▾ Show all Commerce Engine indices]                           │
└─────────────────────────────────────────────────────────────────┘
```

### Each index card: hover/click → drill-down

```
┌──────────────────────────────────────────────┐
│ Brand Heat   ▲ 78                            │
│ Songmont vs CASSILE (45) · 古良吉吉 (62)    │
│                                               │
│ Why this score?                              │
│  • Voice volume score: 67 (weight 40%)       │
│  • Consumer mindshare: 35 (weight 25%)       │
│  • Sentiment polarity ↑ 4% (weight 20%)      │
│  • UGC volume ↑ 8% (weight 15%)              │
│                                               │
│  [Show full math]   v1.0                     │
└──────────────────────────────────────────────┘
```

### "Coverage pending" honest gap state

When an index has insufficient inputs (e.g. `influencer_footprint` until note-feed scrape ships), display:

```
Influencer Footprint  Coverage pending
[i] Needs note-feed scraping (next sprint)
```

Not "0".

---

## 9. Migration plan

### Step 1 — Schema (Day 1)
- Migration 008: create `composite_indices` table
- No data migration needed (table is new)
- Rollback path: `DROP TABLE composite_indices`

### Step 2 — Compute layer (Day 1-2)
- New file: `services/competitor_intel/composite_indices.py`
- New file: `services/competitor_intel/index_hierarchy.py`
- Implement compute functions for the 9 high/medium-confidence indices first
  (brand_heat, brand_nps, pricing_power_index, content_velocity_index,
  hero_product_index, launch_cadence, search_dominance, loyalty_index,
  promotional_discipline)
- Defer the 3 NEW pipelines (trend_capture, innovation_score, deeper influencer_footprint) to Step 4

### Step 3 — Orchestrator + API (Day 2-3)
- Add Stage 8 to `run_analysis_for_workspace.sh`
- Implement `GET /api/ci/indices` endpoint
- Smoke test on Songmont workspace

### Step 4 — Three new pipelines (Day 3-4)
- `trend_capture_pipeline.py` — trend-emergence lag detection
- `innovation_pipeline.py` — collab/limited-drop signal extraction
- Extend `kol_tracker_pipeline.py` to compute exclusivity + lift (when note-feed scrape ships)

### Step 5 — Frontend (Day 4-5)
- New: `frontend/src/services/ciIndices.ts` — fetch helper + types
- New: `frontend/src/components/ci/IndexCard.tsx` — single index display with drill-down
- New: `frontend/src/components/ci/PillarSection.tsx` — pillar wrapper with hero + supporting
- Refactor: `frontend/src/pages/ci/CIAnalytics.tsx` — replace top-of-page metric grid with 3 PillarSection components
- Keep existing detail/drill-down sections below for backwards compat during transition

### Step 6 — Sunset old metric grid (V1.5 — deferred)
- Once stable, remove the original 12-metric grid from CIAnalytics
- The 16 raw scored metrics in `analysis_results` stay in DB (they're the inputs)
- API endpoint `/api/ci/analytics` returns indices alongside (or instead of) raw metrics

**Total: ~5 days for a complete first cut. 9 indices live by end of Day 3; remaining 3 by Day 5.**

---

## 10. Open questions for William

1. **Cost ceiling.** The composite layer adds ~12 derivation calculations per workspace per `run-analysis` trigger. Most are arithmetic on existing scores; only the new pipelines (trend_capture, innovation) have meaningful compute. Comfortable adding to the existing ~12-second run time?

2. **NPS scale convention.** Real NPS is -100 to +100. All other indices are 0-100. UI complication: do we (a) keep NPS at its native scale and have one "weird" score, or (b) normalize NPS to 0-100 and lose the convention? My preference: (a) — NPS at -100 to +100 is the recognizable signal; UI shows it with explicit `−` prefix.

3. **First-week defaults.** When `direction` and `delta` are null (first week, no prior period), how should the UI render? My vote: show the score, hide the arrow, soft note: "Trends start appearing next week."

4. **Trend Capture detection algorithm.** This is the most novel pipeline. We need a "what's a trend?" definition — e.g. hashtag with >100% week-over-week growth in usage rate within a category. Worth a 30-min discussion before implementation.

5. **Versioning policy.** Once `v1.0` indices ship, what triggers a `v1.1` bump?
   - Algorithm change of any kind → bump (my proposal)
   - Weight tweak only → no bump (my proposal — weights are tuning, not methodology)
   - Add new input → bump
   - Drop input → bump

---

## 11. Versioning + change log convention

Every published index version lives in this doc. When an index changes:

1. Implementer modifies the compute function
2. **Bumps version in `INDEX_DEFS`** (e.g. `v1.0` → `v1.1`)
3. **Updates §4 of this spec** with the new formula
4. **Adds a row to the changelog below**
5. **Old version's data stays queryable** (rows in DB have `index_version` column)

### Changelog

| Version date | Index | From → To | Reason |
|---|---|---|---|
| 2026-05-03 | _all_ | _new_ → v1.0 | Initial spec |

---

## 12. Implementation owner + handoff

**Recommended owner:** William.

**Why:** All 12 indices are composition layers on existing pipelines + 3 new lightweight pipelines. The bulk of the work is Python composition + a new DB table + a new API endpoint + frontend components — all in William's wheelhouse.

**Joanna's role during implementation:** Validate index outputs against intuition. After each index ships, look at Songmont's score + breakdown and answer: "Does this score reflect reality?" Iterate weights if not.

**Handoff format (suggested):** See accompanying section in chat.

---

## 13. Glossary

- **Index:** A composite score (0-100, or -100 to +100 for NPS) computed from multiple raw signals using a versioned algorithm. The user-facing layer.
- **Pillar:** Organizational grouping of 3-5 related indices. UI structure, not computational.
- **Hero index:** The 1 index per pillar that's always visible. Defined per category in `index_hierarchy.py`.
- **Supporting index:** Indices visible after expanding a pillar. The 9 non-hero indices.
- **Raw signal / score:** A pipeline-computed score in `analysis_results`. Inputs to indices. Internal-facing only after V1.5.
- **Drill-down:** The "Explain this score" expandable on each index card, listing inputs + weights.
- **Methodology version:** The published version of an index's algorithm (`v1.0`, `v1.1`, ...). Stored on every row in `composite_indices`. Never silently changed.
