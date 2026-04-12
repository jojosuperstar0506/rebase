# Rebase Intelligence Layer — Cofounder Plan

## What We're Building

Every brand competes across 12 measurable dimensions. Most SMB owners drown in scattered, qualitative data — social metrics here, pricing there, product rankings somewhere else. They don't have time to scrape it, and even if they did, they wouldn't know what it means.

**Rebase Intelligence converts that noise into 12 quantitative scores (0–100)**, organized across 4 domains. Each score tells the owner: "Here's exactly where you stand vs your competitors, and here's what it means."

---

## The 12 Scorers — Current Status

### Domain 1: Core Health (3 scorers)
| Scorer | What It Measures | Score Logic | Status |
|--------|-----------------|-------------|--------|
| **Momentum** | How fast is this brand growing? | Weighted: followers (30%) + content output (25%) + engagement (30%) + catalog size (15%) | ✅ Live |
| **Threat Index** | How worried should you be? | Price overlap (35%) + social presence (25%) + engagement strength (20%) + product overlap (20%) | ✅ Live |
| **Price Power (WTP)** | Can they charge more and still sell? | Price premium vs category avg × sales volume — high price + high sales = high score | ✅ Live |

### Domain 2: Consumer Intelligence (2 scorers)
| Scorer | What It Measures | Score Logic | Status |
|--------|-----------------|-------------|--------|
| **Keywords** | What words define this brand? | Keyword diversity (50pts) + trending terms (50pts) via jieba segmentation of content titles | ✅ Live |
| **Consumer Mindshare** | How do consumers perceive this brand? | Social engagement share (35pts) + UGC volume (30pts) + sentiment signal (20pts) + comment depth (15pts) | ✅ Live |

### Domain 3: Product Intelligence (4 scorers)
| Scorer | What It Measures | Score Logic | Status |
|--------|-----------------|-------------|--------|
| **Hot Products** | Which content/products are winning? | Catalog freshness (40pts) + top engagement (40pts) + stability (20pts) | ✅ Live |
| **Pricing** | Where do they sit in the price spectrum? | Price level vs category (35pts) + price range breadth (25pts) + discount signal (20pts) + data confidence (20pts) | ✅ Live |
| **Launch Pace** | How fast do they publish new content/products? | Content frequency (40pts) + acceleration trend (30pts) + consistency (30pts) | ✅ Live |
| **Design DNA** | What visual/material patterns define them? | Material tag diversity + dominant style concentration + trend alignment — *needs image data* | ⏳ Wave 2 (needs vision model) |

### Domain 4: Marketing Intelligence (3 scorers)
| Scorer | What It Measures | Score Logic | Status |
|--------|-----------------|-------------|--------|
| **Voice Volume** | How loud is this brand online? | Follower growth (30%) + content growth (30%) + engagement growth (40%) | ✅ Live |
| **Content Strategy** | How effective is their content? | Volume (25pts) + engagement efficiency (35pts) + content diversity (20pts) + posting consistency (20pts) | ✅ Live |
| **KOL Strategy** | Who promotes them and how effectively? | *Data exists in raw_dimensions D4 — needs extraction pipeline* | ⏳ Wave 2 (needs structured extraction) |

---

## Architecture

```
scraped_products ──┐
                   ├──→ Pipeline (Python) ──→ analysis_results table ──→ /api/ci/intelligence ──→ Frontend
scraped_brand_profiles ┘                      (metric_type, score/100,     (grouped by domain)     (AttributeCard
                                               raw_inputs, ai_narrative)                            with score ring)
```

**Each pipeline**:
1. Reads raw scraped data from PostgreSQL
2. Applies deterministic scoring formula (Wave 1) or LLM classification (Wave 2)
3. Writes a single row per brand per metric: `{ score: 0-100, raw_inputs: {structured data}, ai_narrative: "..." }`
4. Frontend reads generically — same card component renders any metric

**Cost model**:
- Wave 1 (8 scorers): ¥0 — pure math, jieba, sorting
- Wave 2 (4 scorers): ~¥1-10/run — Haiku for text classification, Sonnet for vision

