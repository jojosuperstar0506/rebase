# Scraping Plan — Revised, 2026-05-22

**Owner:** William
**Tracks:** [issue #62 "Make the scrape pipeline solid enough to generate a real Brief"](https://github.com/jojosuperstar0506/rebase/issues/62)
**Inputs digested:**
- Joanna's `Rebase-Scraping-Strategy (1).docx` (handed off 2026-05-22)
- Current scrapers: `services/competitor_intel/scrapers/{xhs,douyin,sycm}_scraper.py` (2,370 lines total)
- `services/competitor_intel/scraping_rules.yml` (post-ban hardening, 2026-04-22)
- Web validation of every Apify actor Joanna named (May 2026)

> **For Joanna's Claude session reading this:** read the latest `services/competitor_intel/` code before suggesting any changes. File ownership: Will owns `services/` and `backend/`; Joanna owns `frontend/`. The integration contract is the DB schema (`scraped_brand_profiles`, `scraped_products`) — do not change it without both founders signing off.

---

## 1. Goal & exit criteria

**Goal:** the daily competitor-intel pipeline produces real, complete `scraped_brand_profiles` + `scraped_products` rows for at least one prospect's competitor set — without burning maintainer time on anti-bot warfare.

**Exit criteria (V1 done when all true):**

1. One real prospect's full competitor set (5-7 brands) populates end-to-end through Apify on a daily cron.
2. A simulated cookie-expiry failure trips an alert (Slack/email) within 24 hrs and degrades gracefully — no silent zeros poisoning the brief.
3. Per-brand Apify cost is logged and visible (so we know our COGS per customer).
4. The old `xhs_scraper.py` / `douyin_scraper.py` are *not deleted* but are no longer called from the daily run.

---

## 2. Strategy summary

We adopt Joanna's three-layer model but tighten the choices:

| Layer | Purpose | Decision |
|---|---|---|
| **Layer 1 — Apify** | Public social + e-commerce (XHS, Douyin, Taobao) | **Adopt** with revised actor picks (see §3) |
| **Layer 2 — Analytics subscriptions** (chanmama, feigua, xinhong) | Douyin GMV, livestream, ad spend | **Defer until first paying customer.** ¥500-2000/mo per platform is real money. |
| **Layer 3 — Self-managed scraping** | Our own seller backends (SYCM, future Doudian) | **Keep.** Different risk profile — we are a logged-in seller, not a third party. `sycm_scraper.py` stays. |

---

## 3. Changes from Joanna's plan — what research forced us to revise

| # | Joanna's plan | Reality (validated 2026-05-22) | Our revision |
|---|---|---|---|
| 1 | XHS actor: `huggable_quote/xiaohongshu-all-in-one-scraper` | **DEPRECATED.** Apify page shows "Deprecated" header. 110 users, 0 reviews, rating 0.0, Apify itself surfaces "See alternatives" | **Use [`zhorex/rednote-xiaohongshu-scraper`](https://apify.com/zhorex/rednote-xiaohongshu-scraper)** — 144 MAU, updated daily, same author wrote the canonical 2026 XHS-signing writeup |
| 2 | Douyin actor: `natanielsantos/douyin-scraper` | **"Under maintenance"**, 2.6/5 rating (8 reviews), multiple open "all requests failing" issues, yield dropped (one report: 500 → 7 items) | **Use as primary but build a fallback path.** Don't ship Douyin to first SMB prospect without a working second source. |
| 3 | Taobao actor: `pizani/taobao-product-scraper` | 178 users, 14 MAU, no reviews — low signal but no red flags | **OK to pilot.** Single-source risk; public product data is easy to replace |
| 4 | Pricing: "XHS $4.99/1K results" | True for the dead actor only. `zhorex` is per-event: $0.010/post, $0.005/comment, $0.020/profile, $0.025/video | Cost model rebuilt around per-event pricing. ~20 brands × {1 profile + 30 posts + 10 comments} ≈ **$7-12/mo for XHS**, not $20-40 |
| 5 | Cookies last "7-30 days" | Community signal: **days, not weeks**. Cookies expire fast | Cookie refresh becomes a real ops procedure (daily monitor + weekly manual refresh on burner) |
| 6 | A1→A5 sequentially, Douyin + Taobao together in A4 | Conflates known-good (Taobao) with known-flaky (Douyin) | **Split A4** — ship Taobao before Douyin |
| 7 | Layer 2 subscriptions at ¥500-2000/mo each | We have zero paying customers | **Defer entirely until first paying customer.** |

---

## 4. Execution sequence — gated, not linear

Each step has an explicit gate that unblocks the next.

### W1 — Apify parity spike *(1 hr Will + 1 hr Claude)*

- Will signs up for Apify Free or Starter trial
- Claude writes a one-off probe script that calls `zhorex/rednote-xiaohongshu-scraper` against ONE brand (Songmont)
- Claude diffs the actor's JSON output against `XhsBrandData` schema in [services/competitor_intel/scrapers/xhs_scraper.py:67](services/competitor_intel/scrapers/xhs_scraper.py)
- **Cookies for the spike: borrow from any logged-in XHS session** (Will's, Joanna's recovered account, or skip cookie-gated modes entirely). Real burner setup is a W2 prerequisite *only if needed*.
- **Output:** a 1-page parity report. Fields present, fields missing, fields we can't get.
- **Gate:** parity ≥ 80% of fields the scoring pipeline reads → proceed to W2. If < 80% → either fix the gap or rethink the actor choice.

### W2 — `apify_client.py` wrapper + feature flag *(2-3 hrs Claude)*

- New module `services/competitor_intel/scrapers/apify_client.py`
- `class ApifyScraperClient` with methods: `scrape_xhs_brand()`, `scrape_taobao_products()`, `scrape_douyin_brand()` (last one stubbed for W6)
- Behind feature flag `USE_APIFY=true` (env var per CLAUDE.md — no hardcoding)
- Includes: per-actor cost logging, login-wall detection (fail loud, don't return empty rows), DB writes in existing `scraped_brand_profiles` / `scraped_products` shape
- **Decision point baked in:** if W1 says no-cookie modes are sufficient → ship without burner. Otherwise → burner becomes W2 prerequisite (1-2 day Joanna or Will task).
- **No changes to `scoring.py` or any of the 16 metric pipelines.**
- **Gate:** smoke test on 3 brands matches manual Apify-console runs.

### W3 — Parallel run for one week *(1 hr setup + 7 days observation)*

- ECS cron runs BOTH `xhs_scraper.py` (existing Playwright) and `apify_client.py` for the same 3-5 brands
- Writes to separate workspaces so scores can be compared
- Daily score diff log emitted
- **Gate:** Apify-sourced score drift < 5% from Playwright-sourced over 7 days → cut over. Otherwise, find and fix the mapping bug.

### W4 — Cookie ops runbook + monitor *(1-2 hrs Claude)*

- Script `services/competitor_intel/scrapers/cookie_monitor.py` pings the actor with a known query daily
- On login-wall detection: alert (Slack webhook or email via existing Resend integration), pause pipeline for that platform
- Manual refresh procedure documented in `services/competitor_intel/scrapers/COOKIE_REFRESH.md`
- **Gate:** deliberate cookie expiry triggers alert within 24 hrs.

### W5 — Taobao actor *(1 hr Claude)*

- Extend `apify_client.py` with `scrape_taobao_products()` using `pizani/taobao-product-scraper`
- Feeds the `price_analysis_pipeline.py` which is currently starved for real product price data
- **Gate:** at least one Songmont competitor has populated Taobao price data.

### W6 — Douyin actor + fallback *(2 hrs Claude)*

- Primary: `natanielsantos/douyin-scraper`
- Fallback: second actor (`kuaima/douyin-search` or similar) behind one method `scrape_douyin_brand()`
- Wrapper tries primary, falls back on empty/error
- **Gate:** simulated primary failure routes to fallback successfully.

### W7 — Cut over, deprecate (don't delete) *(30 min Claude)*

- `run_daily_pipeline.sh` switches to Apify-only path
- Old Playwright scrapers stay in tree for rollback
- README updated
- **Gate:** one week of clean daily runs on Apify-only data.

**Total:** ~8-10 hrs Claude + ~2 hrs Will (Apify trial, possible burner SIM, cookie refresh procedure).

---

## 5. Explicitly NOT in V1

- Layer 2 subscriptions (chanmama / feigua / xinhong) — defer until first paying customer
- Automated QR-code login for cookie refresh — manual is fine for 20 brands
- Doudian seller backend — separate effort once we have a Douyin seller account
- Pinduoduo — Joanna deferred it, agreed (most aggressive anti-bot in China)
- Refactoring `scoring.py` or any of the 16 metric pipelines — out of scope, by design

---

## 6. Risks I'm tracking

1. **Vendor lock to one Apify author.** `zhorex` is one developer; if they abandon the actor we're stuck. Mitigation: pin actor version in `apify_client.py`, evaluate `kuaima/xiaohongshu` as backup at W6.
2. **Schema drift.** Apify actor field changes silently break scoring. Mitigation: add output validation in `apify_client.py` — refuse to write a row if required fields are missing, alert instead.
3. **Daily pipeline runtime.** If an actor takes 5-15 min/brand and we run sequentially, 20 brands = 1.5-5 hrs. Mitigation: parallel actor runs in W2 (Apify supports concurrent runs natively).
4. **Cost ceiling unknown.** $7-12/mo XHS estimate is back-of-envelope. Mitigation: per-actor cost logging in W2 → real number after one week.
5. **No XHS scraping lawsuits found in 2025-2026 search, but absence ≠ safety.** Chinese platform TOS forbid scraping. Worth a legal review before reselling to SMB customers. Mitigation: surface this in the first-client playbook (#61) — what claims do we make about data provenance?

---

## 7. Decisions still open

| # | Decision | Who | When |
|---|---|---|---|
| D1 | Burner XHS account — needed at W2 or skippable? | Will, based on W1 parity report | After W1 |
| D2 | Billing rail for Apify (Will's card vs company virtual card) | Will | Before W2 |
| D3 | Where do cookie-refresh alerts go (Slack vs email)? | Will | Before W4 |
| D4 | Do we ship Taobao to first prospect before Douyin works? | Both founders | Before W7 |

---

## 8. How this maps to the GitHub board

- **#62** ([Make the scrape pipeline solid enough to generate a real Brief](https://github.com/jojosuperstar0506/rebase/issues/62)) is the umbrella for this plan
- W1-W7 tracked as comments/checklist on #62 unless any step grows enough to deserve its own issue
- Plan doc lives at `SCRAPING-PLAN-2026-05-22.md` (this file) for full context

---

## 9. Reading order for Joanna's Claude session

1. This doc
2. `services/competitor_intel/scrapers/xhs_scraper.py:67` — the `XhsBrandData` dataclass (integration contract)
3. `services/competitor_intel/scraping_rules.yml` — current rate-limit posture
4. `Rebase-Scraping-Strategy (1).docx` — Joanna's original strategy doc
5. GitHub issue #62 — the umbrella tracking issue
