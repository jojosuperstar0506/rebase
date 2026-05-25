# Handoff — 2026-05-26 (from Will → Joanna)

> Long session tonight. Apify scraping went from "broken Playwright"
> to "live in production with state-aware UX". 15 PRs merged. Read top
> to bottom if you're picking this up cold.

## TL;DR

- **Apify Tier B scraping is live on ECS.** End-to-end flow tested with OMI workspace (7 competitors): user adds competitor → admin pastes XHS URL → scraper runs → analysis generates → brief renders.
- **15 PRs merged tonight** (#96 through #111). All on `main`, all deployed.
- **First paying-customer-ready state.** Friction points fixed: state-aware Settings UX, admin queue/edit UI, freshness guard, URL auto-normalization.
- **Apify Starter ($29/mo) subscribed.** Covers ~1 customer with buffer; revisit at 3+.
- **2 real bugs deferred to next session** (see "Known issues" below).
- **Total Apify spend tonight: ~$5-9** (mostly debug + 2 full 7-brand scrapes).

## What now works (customer-visible flow)

1. **Customer adds competitors** at `/ci/settings` via Type Name / Paste Link / AI Suggest tabs.
2. **Settings page shows derived state**:
   - `pending_setup` (any competitor missing XHS URL) → banner: "Connecting your competitors' XHS profiles. We'll email you when ready, typically within an hour during business hours." + per-competitor progress chips.
   - `scraping` (URLs set, no data yet) → banner: "Fetching the latest content."
   - `ready` (all URLs + scrape data) → Start Analysis card appears.
3. **Admin sees customer's pending URLs** at `/admin` (grouped by workspace + invite code).
4. **Admin pastes XHS profile URLs** OR **edits wrong URLs** in the new "Edit configured XHS profile URLs" section. Backend auto-normalizes `xiaohongshu.com` → `rednote.com` (actor quirk fix).
5. **Admin clicks "Run XHS scraper now"** → spawns scraper with `--force-rescrape` on ECS → ~5-7 min.
6. **Customer refreshes** → state flips to `ready` → clicks Start Analysis → ~3 min → Brief renders on `/ci`.

## PR map (15 PRs tonight, grouped by purpose)

### Infra recovery + ECS deploy

| PR | What |
|---|---|
| #96 | Drop phantom `asyncio-compat` from requirements.txt + add real `psycopg2-binary` |
| #97 | Add `pyyaml` + `cryptography` to requirements (silently used from py3.6 site-packages on old box) |
| #98 | Fix `apify-client` v3 Pydantic `Run` model compat (the `'Run' object is not subscriptable` crash) |
| #99 | Migration 014 — allow `apify_easyapi` as `scraped_products.data_confidence` value |

**Result:** Apify client works on ECS python3.11 venv, scraper writes to DB correctly.

### Schema + DB hygiene

| PR | What |
|---|---|
| #100 | `docs/SCHEMA.md` — single source of truth for 17-table layout, "where does X live" lookup, 7 SQL recipes |
| #101 | `CLAUDE.md` points at SCHEMA.md so future Claude sessions auto-discover it |
| #102 | Freshness guard (`--force-rescrape` CLI flag) — skip if scraped <12h ago, default-on safety |
| **DB backup recovery** | Found backup cron pointing to `/var/www/rebase-backend/` (moved May 4, never updated). Manual backup taken to close 22-day gap. Cron re-wired to `/root/rebase/scripts/backup_db.sh`. Weekly scrape cron added for Sundays 2am. |

### Frontend hardening

| PR | What |
|---|---|
| #103 | Fix `/ci/settings` crash on null `platform_ids` (`Object.keys(null)` in 4 spots) |
| #104 | Auto-populate `xhs_profile_url` from `platform_ids.xhs` on competitor add (helps Paste Link flow) |

### State-aware UX (the big one)

| PR | What |
|---|---|
| #105 | `DataSourcesStatus` component — 3-state machine (`pending_setup` / `scraping` / `ready`) derived from competitor data. Honest UX while admin curates URLs. |
| #106 | Hotfix: add `xhs_profile_url` + `last_scraped_at` to `CICompetitor` TS type (PR #105 used them without declaring) |
| #107 | Wildcard Vercel proxy for `/api/admin/:path*` (admin sub-paths were 404-ing, silent gap since PR #81) |

### Admin UX polish

| PR | What |
|---|---|
| #108 | Admin queue grouped by workspace/invite code (was flat list) |
| #109 | Admin "Run scraper" button now uses `--force-rescrape` (bypasses 12h guard for explicit admin clicks) |
| #110 | Edit existing URLs in admin (new "Edit configured XHS profile URLs" section) + auto-normalize domain on PATCH |
| #111 | Filter removed competitors from analytics + hover-only scatter labels |

## Apify cost reality

| Plan | $/mo | Covers (realistic) |
|---|---|---|
| Free (tonight ran out) | $0 | ~7-10 brand-scrapes |
| **Starter (active now)** | **$29** | **1 customer × 7 brands × weekly + admin testing** |
| Scale | $499 | 5-15 customers |

Actual cost per brand-scrape is ~$0.50-1 (not $0.25 — platform compute + proxy fees on top of per-result fees). My earlier estimates were too optimistic.

**Pricing implication:** any paying customer needs to be at $99+/mo to keep COGS at <30% of revenue.

**Cost optimization deferred to next session:** drop `user_posts` maxItems from 50 → 20 (60% savings on the expensive call). One-line change in `apify_client.py`.

## Known issues (in priority order)

### URGENT — known bug, real data quality concern

**Issue:** LLM-generated brief content (`weekly_briefs.verdict`, `weekly_briefs.moves`, content/product/whitespace) can mention competitors that the customer has since removed. PR #111 fixed the DATA layer (scatter plot + metric cards) but the LLM TEXT still references stale competitors.

**Concrete scenario:**
- Tuesday brief mentions COACH and La Festin
- Wednesday customer removes COACH and La Festin
- Brief still says "Songmont leads vs COACH and La Festin"
- Customer confused

**Recommended fix:** show staleness warning + "Regenerate Brief" button on the brief card when current `workspace_competitors` ≠ competitors referenced in brief. ~30 min frontend + backend.

### MEDIUM

- Brief sometimes has only 1 move when data is sparse — schema says "array of 3 events" but pipeline degrades silently. Worth aligning either pipeline or doc.
- API endpoints don't always normalize `platform_ids: null` → `{}` — added defensive `|| {}` guards in frontend (PR #103), but ideal fix is server-side normalization.
- `backup_db.sh` uses hardcoded fallback password `123456789` — works because of PG trust auth, but a security smell. Should use `$DATABASE_URL`.

### LOW

- Search-based brand-name → XHS UID resolution still not built (the broken `easyapi/rednote-xiaohongshu-search-scraper` blocked Phase 2). Admin manually pastes URLs today. Worth revisiting at customer #3.
- Test coverage on admin endpoints is thin — Phase 2 cleanup.

## Stuff Joanna might want to know first thing

1. **Read `docs/SCHEMA.md`** — I built it tonight. Catches you up on the 17-table layout in 2 min.
2. **CLAUDE.md** now points at SCHEMA.md so your next Claude session auto-discovers it.
3. **You can test the full flow yourself** — use invite code `RB-TESTIN-5652` (OMI workspace) at https://rebase-lac.vercel.app/login.
4. **Admin password** is `rebase-admin-2026` (unless VITE_ADMIN_PASSWORD is set in Vercel — check).
5. **Apify Console**: https://console.apify.com/billing — Starter plan active, ~$27 of $29 credit remaining as of end-of-session.

## What's next (rough priority)

| # | Task | Owner | Effort |
|---|---|---|---|
| 1 | Brief staleness warning + Regenerate button | Either | ~30 min |
| 2 | UI to edit/add MORE competitors after first 7 (workspace_competitors UNIQUE constraint on workspace+brand makes this already work, just needs UX polish) | Joanna | ~30 min |
| 3 | Cost optimization: drop `user_posts` maxItems 50 → 20 | Will | 5 min |
| 4 | Phase 2 brand-name → XHS UID auto-resolve (vet 5 other Apify search actors) | Will | 1-2 hrs |
| 5 | Add `regenerate brief` mutation endpoint | Will | 30 min |
| 6 | Onboarding wizard polish — make sure new customers land in `pending_setup` state cleanly | Joanna | 1 hr |

## Where to find things

- **Schema**: `docs/SCHEMA.md`
- **Scraping strategy + Tier B decision**: `docs/SCRAPING-STRATEGY.md`
- **ECS deploy procedure**: `docs/SCRAPING-DEPLOY-RUNBOOK.md`
- **All PRs**: https://github.com/jojosuperstar0506/rebase/pulls?q=is%3Amerged+merged%3A2026-05-25..2026-05-26
- **Umbrella issue**: https://github.com/jojosuperstar0506/rebase/issues/62

## Acknowledgments

- Built with Claude Code in one long session ~6 hrs. Heavy use of `gh pr create` + self-merge after explicit auth.
- Will did all ECS shell work + Apify billing + cookie sourcing + final visual QA.
- Joanna's earlier `Coverage pending` design pattern was reused for the new chips in `DataSourcesStatus`.
