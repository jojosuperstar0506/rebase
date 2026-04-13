# Rebase Scoring Methodology — v1.2

> This document is the single source of truth for how every Intelligence score
> is calculated. Each scorer converts raw data into a 0-100 score. The formulas,
> weights, and thresholds in this document map 1:1 to the pipeline code.
>
> **This is Rebase's core IP.** Improve it continuously. Every change should be
> versioned, justified, and reflected in both this doc and the pipeline code.

---

## How to Read This Document

Each scorer has:
- **What it measures** — the business question it answers
- **Data inputs** — exactly what raw data feeds into the formula
- **Formula** — the scoring breakdown with weights that sum to 100
- **Thresholds** — what counts as "full marks" vs "zero" for each component
- **Known weaknesses** — honest limitations and planned improvements
- **Version history** — what changed and why

---

## Domain 1: Core Health

### 1.1 Momentum (scoring_pipeline.py)
**Version:** v1.0 | **Cost:** ¥0

**What it measures:** How fast is this brand growing across all channels?

**Data inputs:**
| Input | Source | Field |
|-------|--------|-------|
| Follower count | `scraped_brand_profiles` | `follower_count` |
| Total likes | `scraped_brand_profiles` | `engagement_metrics.total_likes` |
| Total notes/posts | `scraped_brand_profiles` | `engagement_metrics.total_notes` |
| Product catalog size | `scraped_products` | COUNT(*) last 30 days |

**Formula:**
```
follower_score  = min(100, follower_count / 100,000 * 100)     × 0.30
content_score   = min(100, total_notes / 500 * 100)             × 0.25
engagement_score = min(100, total_likes / 200,000 * 100)        × 0.30
catalog_score   = min(100, product_count / 50 * 100)            × 0.15
─────────────────────────────────────────────────────────
TOTAL = sum, clamped 0-100
```

**Thresholds:**
- 100K followers = max follower score (30pts)
- 500 notes = max content score (25pts)
- 200K likes = max engagement score (30pts)
- 50 products = max catalog score (15pts)

**Known weaknesses:**
- Thresholds are hardcoded for Chinese consumer goods brands. A luxury brand with 50K followers but very high engagement would score low.
- No time-series: measures absolute size, not growth rate (Voice Volume covers growth).

**Improvement roadmap:**
- [ ] Make thresholds category-relative (compare against workspace competitors, not absolute numbers)
- [ ] Add follower growth rate as a signal (overlaps with Voice Volume but captures different signal)

---

### 1.2 Threat Index (scoring_pipeline.py)
**Version:** v1.0 | **Cost:** ¥0

**What it measures:** How worried should YOU (the customer) be about this competitor?

**Data inputs:**
| Input | Source | Field |
|-------|--------|-------|
| Competitor avg price | `scraped_brand_profiles` | `avg_price` |
| User's price range | `workspaces` | `brand_price_range` |
| Competitor followers | `scraped_brand_profiles` | `follower_count` |
| Competitor engagement | `scraped_brand_profiles` | `engagement_metrics.total_likes` |
| Products in user's price range | `scraped_products` | WHERE price BETWEEN user_range ±30% |

**Formula:**
```
price_overlap     = 1 - |comp_mid_price - user_mid_price| / user_mid_price    × 0.35
presence_score    = min(100, followers / 100,000 * 100)                         × 0.25
engagement_score  = min(100, likes / 200,000 * 100)                             × 0.20
product_overlap   = min(100, competing_products / 20 * 100)                     × 0.20
─────────────────────────────────────────────────────────
TOTAL = sum, clamped 0-100
```

**Known weaknesses:**
- Price overlap assumes user has set a price range (falls back to 50 if not set)
- Product overlap counts scraped notes, not actual competing products
- Doesn't account for geographic overlap (same cities/markets)

**Improvement roadmap:**
- [ ] Add geographic/channel overlap signal
- [ ] Weight by growth trajectory (a small but fast-growing competitor is more threatening)

---

### 1.3 Price Power / WTP (scoring_pipeline.py)
**Version:** v1.0 | **Cost:** ¥0

