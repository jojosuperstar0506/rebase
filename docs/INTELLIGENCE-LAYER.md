# Rebase Intelligence Layer — Canonical Reference

> **Single source of truth** for what Rebase's intelligence layer is, what it does, what makes it different, and what every metric means.
>
> Audience: investors (read Section A only), engineers (A + B), founders (all of it).
> Last updated: 2026-05-31. Closes issue #175.

---

## Section A — Executive summary (5-min read)

### What Rebase's intelligence layer is, in one paragraph

Rebase ingests competitor data from Chinese social commerce platforms (Xiaohongshu/RedNote and Douyin), runs 12 metric pipelines + a separate scoring engine over the raw data, and turns the result into a weekly "Brief" that tells a Chinese D2C founder three things: **what changed this week, what to do about it, and which competitor to actually watch.** Today's competitor for OMI is Songmont; tomorrow it's 5–10 brands per customer. The intelligence isn't the data — it's the interpretation: "competitor X just dropped prices 12% on their hero SKU, and their content engagement is accelerating — defend your bestseller pricing this week."

### What a customer gets every week

1. **A 2-minute Brief** — verdict line ("you're holding share, but Songmont is closing on content"), 3 competitor moves with "so what" + action, 1 product opportunity, 2 ready-to-publish Douyin scripts.
2. **An always-available Intelligence dashboard** — 12 scored dimensions per competitor, click any tile to see "why this score, what changed, what to do."
3. **Signal alerts** — when a competitor crosses a threshold (price drop >10%, KOL spend up >50%, viral content moment), the founder is notified mid-week, not next Monday.

### The 3 reasons this is differentiated for Chinese D2C SMB

| # | Reason | Why it matters |
|---|---|---|
| **1** | **China-native data sources** | Klue, Crayon, Kompyte all index Western platforms (G2, Capterra, LinkedIn). They have ZERO meaningful coverage of Xiaohongshu, Douyin, or 天猫. A Chinese D2C founder needs the platforms where their actual sales happen. |
| **2** | **SMB-shaped output (Brief, not dashboard)** | Western CI tools assume a competitive-intel analyst exists on the buyer's team. Chinese D2C SMBs ($1M–50M revenue) don't have one. Rebase outputs decisions ("publish this content, defend this price"), not raw scores demanding interpretation. |
| **3** | **Two-funnel awareness** | XHS is the discovery layer (consumers searching, comparing); Douyin is the conversion layer (livestream GMV). These platforms serve different funnel stages and need different metric formulations. We split content/KOL/momentum by platform; aggregate-only tools (BrandTotal, Brand24) miss this entirely. |

### What we deliberately don't do

