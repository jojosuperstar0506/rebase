# Status update — Will's working session
**Date:** 2026-04-23
**For:** Joanna
**Thread:** continues `WILLIAM-TO-JOANNA-2026-04-23.md`

---

## TL;DR

While you set up the burner account, I'm using this window to fix three real bugs in the **scoring layer** that we identified would otherwise bake errors into the AI pipelines we're about to build. I'm pausing `brand_positioning_pipeline.py` until scoring is sound. No changes to your scraper code or the YAML config — those stay yours until you push.

---

## Why scoring before AI

Quick context (in case you didn't catch the last thread): we re-prioritized. The `brand_positioning_pipeline` and `gtm_content_pipeline` both consume the 12 metric scores as input. If WTP is wrong because of a hardcoded ¥350 handbag baseline, the AI verdict reads *"Nike has weak pricing"* — confidently, in Chinese — when the real story is "we have no pricing data for Nike." That kind of failure mode erodes customer trust faster than a missing feature.

So: fix scoring foundation first. Build AI on top. ~3 hours of solo Python work.

## What I'm doing in this session

### 🔧 Commit 1 — Category-aware WTP baselines (in progress)
Replace the hardcoded `CATEGORY_AVG_PRICE = 350` and `CATEGORY_AVG_VOLUME = 2000` in `scoring_pipeline.py` with a per-category lookup driven by `workspace.brand_category`.

- Creating new `services/competitor_intel/category_baselines.py` as the single source of truth
- Categories supported initially: 女包 / 男包 / 箱包配件 / 鞋类 / 服饰 / 其他 (matching the frontend dropdown) plus a sportswear baseline so Nike workspace stops getting handbag thresholds
- Falls back to "median of tracked competitors" if category is unknown — self-tuning over time
- Bumps WTP `METRIC_VERSION` to v1.2 so we can tell old rows from new

### 🔧 Commit 2 — Stop zero-pollution in domain rollups
Fix the "every Nike brand shows product_domain = 30" pattern. Root cause: `domain_aggregation_pipeline` excludes literal-zero scores from the mean but doesn't recognize *default* values like WTP's `score=50` (the "no_price_data" fallback). Those defaults still drag the rollup down.

Fix: read `raw_inputs.reason` from each component metric. If it's `no_data` / `no_price_data` / `no_product_data`, exclude from the mean too. Real low scores still count.

### 🔧 Commit 3 — Generalize design_vision keyword lists
The current `STYLE_KEYWORDS` and `MATERIAL_KEYWORDS` in `design_vision_pipeline.py` are hand-curated for fashion (极简 / 真皮 / 帆布 etc.). For sportswear they miss "breathable / mesh / carbon plate." For skincare they miss everything.

Fix: per-category keyword sets in `category_baselines.py`. Falls back to the current fashion list if category is unknown. No accuracy regression for existing OMI workspace.

## What I am NOT touching

Per our agreement:
- Anything under `services/competitor_intel/scrapers/` — that's your domain
- `scraping_rules.yml` and `scraping_config.py` (still on your worktree, not in git yet)
- `backend/server.js` `SCRAPER_ENABLED` gate (your edit, not in git yet)
- DB cookie state, your local profile, your Mac

If you push your worktree to `jo/scraping-hardening` while I'm working, I'll context-switch to review it within an hour.

## Open question — does this affect your timing?

Nothing in my work blocks your scraper resumption. When the burner Mac Mini is set up and you're ready to scrape XHS again:

1. Pull main — your scrape data will land in scoring v1.2 (better baselines)
2. Domain rollups will be cleaner, especially for non-handbag workspaces
3. Design DNA scores for OMI may shift slightly because the keyword loader is now in a config file — values themselves unchanged for 女包

Net: no breaking changes for OMI workspace. Should be invisible to you on resume.

## What's next after these 3 commits

I'm holding off on the bigger pieces until your branch lands:

| Item | Blocked on |
|---|---|
| §4 P1 rate-limit enforcement in `scrape_runner.py` | Your `scraping_config.py` — I can't import what doesn't exist in main |
| `brand_positioning_pipeline.py` (Brief verdict + 3 moves) | Wants stable scoring + ideally 2 weeks of real scrape history to compute deltas |
| `gtm_content_pipeline.py` (Douyin scripts) | Same as above + ideally 1 paired session with you on the prompt |
| `white_space_pipeline.py` | Same |
| `product_opportunity_pipeline.py` | Same |
| `007_scraper_daily_cap.sql` migration | Your decision on per-connection cap value |

So once your branch is up and you've got the burner account live, we have a clean fork: I focus on AI pipelines, you focus on enabling/iterating scrapers.

## Process note

I'll commit each scoring fix separately so you can review one diff at a time when you have bandwidth — they're not stacked. Three small reviewable commits beats one 800-line monster.

---

*Will keep this doc updated as commits land. Ping me if you want to redirect.*