**What it measures:** Can this brand charge more than the category average AND still sell?

**Data inputs:**
| Input | Source | Field |
|-------|--------|-------|
| Brand avg price | `scraped_brand_profiles` | `avg_price` or computed from products |
| Avg sales volume | `scraped_products` | AVG(sales_volume) — note: on XHS this = likes |
| Category avg price | Hardcoded | ¥350 (Chinese women's bags fallback) |
| Category avg volume | Hardcoded | 2000 units/month |

**Formula:**
```
price_premium = (comp_avg_price - 350) / 350
sales_outperformance = (avg_volume - 2000) / 2000

IF price_premium > 0 AND sales_outperformance > 0:
    score = 70 + (price_premium × 30) + (sales_outperformance × 20)
ELIF price_premium > 0:
    score = 50 + (price_premium × 25)
ELIF sales_outperformance > 0:
    score = 30 + (sales_outperformance × 20)
ELSE:
    score = 20 + max(0, price_premium × 10)
```

**Known weaknesses:**
- Category baseline is hardcoded to ¥350 (women's bags). Wrong for shoes, electronics, etc.
- "Sales volume" on XHS = note likes, not actual sales. This is a social proxy, not real commerce data.
- Needs Tmall/JD data for real WTP measurement.

**Improvement roadmap:**
- [ ] Compute category baseline dynamically from all competitors' pricing
- [ ] Add Taobao product scraper for real transaction-level pricing
- [ ] Separate "social WTP" (engagement at price point) from "commercial WTP" (actual sales)

---

## Domain 2: Consumer Intelligence

### 2.1 Keywords (keyword_pipeline.py)
**Version:** v1.0 | **Cost:** ¥0

**What it measures:** What words and themes define this brand in consumer conversation?

**Data inputs:**
| Input | Source | Field |
|-------|--------|-------|
| Recent note titles + body text | `scraped_products` | `product_name` (last 30 days) |
| Older note titles | `scraped_products` | `product_name` (30-90 days ago) |

**Formula:**
```
Extract keywords using jieba (Chinese word segmentation) — filter words < 2 chars

unique_keywords = count of distinct keywords in recent period
trending = keywords in recent but NOT in older period (or 3x frequency increase)

diversity_score = min(50, unique_keywords / 100 × 50)    — 100+ unique = 50pts
trending_score  = min(50, len(trending) × 5)              — 10+ trending = 50pts
─────────────────────────────────────────────────────────
TOTAL = sum, clamped 0-100
```

**Known weaknesses:**
- Currently only uses note TITLES. Body text would give much richer keyword signal.
- jieba without custom dictionary may mis-segment brand-specific terms.
- No TF-IDF weighting: a word appearing once scores the same as one appearing 100 times.

**Improvement roadmap:**
- [ ] Include body_text from enriched notes (now available in raw_dimensions.d3.top_notes)
- [ ] Include hashtags as high-confidence keywords (added to category field)
- [ ] Add TF-IDF weighting for more meaningful keyword ranking
- [ ] Add custom jieba dictionary with brand names and category terms

---

### 2.2 Consumer Mindshare (mindshare_pipeline.py)
**Version:** v1.2 | **Cost:** ¥0

**What it measures:** How strongly do consumers associate with and engage around this brand?

**Data inputs:**
| Input | Source | Field |
|-------|--------|-------|
| Total likes (all platforms) | `scraped_brand_profiles` | `engagement_metrics.total_likes` |
| Total notes | `scraped_brand_profiles` | `engagement_metrics.total_notes` |
| Sentiment keywords | `scraped_brand_profiles` | `raw_dimensions.d6.positive/negative_keywords` |
| Avg comments per note | `scraped_products` | AVG(review_count) last 30 days |
| UGC notes from search | `raw_dimensions.d3` | top_notes with engagement |

**Formula:**
```
engagement_share = this_brand_likes / sum_all_competitor_likes × 100

engagement_score   = min(35, engagement_share / 30 × 35)           — 30%+ share = 35pts
ugc_volume_score   = min(30, this_brand_notes / max_competitor_notes × 30)   — top = 30pts
sentiment_score    = sentiment_ratio × 20                          — 100% positive = 20pts
comment_depth_score = min(15, avg_comments / 50 × 15)             — 50+ avg = 15pts
─────────────────────────────────────────────────────────
TOTAL = sum, clamped 0-100
```

**Known weaknesses:**
- Sentiment is based on keyword matching against 26 hardcoded words — not real NLP.
- "Engagement share" treats all likes equally (a KOL reshare ≠ organic like).
- Comment depth only counts quantity, not quality/sentiment of comments.

**Improvement roadmap:**
- [ ] Use real consumer comments (now available in raw_dimensions.d6.consumer_comments) for LLM sentiment analysis
- [ ] Classify comments as positive/negative/neutral using Haiku (~¥0.5/run)
- [ ] Weight engagement by source: organic UGC > brand post > KOL sponsored

---

## Domain 3: Product Intelligence

### 3.1 Hot Products / Trending (product_ranking_pipeline.py)
**Version:** v1.1 | **Cost:** ¥0

**What it measures:** Which content/products are performing best right now?

**Data inputs:**
| Input | Source | Field |
|-------|--------|-------|
| Products/notes with engagement | `scraped_products` | sales_volume (=likes), product_name, scraped_at |

**Formula:**
```
Top 10 products by sales_volume (=likes)
New launches = products first seen < 14 days ago
Declining = products where latest engagement < 70% of previous

catalog_freshness = new_launches / total_products

freshness_score    = min(40, freshness_pct × 0.4)         — fresh catalog = 40pts
performance_score  = min(40, top_sales / 10,000 × 40)     — 10K+ engagement = 40pts
stability_score    = max(0, 20 - decline_ratio × 40)      — few declines = 20pts
─────────────────────────────────────────────────────────
TOTAL = sum, clamped 0-100
```

**Known weaknesses:**
- "Sales volume" is actually note likes on XHS. High likes ≠ high actual sales.
- Decline detection needs 2+ snapshots of the same note, which requires consistent daily scraping.

**Improvement roadmap:**
- [ ] Track engagement velocity (likes/day) not just absolute count
- [ ] Distinguish brand posts vs UGC posts in ranking
- [ ] Add tagged products from enriched notes (real product performance)

---

### 3.2 Price Positioning (price_analysis_pipeline.py)
**Version:** v1.2 | **Cost:** ¥0

**What it measures:** Where does this brand sit in the price spectrum relative to competitors?

**Data inputs (cascading priority):**
| Priority | Source | Field |
|----------|--------|-------|
| 1. Product-level prices | `scraped_products` | `price` (if available) |
| 2. Profile avg price | `scraped_brand_profiles` | `avg_price` |
| 3. Profile price range | `scraped_brand_profiles` | `price_range` (min/max) |
| 4. Douyin shop products | `raw_dimensions.d5` | `top_selling_products` |

**Formula:**
```
category_median = median of all competitors' avg prices

level_score     = position relative to category median              × 35pts max
breadth_score   = price range breadth (max-min)/min                 × 25pts max
discount_score  = 1 - avg_discount_depth / 0.5                     × 20pts max
confidence_score = based on data source quality                     × 20pts max
─────────────────────────────────────────────────────────
TOTAL = sum, clamped 0-100
```

**Known weaknesses:**
- Most data comes from profile-level averages, not per-product pricing.
- Discount detection requires original_price which XHS/Douyin rarely provide.
- Category median is computed from tracked competitors only — may not represent true market.

**Improvement roadmap:**
- [ ] Add Taobao product page scraper for real per-SKU pricing
- [ ] Use tagged products from enriched XHS notes (these link to actual store listings with prices)
- [ ] Compute category median from broader landscape, not just tracked competitors

---

### 3.3 Launch Pace (launch_tracker_pipeline.py)
**Version:** v1.1 | **Cost:** ¥0

**What it measures:** How frequently does this brand publish new content/products?

**Data inputs:**
| Input | Source | Field |
|-------|--------|-------|
| First-seen dates of notes | `scraped_products` | MIN(scraped_at) per product_id |
| Profile note count deltas | `scraped_brand_profiles` | total_notes between snapshots |

**Formula:**
```
Count new notes per ISO week over 90 days

freq_score        = min(40, avg_per_week / 5.0 × 40)      — 5+/week = 40pts
accel_score       = based on last 4 weeks vs previous 4     — accelerating = 30pts
consistency_score = based on coefficient of variation        — low CV = 30pts
─────────────────────────────────────────────────────────
TOTAL = sum, clamped 0-100
```

**Known weaknesses:**
- Depends on daily scraping continuity. A 3-day gap in scraping creates false "launch bursts."
- Can't distinguish product launches from marketing campaigns from regular posts.

**Improvement roadmap:**
- [ ] Classify note types (product launch vs campaign vs lifestyle) using hashtags + body text
- [ ] Weight actual product content higher than lifestyle posts

---

### 3.4 Design DNA (design_vision_pipeline.py)
**Version:** v1.0 | **Cost:** ¥0 (Phase 1: hashtag-based)

**What it measures:** What visual and material patterns define this brand's product aesthetic?

**Phase 1 (current):** Deterministic scoring from hashtags, product metadata, and image diversity. Zero AI cost.
**Phase 2 (future):** Upgrade to Sonnet vision model for actual image analysis of product photos — material detection, color palette, style classification.

**Data inputs:**
| Input | Source | Field |
|-------|--------|-------|
| Hashtags (style/material tags) | `scraped_products` | `category` (comma-joined hashtags) |
| Image URLs (count) | `scraped_products` | `image_urls` (list length) |
| Enriched note hashtags | `scraped_brand_profiles` | `raw_dimensions.d3.top_notes[].hashtags` |
| Enriched note image count | `scraped_brand_profiles` | `raw_dimensions.d3.top_notes[].image_count` |

**Keyword sets:**
- **STYLE_KEYWORDS** (~30 terms): 极简, minimalist, 复古, vintage, 潮流, streetwear, 经典, classic, 轻奢, luxury, 运动, sporty, 商务, office, 文艺, bohemian, ins风, trendy, etc.
- **MATERIAL_KEYWORDS** (~30 terms): 真皮, leather, 帆布, canvas, 尼龙, nylon, pu, 编织, woven, 丝绒, velvet, 棉, cotton, 羊毛, wool, etc.

**Keyword matching:** For keywords ≥2 chars: exact match OR tag starts/ends with keyword. For <2 char keywords: exact match only. This prevents false positives (e.g., "时" matching inside "时尚").

**Formula:**
```
style_found = distinct style keywords found in all hashtags
material_found = distinct material keywords found in all hashtags
style_concentration = most_frequent_tag_count / total_tag_count
avg_images = total_images / total_notes

diversity_score    = min(30, n_styles / 5 × 30)              — 5+ styles = 30pts
material_score     = min(25, n_materials / 3 × 25)            — 3+ materials = 25pts
consistency_score  = bell curve around ideal=0.25 concentration × 25pts max
richness_score     = min(20, avg_images / 5 × 20)             — 5+ imgs/note = 20pts
─────────────────────────────────────────────────────────
TOTAL = sum, clamped 0-100
```

**Visual consistency scoring detail:**
Uses a bell curve centered at 0.25 concentration (ideal balance of brand identity vs variety):
- `dist = |concentration - 0.25| / max(0.25, 0.75)`
- `score = max(0, 25 × (1 - dist))`
- Below 0.10: weak brand identity. Above 0.60: monotonous.

**Thresholds:**
- 5+ distinct style signals = full diversity score (30pts)
- 3+ material signals = full material score (25pts)
- 0.25 style concentration = optimal consistency score (25pts)
- 5+ images per note = full richness score (20pts)

**Known weaknesses:**
- Phase 1 relies entirely on hashtags — brands that don't tag consistently will score low.
- Style/material keyword lists are manually curated and may miss emerging trends.
- Image count ≠ image quality. A brand with many low-quality photos scores the same as one with high production value.
- Chinese keyword matching doesn't handle word boundaries perfectly (no spaces in Chinese).

**Improvement roadmap:**
- [ ] Phase 2: Send product images to Sonnet vision for real material/style classification
- [ ] Expand keyword dictionaries with category-specific terms
- [ ] Add color palette extraction from product images
- [ ] Cross-reference with enriched note tagged_products for product-level design signals

---

## Domain 4: Marketing Intelligence

### 4.1 Voice Volume (voice_volume_pipeline.py)
**Version:** v1.0 | **Cost:** ¥0

**What it measures:** How fast is this brand's online presence growing?

**Data inputs:**
| Input | Source | Field |
|-------|--------|-------|
| Latest followers | `scraped_brand_profiles` | `follower_count` (latest snapshot) |
| Previous followers | `scraped_brand_profiles` | `follower_count` (2nd latest snapshot) |
| Latest engagement | `scraped_brand_profiles` | `engagement_metrics.total_likes` |
| Previous engagement | Same | 2nd latest snapshot |
| Latest content | `scraped_brand_profiles` | `engagement_metrics.total_notes` |

**Formula:**
```
growth_to_score(g) = max(0, min(100, 50 + g))
    — 0% growth = 50 (neutral), +50% = 100, -50% = 0

follower_component  = growth_to_score(follower_growth)     × 0.30
content_component   = growth_to_score(content_growth)      × 0.30
engagement_component = growth_to_score(engagement_growth)   × 0.40
─────────────────────────────────────────────────────────
TOTAL = sum, clamped 0-100
```

**Known weaknesses:**
- Needs 2+ snapshots to compute growth. First-ever scrape always returns 50 (neutral).
- Growth rate can be misleading for small accounts (10 → 20 followers = 100% growth).

**Improvement roadmap:**
- [ ] Add minimum threshold: ignore growth rates on accounts < 1000 followers
- [ ] Add voice share in addition to growth (% of total competitor followers)

---

### 4.2 Content Strategy (content_strategy_pipeline.py)
**Version:** v1.2 | **Cost:** ¥0

**What it measures:** How effective is this brand's content output?

**Data inputs:**
| Input | Source | Field |
|-------|--------|-------|
| Total notes | `scraped_brand_profiles` | `engagement_metrics.total_notes` |
| Total likes | `scraped_brand_profiles` | `engagement_metrics.total_likes` |
| Content type distribution | `raw_dimensions.d3` | `content_types` |
| Per-note engagement | `scraped_products` | AVG(sales_volume), AVG(review_count) |
| Profile snapshots | `scraped_brand_profiles` | last 5 snapshots for consistency |

**Formula:**
```
volume_score      = min(25, notes / max_competitor_notes × 25)      — relative = 25pts
eff_score         = min(35, engagement_per_note / 500 × 35)         — 500+ = 35pts
diversity_score   = min(20, n_content_types / 5 × 20)              — 5+ types = 20pts
consistency_score = based on CV of new notes per snapshot           — low CV = 20pts
─────────────────────────────────────────────────────────
TOTAL = sum, clamped 0-100
```

**Known weaknesses:**
- Content type classification uses title keyword matching, not actual content analysis.
- "500 engagement per note" threshold may be too high/low depending on category.

**Improvement roadmap:**
- [ ] Use hashtags from enriched notes for better content type classification
- [ ] Make engagement threshold relative to category, not absolute
- [ ] Add sponsored vs organic post distinction (now available from enriched notes)

---

### 4.3 KOL Strategy (kol_tracker_pipeline.py)
**Version:** v1.0 | **Cost:** ¥0

**What it measures:** How developed and effective is this brand's influencer/KOL ecosystem?

**Data inputs:**
| Input | Source | Field |
|-------|--------|-------|
| KOL authors (>10K followers) | `scraped_brand_profiles` | `raw_dimensions.d4.note_authors` |
| Sponsored/collab flags | `scraped_brand_profiles` | `raw_dimensions.d3.top_notes[].is_sponsored`, `brand_collab` |
| KOL follower counts | `raw_dimensions.d4` | `note_authors[].followers` or `fansCount` |

**KOL tier classification:**
| Tier | Follower range |
|------|---------------|
| Nano | 10K – 50K |
| Micro | 50K – 200K |
| Mid | 200K – 1M |
| Macro | 1M+ |

Authors below 10K followers are excluded (below KOL threshold).

**Formula:**
```
KOLs are deduplicated by user_id or nickname.
max_reach_all = highest total_reach among all competitors in workspace.

reach_score      = min(30, total_reach / max_reach_all × 30)     — relative reach = 30pts
count_pts        = min(15, kol_count / 10 × 15)                  — 10+ KOLs = 15pts
diversity_pts    = min(10, active_tiers / 3 × 10)                — 3+ tiers = 10pts
count_score      = count_pts + diversity_pts                       — combined = 25pts
sponsored_score  = min(25, sponsored_ratio / 0.20 × 25)          — 20%+ sponsored = 25pts
depth_score      = 0/4/8/14/20 based on kol_count + active_tiers  — network maturity = 20pts
─────────────────────────────────────────────────────────
TOTAL = sum, clamped 0-100
```

**Depth scoring thresholds:**
- 10+ KOLs AND 3+ active tiers → 20pts (mature, diversified network)
- 5+ KOLs → 14pts
- 2+ KOLs → 8pts
- 1 KOL → 4pts
- 0 KOLs → 0pts

**Known weaknesses:**
- KOL reach is relative to competitors in the workspace — adding/removing a competitor changes all scores.
- "Sponsored" detection relies on `is_sponsored` and `brand_collab` flags from the scraper, which may not capture all paid partnerships.
- No engagement efficiency comparison: we don't yet have per-note engagement split by KOL vs organic author.
- Named "depth" not "efficiency" because we honestly measure network size/diversity, not ROI.

**Improvement roadmap:**
- [ ] Add per-note author-level engagement data to compare KOL post performance vs organic
- [ ] Track KOL relationships over time (repeat collaborators vs one-offs)
- [ ] Add Douyin KOL data (currently XHS-only from d4 enrichment)
- [ ] Detect KOL overlap between competitors (shared influencers)

---

## Versioning Protocol

When changing ANY scoring formula:

1. **Increment METRIC_VERSION** in the pipeline file (e.g., v1.0 → v1.1)
2. **Update this document** with the new formula, thresholds, and rationale
3. **Add a version history entry** below the scorer section
4. **Do NOT delete old analysis_results rows** — they have the old version tagged

This ensures we can always compare v1.0 scores vs v1.1 scores for the same brand
and measure whether the methodology improvement actually improved signal quality.

---

## Score Interpretation Guide

| Score | Label | What It Means |
|-------|-------|---------------|
| 80-100 | Dominating | Top performer in this dimension. Protect the advantage. |
| 60-79 | Strong | Above average. Small optimizations can widen the gap. |
| 40-59 | Average | In the pack. This is a differentiable opportunity. |
| 20-39 | Weak | Competitors are ahead. Whitespace to address. |
| 0-19 | Critical | Significant gap or insufficient data. Prioritize. |

---

## Data Quality Tiers

Each scorer should eventually report a confidence level based on data quality:

| Tier | Criteria | Impact on Score |
|------|----------|-----------------|
| **High** | 200+ data points, daily scraping, profile-level aggregates | Score as-is |
| **Medium** | 50-200 data points, or profile-level only | Score ±10% uncertainty |
| **Low** | <50 data points, or stale data (>7 days old) | Flag as "low confidence" in UI |
| **None** | No data available | Score = 0, show "data pending" |

---

*Last updated: 2026-04-12 | METRIC_VERSION: v1.2*
*All 12 scorers now implemented. Next review: After Taobao scraper integration (will upgrade WTP, Pricing, Hot Products)*