---

## What's Live Now (10/12 scorers)

All 10 scorers run off XHS + Douyin data that our daily pipeline already collects. Zero API cost.

| Pipeline | Metric Type | Data Source | Cost |
|----------|------------|-------------|------|
| `scoring_pipeline.py` | `momentum`, `threat`, `wtp` | `scraped_brand_profiles` + `scraped_products` | ¥0 |
| `keyword_pipeline.py` | `keywords` | `scraped_products` (note titles → jieba) | ¥0 |
| `voice_volume_pipeline.py` | `voice_volume` | `scraped_brand_profiles` (2+ snapshots) | ¥0 |
| `product_ranking_pipeline.py` | `trending_products` | `scraped_products` (engagement-ranked) | ¥0 |
| `price_analysis_pipeline.py` | `price_positioning` | `scraped_brand_profiles` (avg_price, price_range, D5 shop data) | ¥0 |
| `launch_tracker_pipeline.py` | `launch_frequency` | `scraped_products` (first-seen dates) or profile delta | ¥0 |
| `mindshare_pipeline.py` | `consumer_mindshare` | `scraped_brand_profiles` (engagement share, D6 sentiment, D3 UGC) | ¥0 |
| `content_strategy_pipeline.py` | `content_strategy` | `scraped_brand_profiles` (content_metrics, D3 top notes) | ¥0 |

### Data Reframe: Social Signals as Proxies

Since our daily scrapers collect from XHS + Douyin (not Tmall/JD), we reframed 4 scorers:

| Scorer | Traditional Metric | Our Social Proxy | Why It Still Works |
|--------|-------------------|-----------------|-------------------|
| **Mindshare** | Star ratings + review count | Engagement share + sentiment keywords + comment depth | XHS comments/saves reflect real consumer perception — arguably more authentic than filtered Tmall reviews |
| **Pricing** | Product listing prices | Profile avg_price + Douyin shop prices + price_range JSONB | Profile-level pricing captures the brand's positioning even without per-SKU data |
| **Launch Pace** | New SKU first-seen dates | New note first-seen dates + profile note_count delta | On XHS, a new note IS the brand's public "launch" — product reveals, campaigns, collections |
| **Hot Products** | Unit sales volume | Note engagement (likes) | The most-liked content IS what consumers are responding to |

**Path to higher accuracy:** Add Taobao product scraper (public pages) in future sprint → scores automatically improve as richer data flows in. No pipeline code changes needed.

### What's Deferred (Wave 2)
| Pipeline | Why Deferred |
|----------|-------------|
| `design_vision_pipeline.py` (Design DNA) | Requires Sonnet vision model to analyze product images — ~¥10/run |
| `kol_tracker_pipeline.py` (KOL Strategy) | Requires KOL-specific data source not in current schema |

---

## How Scores Translate to Business Value

The scores themselves aren't the end product — they're the diagnostic. Each score maps to an actionable insight:

| Score Range | Meaning | What We Tell The Owner |
|-------------|---------|----------------------|
| 80-100 | Dominating | "You're leading here. Protect this advantage." |
| 60-79 | Strong | "Solid position. Small optimizations can widen the gap." |
| 40-59 | Average | "You're in the pack. This is a differentiable opportunity." |
| 20-39 | Weak | "Competitors are ahead. This is a whitespace to address." |
| 0-19 | Critical | "Significant gap. Prioritize this in next quarter." |

**Phase 2 (future)**: Each low-scoring metric links to a Rebase tool that helps address it directly — content generator, pricing optimizer, launch planner, etc.

---

## Technical Notes

- All pipelines write to the same `analysis_results` table with `metric_type` as the key
- Frontend is metric-agnostic: adding a new scorer = add pipeline + add entry to METRIC_CONFIG
- Scoring formulas are transparent and explainable (no black box)
- Each score includes `raw_inputs` JSON so users can drill into the data behind the number
- AI narratives (from DeepSeek) explain the score in plain language