- **No NLP sentiment analysis** — Chinese comment text is noisy + would need a fine-tuned model. Engagement growth is a better proxy for sentiment than tone-classification we can't trust.
- **No general-purpose social listening** — Brand24, Mention, Sprout Social already do this for Western platforms. We focus on competitive intelligence (specific competitors, specific actions), not brand monitoring (any mention anywhere).
- **No brand-equity score claim** — academic consensus is that no single brand-equity model has been validated to comprehensively measure brand health ([Gutiérrez et al. 2024, systematic review of 31 models](https://www.tandfonline.com/doi/full/10.1080/23311975.2024.2433168)). We position as an **operational competitive-monitoring tool**, not a brand-equity measurement system.

### High-level diagram

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  SCRAPE      │ →  │  SCORE       │ →  │  COMPOSE     │ →  │  DELIVER     │
│              │    │              │    │              │    │              │
│ XHS via      │    │ 12 metrics × │    │ 3 domain     │    │ Weekly Brief │
│ Apify        │    │ each brand   │    │ rollups +    │    │ + Intelligence│
│ Douyin via   │    │              │    │ momentum +   │    │ page + alerts│
│ Apify (TBD)  │    │ +17 brief    │    │ threat       │    │              │
│ SYCM (manual)│    │ signals      │    │ + 12         │    │              │
│              │    │              │    │ composite    │    │              │
│              │    │              │    │ indices      │    │              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

DB layout: see [`docs/SCHEMA.md`](SCHEMA.md). Auth model: see [`docs/AUTH-MIGRATION-PLAN.md`](AUTH-MIGRATION-PLAN.md).

---

## Section B — How it works end-to-end (30-min read)

### Data sources

| Source | Coverage | Freshness | Cost per scrape |
|---|---|---|---|
| **Xiaohongshu (RedNote)** | Profile, posts, engagement, KOL relationships | Weekly (Sunday 2am cron) | $0.50–$1.00 per brand-scrape via Apify (`easyapi/rednote-*` actors) |
| **Douyin** | Profile, livestream activity (planned) | Same as XHS | TBD (no working actor yet) |
| **SYCM / 生意参谋** | Tmall ranking, sales velocity | Manual cookie refresh, declining priority | $0 (cookie-based) |

Storage: append-only `scraped_brand_profiles` and `scraped_products` tables (see SCHEMA.md Layer 2). Same brand scraped for multiple customers = one shared row, NOT duplicated. Per-customer scoring filters via `workspace_competitors` join.

### Three layers of intelligence, in order

1. **Raw scrape** — what we observed (posts, prices, follower counts, KOL collabs)
2. **Per-metric scoring** — 12 numeric scores per (workspace × competitor × metric_type), written by 12 distinct pipeline files in `services/competitor_intel/`
3. **Aggregation + interpretation** — 17 brief signals (momentum + threat + GTM flags) computed in `scoring.py`, 12 composite indices in `composite_indices.py`, narrative LLM pass in `narrative_pipeline.py`

This doc focuses on layers 2 and 3 — the "intelligence" the user actually sees. For the storage view, see `docs/SCHEMA.md`. For the scoring algorithms in detail, see `services/competitor_intel/SCORING_METHODOLOGY.md`. For the brief signals audit, see `services/competitor_intel/SIGNALS.md`.

### The 12 metrics, grouped by domain

For each metric below: **what it is** (what we measure), **why we keep it** (with framework grounding), **so-what template** (the actionable interpretation in 3 tiers), and **honest caveats** (where the metric is weaker than the score implies).

---

#### CONSUMER DOMAIN

##### 1. `consumer_mindshare` — share of conversation / spontaneous brand mentions
**Maps to:** Kantar BrandZ "Salient" pillar + Keller CBBE "Salience" foundation layer ([source](https://www.kantar.com/campaigns/brandz/methodology)). Both are textbook-canonical and MASB-certified.
**Status:** ✅ **Keep but transform.** Pure mention count understates whether the mentions are category-relevant. Keller specifies salience requires "correct" brand classification at the moment of purchase, not raw mentions.
**Recommended transform:** weight mentions by category-keyword co-occurrence — a mention only counts fully if it appears alongside a category term. Report the unweighted count too, for context.
**So-what template:**
- **>75** "You own the category conversation. Defend share-of-search on top 5 category keywords."
- **40–75** "You're in the consideration set but not the default. Invest in unaided recall via consistent positioning."
- **<40** "You're invisible at the moment of purchase. Fix awareness before optimizing conversion."

⚠️ **Overlaps with `voice_volume`** — both measure share-of-conversation. The fix below (split by intent layer) addresses this; without it, the two metrics double-count.

##### 2. `keywords` — brand association with category-defining search terms
**Maps to:** Keller's "Brand Meaning" middle layer (Performance + Imagery) + Kantar's "Meaningful" pillar.
**Status:** ✅ **Keep — strongest metric in the consumer domain.** This is what mindshare-only platforms miss. Category-keyword association IS the operationalization of "Brand Meaning."
**Recommended presentation:** Don't reduce to a single number. Report as a category-anchored heatmap (rows = competitors, columns = top 10 category keywords).
**So-what template:**
- **>75** "You own 3+ category keywords. Defend them and expand to adjacent terms."
- **40–75** "Associated with the category but not leading any keyword. Pick 1–2 to win."
- **<40** "No category anchor — your content is generic. Sharpen positioning around 1 keyword first."

---

#### PRODUCT DOMAIN

##### 3. `trending_products` — which SKUs gaining traction
**Maps to:** Practitioner CI consensus ([Klue](https://klue.com/topics/competitive-intelligence-tools-b2b-software), [Crayon](https://www.crayon.co/blog/modern-battlecard-blueprint), Kompyte, Guideflow) — "product launches" is one of four core tracked categories alongside pricing/messaging/news.
**Status:** ✅ **Keep — table-stakes.** Most universally accepted CI metric.
**Recommended transform:** Split into two sub-signals that are currently conflated: (a) **new SKU launches in last 30 days** (cadence), (b) **SKUs gaining engagement velocity** (traction). Folds in `launch_frequency` — see #6 below.
**So-what template:**
- **>75** "Competitor launched 3+ SKUs gaining traction. Get a sample, decode positioning, decide whether to respond with feature or price."
- **40–75** "Steady launch cadence, no breakout. Monitor but don't react."
- **<40** "Competitor is dormant on product. Opportunity window to own the next category trend."

##### 4. `design_profile` — visual / aesthetic positioning
**Maps to:** Aaker's "brand personality" + "perceived differentiation" (2 of his Brand Equity Ten). Keller's "Brand Imagery" sub-dimension.
**Status:** ✅ **Keep but reframe.** Academically legitimate dimension, but a single numeric score is on weak ground — the systematic review of 31 brand-equity models found **none** has been validated to comprehensively quantify perceptual dimensions ([Gutiérrez 2024](https://www.tandfonline.com/doi/full/10.1080/23311975.2024.2433168)).
**Recommended transform:** Output a comparative mood-board (3 visual samples per competitor) + a 1-line differentiation summary, NOT a 0–100 score. The score format here implies more precision than the underlying signal supports.
**So-what template:**
- **Distinct + differentiated** "Visually clear positioning — your audience will recognize your aesthetic. Protect it."
- **Similar to category leader** "You look like Y. Either you're benchmarking or you're being commoditized. Decide intentionally."
- **Visually indistinguishable from category** "Risk of commoditization — design is not a differentiator for you. Compete on price, distribution, or community instead."

##### 5. `price_positioning` — price points vs category benchmark
**Maps to:** Kantar BrandZ "Pricing Power" (the 2nd of three Powers — defined as ability to command a price premium). Aaker's #1 measure ("price-premium loyalty"). B2B CI vendors list pricing as the **#1** tracked category.
**Status:** ✅ **Keep — top-3 must-have metric.** Strongest practical metric in the framework.
**Recommended presentation:** Report as percentile within the customer's competitor set + direction-of-change flag for last 30 days.
**So-what template:**
- **>75 percentile** "You command a premium. Your brand equity is paying off. Protect it — don't discount reactively."
- **40–75** "At category median. Pricing is neutral; differentiate on something else (product, service, content)."
- **<40** "Competing on price. Either you're winning on cost OR your brand isn't justifying premium. Fix whichever is true."

##### 6. `launch_frequency` — cadence of new product introductions
**Status:** 🔀 **Merge into `trending_products`.** Cadence alone is signal-thin — 12 SKUs/month is bad if none gain traction, great if half become hits. The two metrics measure two facets of the same thing (product velocity).
**Verification note:** The "Chinese D2C beauty competitors compress launches to weeks" claim ([iClick source](https://www.i-click.com/resources/china-beauty-trends-2026-international-brands-cmo/)) **failed** adversarial verification (1-of-3 confirm). The framework should NOT anchor on a specific cadence benchmark — there's no validated industry standard.
**Migration path:** Keep the cadence calculation internally; surface it as a sub-component of `trending_products` ("Songmont: 8 launches/30d, 3 with engagement velocity >X"). Drop the standalone metric tile.

##### 7. `wtp` (willingness to pay) — should be RENAMED to `pricing_power_signal`
**Maps to:** Kantar BrandZ "Pricing Power" dimension (same as #5, complementing it).
**Critical clarification:** The metric's NAME suggests direct willingness-to-pay inference from engagement, which is academically suspect — direct WTP measurement is mainstream-rejected as "meaningless" per [Conjointly](https://conjointly.com/blog/gabor-granger-or-van-westendorp/), which is why Van Westendorp PSM and Gabor-Granger methods exist.
**But what the code actually does** ([`scoring_pipeline.py:342`](../services/competitor_intel/scoring_pipeline.py)) is sound: it compares brand avg price to a category-aware baseline, weights by sales outperformance vs that baseline, and produces a tier ladder (premium+volume / premium-only / volume-only / weak). **This is exactly the Kantar Pricing Power dimension under a misleading name.**
**Status:** ✅ **Keep the implementation, RENAME the metric.** `wtp` → `pricing_power_signal`. The name promises WTP measurement we don't actually do; the implementation is honest Pricing-Power computation.
**So-what template (using current implementation):**
- **>75 / "premium + volume" tier** "Brand commands premium AND sells well. Strongest equity position in the cohort. Protect aggressively."
- **40–75 / "premium-only" or "volume-only"** "Either you have a niche premium audience OR you sell well without premium. Both viable; pick the one to double down on."
- **<40 / "weak" tier** "Below-category price + below-category volume. Either margin is healthy and that's fine, OR you're caught in price-war territory. Investigate which."

---

#### MARKETING DOMAIN

##### 8. `voice_volume` — total content output / share of voice
**Maps to:** Binet & Field's "Extra Share of Voice" research — 171-campaign analysis found brands gain ~0.5% market share per 10% Extra SOV ([Kantar synthesis](https://www.kantar.com/inspiration/brands/using-kantar-brandz-to-make-the-case-for-long-term-brand-building-investment)). Legitimate, well-validated.
**Status:** ✅ **Keep but recognize overlap with `consumer_mindshare`.**
**Recommended differentiation:** Voice_volume = PUBLISHER-SIDE (what the competitor publishes). Mindshare = AUDIENCE-SIDE (what consumers spontaneously say back). Same denominator, different sides of the conversation. The gap between them is diagnostic.
**So-what template:**
- **Voice > Mindshare** "Competitor is over-publishing relative to audience response — you can win on content efficiency, not volume."
- **Voice ≈ Mindshare** "Balanced. Competitor's content engine works. Replicate the format mix."
- **Voice < Mindshare** "Competitor has organic momentum exceeding their spend. Study what audiences love about them — it's not the content production."

##### 9. `content_strategy` — format mix + posting consistency + engagement-per-post efficiency
**Maps to:** Hashmeta/WPIC/AmCham consensus on XHS analytics best practice ([Hashmeta source](https://hashmeta.com/blog/xiaohongshu-analytics-guide-essential-metrics-that-drive-performance/)).
**Status:** ✅ **Keep — one of the best-formulated metrics in the framework.** Combines three sub-signals that are individually meaningful and jointly diagnostic.
**CRITICAL ADDITIONS:**
1. **Must split by platform.** XHS = discovery/seeding funnel stage; Douyin = conversion/livestream-GMV stage. Aggregating engagement across them destroys the signal. ([Multiple sources confirm](https://hashmeta.com/blog/douyin-vs-xiaohongshu-the-ultimate-guide-to-social-commerce-success-in-china/) the funnel split.)
2. **On XHS specifically, weight saves > likes.** Save rate >5% on tutorial content is the strong purchase-consideration signal — stronger than likes. (This was one of the few platform-specific benchmarks that survived adversarial verification 3-of-3.)
**So-what template (per platform):**
- **>75** "Competitor has product-market-fit on their content engine. Reverse-engineer format mix + posting cadence."
- **40–75** "Normal content output. No competitive threat from content side."
- **<40** "Inconsistent or low-traction content. Opportunity to out-publish them on the platform where they're weak."

##### 10. `kol_strategy` — influencer collaboration breadth + tier mix
**Maps to:** Chinese D2C funnel structure ([iClick](https://www.i-click.com/resources/china-beauty-trends-2026-international-brands-cmo/), [Halotech](https://halotechmedia.sg/blog/koc-kol-who-drives-real-success-on-rednote/)) — KOC seeding on XHS, KOL livestreams on Douyin are table-stakes.
**Status:** ✅ **Keep — table-stakes for Chinese D2C beauty/lifestyle.** This is the single most segment-specific metric. **Rebase has an edge over Western CI tools here** — Klue/Crayon don't track KOLs because B2B SaaS doesn't use them.
**Recommended transform:** Report tier mix (top-tier KOL % / mid-tier KOC % / micro+UGC %) alongside breadth. Split by platform.
**So-what template:**
- **Heavy top-tier KOL + low mid-tier KOC** "Paid-only awareness strategy. Replicable with budget — they have no moat here."
- **Heavy mid-tier KOC + UGC** "Organic seeding strategy. Harder to replicate but more durable. Audience trust is real."
- **Low across all tiers** "Either dormant or pivoting. Investigate before assuming opportunity."

---

#### CORE / CROSS-DOMAIN

##### 11. `momentum` — aggregate growth (follower delta + engagement trend)
**Maps to:** Kantar BrandZ **"Future Power"** — probability the brand will grow value share in next 12 months. High Future Power brands are 4× more likely to grow ([Kantar](https://www.kantar.com/campaigns/brandz/methodology)).
**Status:** ✅ **Keep — most actionable single metric for weekly decisions.** Direction-of-change beats absolute level for tactical action.
**Recommended presentation:** Report as 30/60/90-day trend lines, NOT a single composite score. A composite hides the most important diagnostic — "followers growing while engagement stalling" looks identical to "balanced healthy growth" if you only see the average.
**So-what template:**
- **>75** "Competitor is accelerating. This is THE threat to track weekly. Defensive posture: protect share-of-search + bestseller pricing."
- **40–75** "Steady state. Monthly monitoring is enough."
- **<40** "Decelerating. Opportunity to take share — but verify it's not a temporary dip from a campaign pause before you commit budget."

##### 12. `threat` — composite "how worried should I be" score
**Maps to:** Crayon "Universal Battlecard" framework ([source](https://www.crayon.co/blog/modern-battlecard-blueprint)) — the structural intuition (one composite-threat-score per competitor) is exactly what mature CI tools deliver.
**Status:** ✅ **Keep in principle, but reframe as a battlecard not a score.** A composite number alone is not what founders need to act. Crayon's Universal Battlecard recommends 3 components per competitor: **why-you-win**, **objection handling**, **conversational landmines**.
**Recommended transform:** Use the composite score as the ENTRY POINT (a tile that says "threat 72 / high"), but the click-through should be a battlecard: 3–5 lines per competitor — "their strength," "their weakness," "what to do this week." This is the **single biggest opportunity in the framework** — converting 12 numeric scores into one weekly-actionable battlecard per competitor.
**So-what template:**
- **>75** "Study weekly. Defend share-of-search on contested keywords. Do not engage on price."
- **40–75** "Monitor monthly. Watch for product launches + KOL spend spikes."
- **<40** "Parked. Review quarterly."

⚠️ **Overlap with `momentum`** — threat is by definition a sum of momentum + price_positioning + trending_products. Without the battlecard reframe, it double-counts. With the reframe (interpretation, not parallel score), it's complementary.

---

## Section C — Differentiation deep-dive

### What we deliberately DON'T do, and why

| Capability | Why we skip it |
|---|---|
| **NLP / sentiment analysis on comments** | XHS/Douyin comments are noisy, mixed-language (Mandarin + English + emoji + 拼音), and would require a fine-tuned Chinese sentiment model to be useful. Engagement growth is a better-validated proxy for sentiment. Joanna's SIGNALS.md PR #171 specifically renamed `sentiment_momentum` → `engagement_momentum` to stop lying about doing NLP we don't do. |
| **Direct WTP survey methodology** (Van Westendorp / Gabor-Granger) | Requires structured customer surveys, not engagement data. Out of scope for an SMB tool — the Kantar Pricing Power proxy via `pricing_power_signal` (#7) is the right level of rigor for our buyer. |
| **Brand-equity comprehensive score** | Academic consensus ([Gutiérrez 2024](https://www.tandfonline.com/doi/full/10.1080/23311975.2024.2433168)) is that no single brand-equity model has been validated as comprehensive. Claiming we measure "brand equity" would be dishonest. We measure operational competitive signals; investors should hear "competitive monitoring tool," not "brand equity platform." |
| **Western platform coverage** (LinkedIn, G2, Facebook) | Klue and Crayon do this well. We're not better than them at their game; we're better at the China game. |

### Minimum viable metric set — what an SMB founder actually needs weekly

If we had to pick **5 metrics** that drive every weekly competitive decision a Chinese D2C founder would make:

1. **`momentum`** — direction-of-change is the most actionable single signal (Kantar Future Power)
2. **`price_positioning`** — Kantar Pricing Power proxy, weekly volatility matters
3. **`trending_products`** (merged with `launch_frequency`) — what they're shipping that's working
4. **`content_strategy` split by platform** — XHS vs Douyin must be separate
5. **`kol_strategy`** — segment-specific table-stakes for Chinese D2C

Wrapped in a per-competitor **battlecard** (Crayon Universal Battlecard pattern).

Everything else (`consumer_mindshare`, `keywords`, `design_profile`, `voice_volume`, `pricing_power_signal`, `threat`-as-composite) is **supporting context** — useful in the dashboard, not the primary weekly-decision driver.

### The biggest gap our framework has today

**Platform-split metrics.** Today the framework appears to aggregate signals across XHS and Douyin, but these platforms serve genuinely different funnel stages. XHS users "arrive with intent, searching, comparing"; Douyin users "arrive with no intent, scrolling, reacting." Douyin holds ~47% of live-commerce GMV; XHS is the discovery/seeding layer.

Every engagement-derived metric (`consumer_mindshare`, `voice_volume`, `content_strategy`, `kol_strategy`, `momentum`) should be reported per-platform with a clear funnel-stage interpretation. **This is a bigger fix than adding any new metric** — it's a presentation + storage refactor.

### Known redundancies in the current 12-metric framework

| Pair | Why it's a redundancy | Fix |
|---|---|---|
| `consumer_mindshare` + `voice_volume` | Both measure share-of-conversation | Differentiate: voice_volume = publisher-side (what competitor publishes), mindshare = audience-side (what consumers spontaneously say) |
| `launch_frequency` + `trending_products` | Both measure product velocity | Merge into `trending_products` with sub-dimensions for cadence and traction |
| `threat` + (`momentum` + `price_positioning` + `trending_products`) | Threat composite double-counts the underlying signals | Reposition threat as battlecard/interpretive layer, not parallel numeric score |

---

## Section D — Open items needing founder decision

### Where these issues come from — and why this audit matters

The 10 items below didn't appear because someone wrote bad code. Each was a reasonable call at the time it was made — usually months apart, by different sessions (Will + Joanna + their respective Claudes), reacting to a specific customer need. What accumulates is **drift between what we promise (metric names, UX labels, prompt phrasing) and what we actually measure (the code).** A metric named `sentiment_momentum` that does no NLP sentiment analysis is the canonical example — Joanna already caught and renamed that one in PR #171.

**Why this audit matters specifically right now:**
- **Investor conversations:** a claim you can't defend is worse than no claim. Saying "we measure willingness to pay" when the implementation is actually price-percentile is the kind of thing a sharp investor will catch in 5 minutes of due diligence.
- **First customers:** Chinese D2C founders are skeptical. The first time a customer asks "how do you compute X?" and the answer is "well it's not really X, it's…" — trust is gone.
- **The team itself:** without periodic audits, names lie, lies compound, and within 6 months no one (including the people who wrote it) can predict what a metric will do for a new data shape. New contributors can't onboard against a system whose labels disagree with its implementation.

The act of writing this section IS the audit. Each item below is a 5–15 min founder judgment call → 1–4 hr code change → permanent honesty gain.

### From Joanna's `SIGNALS.md` audit (PR #171) — now with deeper analysis + recommendations

#### 🟡 Caveat 1 — `livestream_activity` is misnamed

**The state today (deeper than Joanna documented):**
- The signal's input is `douyin_likes` % change PLUS a flat `+20` boost when `live_status` flips to `"live_now"`.
- `live_status` is ONLY populated by `services/competitor_intel/scrapers/douyin_scraper.py` (the legacy Playwright path) — line 251 sets it when Chinese text "直播中" is detected on the page.
- **The Playwright Douyin scraper is NOT running in production today.** The Apify Tier B path we actually use (per `docs/SCRAPING-STRATEGY.md`) doesn't pull `live_status`. There's no working Apify Douyin actor yet.
- **Net:** in production, `live_status` is always default-empty, so the `+20` boost effectively never fires. The signal is 100% Douyin-likes growth, dressed up in livestream clothing.

**Your challenge:** "is that a datapoint actually feasible to get at this stage?"
**Honest answer: NO, not today.** Three paths to fix:

| Path | Cost | Reliability | Timeline |
|---|---|---|---|
| Re-activate Playwright Douyin scraper | Free in $, high in rate-limit/auth risk | Medium (Joanna's account banned 2026-04-22 trying this) | Days to re-do, weeks to harden |
| Wait for working Apify Douyin actor | $0.50-1/scrape when available | High (matches XHS path) | Unknown — none today |
| Polling Douyin Live Center directly | Highest $, dedicated scraper | Highest accuracy | Weeks of build |

**Your challenge:** "if not, is there any angle we should look at to replace this index?"
**Yes — `douyin_engagement` is a legitimate proxy.** Livestreams drive engagement spikes regardless of whether we tag them as livestreams. A brand that's livestreaming hard shows up as elevated Douyin engagement growth — same signal, honest label.

**🔧 Recommended resolution:**
1. **Rename `livestream_activity` → `douyin_engagement_momentum`** in `scoring.py` (matches the input data, drops the misleading promise)
2. **Drop the `+20` live_status boost entirely.** It never fires in production. Code path becomes deterministic.
3. **Park "real livestream tracking" as an M2 sub-issue** under Epic #138 (proactive notifications) or wherever the Douyin actor work lands. When we have working Douyin scraping, we can add genuine livestream metrics as a SEPARATE GTM flag (e.g. `LIVESTREAM_DEBUT` = first livestream observed). Don't conflate it back into the momentum signal.

#### 🟡 Caveat 2 — `engagement_momentum` (Threat) vs `engagement_trend` (Momentum) — same input, different stories?

**Your challenge:** "are these two indices even different and telling different stories?"

I went and read both code paths to find out. They ARE different stories. The calculation shape differs:

| Signal | Input | Normalization | What it answers |
|---|---|---|---|
| `engagement_trend` (Momentum, weight 0.20) | `xhs_likes` % change | **Cohort min-max** (hottest brand → ~100, laggard → ~0) | "**Who's winning the engagement race** among the competitors I track?" |
| `engagement_momentum` (Threat, weight 0.15) | `avg_engagement` (fallback `xhs_likes`) % change | **Absolute around midpoint 50** (no comparison; `50 + growth × 2`, clamped 0-100) | "**Is THIS competitor growing on engagement at all**, regardless of others?" |

Concrete example showing they really are different:
- Brand A grows engagement +5%, in a cohort where the fastest grows +50%. Momentum's engagement_trend → ~10 (laggard). Threat's engagement_momentum → 60 (positive direction). Different stories, both true.
- Brand B grows engagement +5%, in a cohort where the fastest grows +5%. Momentum's engagement_trend → ~100 (leader). Threat's engagement_momentum → 60 (same — still just +5% absolute). Different stories, both true.

**Applying your principle** ("same input data is fine as long as we have different intelligence and calculation behind to back up our story"): this passes the test. Cohort-relative rank vs absolute trajectory genuinely shape different decisions:
- Momentum's question drives "where am I in this race" decisions (defend/attack/exit).
- Threat's question drives "is this specific competitor heating up" decisions (alert/ignore).

**Why it confused both of us:** the names are near-synonyms. `engagement_trend` and `engagement_momentum` sound interchangeable. The drift here is naming, not logic.

**Origin of the duplication (first principles answer to your question):**
- `scoring.py` predates `composite_indices.py`. When Momentum and Threat were both designed, "engagement growth" was the most actionable raw signal we had, so it ended up in both — correctly, given the dual reference frames.
- Nobody renamed `engagement_trend` to clarify it was cohort-rank, OR `engagement_momentum` to clarify it was absolute-trajectory. The implementation diverged but the names converged.

**🔧 Recommended resolution:**
1. **Keep both signals — same input, different intelligence, different story.** Passes your principle.
2. **Rename for clarity:**
   - `engagement_trend` (Momentum) → **`engagement_vs_peers`** (it's cohort-rank, say so)
   - `engagement_momentum` (Threat) → **`engagement_trajectory`** (it's direction, say so)
3. **Add explicit subtitle in the UX** so a customer never has to read the code to know which is which: "Engagement vs your competitor set" vs "Engagement direction (this brand alone)"
4. **Document the dual-frame pattern** in SIGNALS.md so the next signal we add follows the same naming convention.

#### 🟢 Caveat 3 — `price_overlap` weak fallback

**Your nod:** "fallback idea makes sense. Just give me what you revise for me to audit."

**🔧 Recommended resolution (concrete code-shaped):**

The signal stays — partial info beats no info — but we add a **confidence dimension** that flows end-to-end:

1. **In `scoring.py` `_compute_threat_breakdown`:** add `confidence: 'high' | 'low'` to the `price_overlap` raw_inputs:
   - `high` when SYCM ranking data is present (the real measurement)
   - `low` when falling back to follower-count estimate
2. **In the frontend tile:** render a small ⓘ "estimated" badge next to the price_overlap score when `confidence === 'low'`. Hover reveals "Estimated from brand scale (ranking data unavailable this scrape) — interpret with caution."
3. **In `narrative_pipeline.py`:** include the confidence in the prompt context so the LLM uses "we estimate" instead of "we observed" for low-confidence signals. Prevents the AI from over-claiming on shaky data.
4. **In `test_scoring.py`:** add two test cases — one for each branch — asserting the confidence field is set correctly. Locks the contract.

**No suppression.** Suppressing the signal when ranking data is missing means the brief loses a row whenever SYCM scraping has a bad day, which the customer reads as "your tool is broken." A confidence-tagged low-quality signal is better UX than a missing tile.

**Estimated effort:** ~2 hours of code + tests + UX badge. Mechanical.

### From this audit (composite indices / 12 metrics)

4. **Rename `wtp` → `pricing_power_signal`** in code + DB `metric_type` enum + frontend labels. The implementation is sound; the name is dishonest. (Migration risk: existing `analysis_results` rows with `metric_type='wtp'` need a backfill or a UNION in the read query.)
5. **Merge `launch_frequency` into `trending_products`** as a sub-dimension. **Decision needed:** is this worth the refactor cost given the metric already provides signal, or defer to V2?
6. **Reposition `threat` from composite score to battlecard**. **Decision needed:** keep the score AS WELL as adding the battlecard, or replace the score with the battlecard?
7. **Differentiate `voice_volume` vs `consumer_mindshare`** by intent layer (publisher-side vs audience-side). **Decision needed:** is the operational complexity (storing both, labeling them clearly in UI) worth the diagnostic value?
8. **Split metrics by platform (XHS vs Douyin) everywhere.** Largest single fix. **Decision needed:** prioritize for V1 or push to V2?
9. **Reframe `design_profile` from score to mood-board.** **Decision needed:** is the visual asset display ready (we have post images via Apify)?
10. **`keywords` as a heatmap, not a score.** **Decision needed:** does the frontend have a heatmap component, or do we need to build one?

### From this audit (composite indices / 12 metrics)

4. **Rename `wtp` → `pricing_power_signal`** in code + DB `metric_type` enum + frontend labels. The implementation is sound; the name is dishonest. (Migration risk: existing `analysis_results` rows with `metric_type='wtp'` need a backfill or a UNION in the read query.)
5. **Merge `launch_frequency` into `trending_products`** as a sub-dimension. **Decision needed:** is this worth the refactor cost given the metric already provides signal, or defer to V2?
6. **Reposition `threat` from composite score to battlecard**. **Decision needed:** keep the score AS WELL as adding the battlecard, or replace the score with the battlecard?
7. **Differentiate `voice_volume` vs `consumer_mindshare`** by intent layer (publisher-side vs audience-side). **Decision needed:** is the operational complexity (storing both, labeling them clearly in UI) worth the diagnostic value?
8. **Split metrics by platform (XHS vs Douyin) everywhere.** Largest single fix. **Decision needed:** prioritize for V1 or push to V2?
9. **Reframe `design_profile` from score to mood-board.** **Decision needed:** is the visual asset display ready (we have post images via Apify)?
10. **`keywords` as a heatmap, not a score.** **Decision needed:** does the frontend have a heatmap component, or do we need to build one?

### How to bring these to a decision

Each item is 5–15 minutes of founder-level judgment, ~1–4 hours of code work after the call. Recommend a single 90-minute sync between Will + Joanna where each open item gets a thumbs-up / thumbs-down / "defer to V2." Outputs:
- Decisions written into this doc's section D (mark each item ✅ accepted / ❌ rejected / ⏸ deferred with reasoning)
- Implementation issues opened per accepted item, linked to Epic #136

---

## Appendix — research method + sources

This audit was produced by a 5-angle deep research pass (Kantar BrandZ + Keller CBBE + Aaker BET on the framework side; Klue / Crayon / Kompyte on the CI vendor side; Hashmeta / iClick / WPIC on the Chinese D2C side; Conjointly / Springer on the WTP methodology side) with adversarial verification: 25 claims surfaced, 17 confirmed (2-of-3 or 3-of-3 votes), 8 killed.

**Killed claims worth knowing** (don't cite these in pitches):
- "Chinese D2C beauty competitors run weekly launch cadence" — refuted (single source, no validation)
- "XHS engagement-rate benchmark is 2–5%" — refuted (single source, no triangulation)
- "Florasis-style AI engagement analysis is industry-standard" — refuted (vendor marketing claim)
- "B2B CI platforms standardize on a specific data-source set" — refuted (each tool varies)
- "Consumer-based brand equity models converge on awareness/associations/quality/loyalty/emotion" — refuted (academic review found no convergence)

**Highest-confidence sources** (cite freely):
- [Kantar BrandZ methodology](https://www.kantar.com/campaigns/brandz/methodology) — MDS framework + 3 Powers (Demand, Pricing, Future)
- [Keller CBBE pyramid](https://www.mindtools.com/ajnlcxe/kellers-brand-equity-model/) — Salience → Meaning → Response → Resonance
- [Crayon Modern Battlecard Blueprint](https://www.crayon.co/blog/modern-battlecard-blueprint) — Universal Battlecard pattern (why-you-win + objections + landmines)
- [Klue B2B CI tools](https://klue.com/topics/competitive-intelligence-tools-b2b-software) — 4 tracked categories (products / pricing / messaging / news)
- [Gutiérrez 2024 systematic review of 31 brand-equity models](https://www.tandfonline.com/doi/full/10.1080/23311975.2024.2433168) — peer-reviewed, concludes no model is comprehensive
- [Conjointly: Gabor-Granger vs Van Westendorp](https://conjointly.com/blog/gabor-granger-or-van-westendorp/) — why direct WTP is unreliable

**Practitioner sources** (credible but blog-quality — corroborate before citing externally):
- Hashmeta XHS analytics: [main](https://hashmeta.com/blog/xiaohongshu-analytics-guide-essential-metrics-that-drive-performance/), [advanced](https://hashmeta.com/blog/advanced-xiaohongshu-analytics-metrics-that-matter-for-brand-success/), [competitor analysis](https://hashmeta.com/blog/xiaohongshu-competitor-analysis-benchmarking-framework-for-brand-success/), [Douyin vs XHS](https://hashmeta.com/blog/douyin-vs-xiaohongshu-the-ultimate-guide-to-social-commerce-success-in-china/)
- [iClick China beauty trends 2026](https://www.i-click.com/resources/china-beauty-trends-2026-international-brands-cmo/)
- [Brand24: share of voice methodology](https://brand24.com/blog/how-to-measure-the-share-of-voice/)

---

## Cross-references

- **DB schema** — [`docs/SCHEMA.md`](SCHEMA.md) — where each metric is stored
- **Brief signals audit** — [`services/competitor_intel/SIGNALS.md`](../services/competitor_intel/SIGNALS.md) — Joanna's audit of the 17 brief signals (separate from the 12 metrics audited here)
- **Scoring algorithms** — [`services/competitor_intel/SCORING_METHODOLOGY.md`](../services/competitor_intel/SCORING_METHODOLOGY.md) — the actual formulas
- **Architecture (April 2026 product spec)** — [`INTELLIGENCE-ARCHITECTURE-v3.md`](../INTELLIGENCE-ARCHITECTURE-v3.md) — what the user sees at the product level
- **Auth model** — [`docs/AUTH-MIGRATION-PLAN.md`](AUTH-MIGRATION-PLAN.md) — how per-customer scoping works

When this doc goes stale (you read it and something is wrong), open a PR against it. Schema doc going stale is worse than no schema doc — same applies here.
