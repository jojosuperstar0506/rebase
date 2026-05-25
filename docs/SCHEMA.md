# Database schema cheat-sheet

**One Postgres database. 17 tables. Five conceptual layers.**

This doc is the single source of truth for "where does X live?" — if you're grepping migrations to figure out which table has a column, you should be here instead.

Last verified against schema: 2026-05-25 (after migration 014).

---

## The 30-second mental model

```
┌─────────────────────┐       ┌──────────────────┐       ┌──────────────────────────┐
│ 1. IDENTITY/CONFIG  │       │ 2. RAW SCRAPE    │       │ 3. SCORED METRICS        │
│                     │       │                  │       │                          │
│ Who you are.        │       │ What we found.   │       │ How they compare.        │
│ Who you watch.      │       │ Append-only      │       │ Append-only history per  │
│ Login state.        │       │ time-series.     │       │ workspace × competitor.  │
├─────────────────────┤       ├──────────────────┤       ├──────────────────────────┤
│ workspaces          │       │ scraped_brand_   │       │ analysis_results         │
│ workspace_          │       │   profiles       │ ────▶ │ analysis_narratives      │
│   competitors       │ ────▶ │ scraped_products │       │ composite_indices        │
│ platform_           │       │                  │       │                          │
│   connections       │       │                  │       │                          │
│ user_ci_preferences │       │                  │       │                          │
└─────────────────────┘       └──────────────────┘       └──────────────────────────┘
                                                                       │
                                                                       ▼
                              ┌──────────────────┐       ┌──────────────────────────┐
                              │ 5. OPERATIONAL   │       │ 4. BRIEF / PRESENTATION  │
                              │                  │       │                          │
                              │ Jobs, alerts,    │       │ The weekly story.        │
                              │ cost tracking.   │       │ One row per week × type. │
                              ├──────────────────┤       ├──────────────────────────┤
                              │ ci_analysis_jobs │       │ weekly_briefs            │
                              │ ci_deep_dive_   │       │ content_recommendations  │
                              │   jobs           │       │ product_opportunities    │
                              │ ci_alerts        │       │ white_space_             │
                              │ apify_run_log    │       │   opportunities          │
                              └──────────────────┘       └──────────────────────────┘
                                                                       │
                                                                       ▼
                                                         ┌─────────────────────┐
                                                         │ FRONTEND reads via  │
                                                         │ /api/ci/* endpoints │
                                                         └─────────────────────┘
```

**Rule:** every table belongs to exactly one layer. If you find yourself adding a column that bridges two layers, you probably want a join, not a new column.

---

## Where does X live?

The lookup table you actually want when debugging.

| Question | Table | Column |
|---|---|---|
| Songmont's latest follower count | `scraped_brand_profiles` | `follower_count` (filter by `brand_name`, ORDER BY `scraped_at DESC LIMIT 1`) |
| Songmont's last 50 notes | `scraped_products` | filter `brand_name='Songmont'`, ORDER BY `scraped_at DESC` |
| Songmont's momentum score *for OMI workspace* | `analysis_results` | `score` (filter `workspace_id`, `competitor_name`, `metric_type='momentum'`) |
| Songmont's 12 composite-index scores | `composite_indices` | one row per `index_name` (12 of them) |
| The weekly Brief headline | `weekly_briefs` | `verdict->>'headline'` |
| All draft content recs for this week | `content_recommendations` | filter `workspace_id`, `week_of`, `status='draft'` |
| What competitors a workspace tracks | `workspace_competitors` | filter `workspace_id` |
| Whether the user has connected XHS | `platform_connections` | row exists with `platform='xhs_analytics'`, `status='active'` |
| Apify cost this month | `apify_run_log` | `SUM(cost_estimate_usd)` WHERE `invoked_at > now() - interval '30 days'` |
| Is an analysis job still running | `ci_analysis_jobs` | latest row by `workspace_id`, check `status` |
| Is the XHS profile URL set for a competitor | `workspace_competitors` | `xhs_profile_url` (column added in migration 013) |
| Active alerts for a workspace | `ci_alerts` | filter `workspace_id`, `is_read=false` |

---

## Layer 1 — Identity / config (5 tables)

The "who you are" layer. Slow-changing, written by the API on user action.

| Table | One-line purpose | Owner writes | Frontend reads via |
|---|---|---|---|
| `workspaces` | One row per user's project. `brand_name`, `category`, `price_range`, `platforms` | API on onboarding | `/api/ci/workspace` |
| `workspace_competitors` | The list of competitors a workspace tracks. `tier='watchlist'` is the active set; `landscape` is reference. Added in migration 013: `xhs_profile_url` (auto-populated from `platform_ids.xhs` on add — see migration 015 backfill) | API on add/edit | `/api/ci/competitors` |
| `platform_connections` | Per-workspace login state for SYCM / XHS-Analytics / Douyin-Compass. Stores AES-encrypted cookies | API on QR login | `/api/ci/connect/*` |
| `user_ci_preferences` | UI prefs — visible metrics, alert thresholds, default time range | API on settings save | `/api/ci/preferences` |
| `connections_credentials` | (Legacy table — kept for migration parity, not actively written) | n/a | n/a |

---

## Layer 2 — Raw scrape (2 tables)

The "what we found" layer. **Append-only time-series.** Written exclusively by the Python scraper (`services/competitor_intel/scrape_runner.py` → `db_bridge.py`).

| Table | Write pattern | Why | Indexed by |
|---|---|---|---|
| `scraped_brand_profiles` | **Pure INSERT** every scrape | History preserved → trend lines work | `(brand_name, scraped_at DESC)` |
| `scraped_products` | **INSERT ... ON CONFLICT (platform, product_id, scraped_date) DO UPDATE** | One row per product per day. Same-day re-runs update, never duplicate | `(brand_name, scraped_at DESC)`, `(platform, brand_name)` |

`data_confidence` on `scraped_products` distinguishes sources: `direct_scrape` (in-house Playwright), `apify_easyapi` (Apify path, added in migration 014), `estimated`, `stale`.

Brand profiles have NO `data_confidence` column — they're trusted as-is.

---

## Layer 3 — Scored metrics (3 tables)

The "how they compare" layer. **Append-only per workspace × competitor × metric × analysis run.** Written by the 9 metric pipelines + the composite-index compute.

| Table | Granularity | Key columns |
|---|---|---|
| `analysis_results` | 1 row per (workspace × competitor × metric × analyzed_at) | `metric_type` (12 values: keywords, sentiment, momentum, etc.), `score`, `raw_inputs` (JSONB with the inputs the pipeline used), `ai_narrative` (DeepSeek-generated explanation) |
| `analysis_narratives` | 1 row per (workspace × analyzed_at) — cross-brand | `narrative` (TEXT), `action_items` (JSONB) |
| `composite_indices` | 1 row per (workspace × competitor × index × index_version × computed_at) | `pillar` (brand_equity / marketing_engine / commerce_engine), `score`, `inputs`, `weights`, `direction` (gaining/steady/losing), `delta` |

> ⚠️ `analysis_results` has 12 distinct `metric_type` values, written by 12 pipelines. The values are listed in `services/competitor_intel/scoring_pipeline.py` and must match the frontend's `IntelligenceData` shape. Don't add a new metric type without updating both sides.

---

## Layer 4 — Brief / presentation (4 tables)

The "weekly story" layer. **One row per workspace per ISO-week per type.** Written by the LLM stages in the analysis orchestrator (`run_analysis_for_workspace.sh` steps 5-8).

| Table | One row per week | What it stores |
|---|---|---|
| `weekly_briefs` | (workspace, week_of) UNIQUE | `verdict` JSONB ({headline, sentence, trend, top_action}), `moves` JSONB (array of 3 events) |
| `content_recommendations` | Many per week | Douyin/XHS post drafts. Status flow: `draft → posted / dismissed` |
| `product_opportunities` | 1-2 per week typically | Concept name, positioning, signals (grounded in real scrape data) |
| `white_space_opportunities` | 2-4 per week | Uncontested dimensions/pricing/keywords/channels. `opportunity_score` 0-100 |

Frontend lazy-loads each of these on Brief expand — see `frontend/src/services/ciApi.ts`.

---

## Layer 5 — Operational (4 tables)

The "infrastructure" layer. Jobs you can poll, costs you can audit, alerts to surface.

| Table | What it tracks |
|---|---|
| `ci_analysis_jobs` | One row per `POST /api/ci/run-analysis` invocation. Status: queued → scoring → narrating → complete (or failed) |
| `ci_deep_dive_jobs` | One row per deep-dive request. Same pattern, separate lifecycle |
| `apify_run_log` | One row per Apify actor call. `actor_id`, `mode`, `items_returned`, `cost_estimate_usd`. Aggregated weekly for COGS tracking |
| `ci_alerts` | One row per threshold breach. `severity` (critical/warning/info), `is_read` flag |

---

## Common debugging recipes

The SQL we've actually written during deploys, captured so we don't reinvent each time.

```sql
-- Songmont's latest snapshot across platforms
SELECT platform, follower_count, scraped_at
  FROM scraped_brand_profiles
 WHERE brand_name = 'Songmont'
 ORDER BY scraped_at DESC LIMIT 5;

-- How many Apify-sourced products do we have for a brand?
SELECT COUNT(*) FROM scraped_products
 WHERE brand_name = 'Songmont' AND data_confidence = 'apify_easyapi';

-- Apify cost this month, by brand
SELECT brand_name,
       COUNT(*) AS run_count,
       ROUND(SUM(cost_estimate_usd)::numeric, 4) AS total_usd
  FROM apify_run_log
 WHERE invoked_at > NOW() - INTERVAL '30 days'
 GROUP BY brand_name
 ORDER BY total_usd DESC;

-- What competitors does a workspace track, with XHS URL status?
SELECT brand_name,
       tier,
       COALESCE(xhs_profile_url, '(not set)') AS xhs_url
  FROM workspace_competitors
 WHERE workspace_id = '...uuid...'
 ORDER BY tier, brand_name;

-- Is there an in-flight analysis job for this workspace?
SELECT id, status, completed_brands || '/' || total_brands AS progress,
       current_brand, started_at
  FROM ci_analysis_jobs
 WHERE workspace_id = '...uuid...'
 ORDER BY created_at DESC LIMIT 1;

-- What's the latest Brief for a workspace?
SELECT week_of, verdict->>'headline' AS headline,
       jsonb_array_length(moves) AS n_moves, generated_at
  FROM weekly_briefs
 WHERE workspace_id = '...uuid...'
 ORDER BY week_of DESC LIMIT 1;

-- Cross-workspace de-dup: which brands are scraped for multiple workspaces?
SELECT brand_name, COUNT(DISTINCT workspace_id) AS workspace_count
  FROM workspace_competitors
 GROUP BY brand_name
 HAVING COUNT(DISTINCT workspace_id) > 1
 ORDER BY workspace_count DESC;

-- Last-scraped timestamp per brand per platform (drives freshness guard)
SELECT brand_name, platform, MAX(scraped_at) AS last_scraped
  FROM scraped_brand_profiles
 GROUP BY brand_name, platform
 ORDER BY last_scraped DESC;
```

> 💡 The freshness guard in `scrape_runner.py` uses
> `db_bridge.get_brand_last_scraped_at(platform, brand_name)` (which runs
> the per-brand version of that query) to skip brands scraped within
> `FRESHNESS_THRESHOLD_HOURS` (default 12). Override with `--force-rescrape`
> on the CLI when you want a guaranteed fresh pull.

---

## Playbook: adding or changing a table

1. **Never edit a migration that's already been applied.** Always add the next number.
   `backend/migrations/0NN_short_description.sql`.
2. **Make migrations idempotent**: `CREATE TABLE IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS … ADD CONSTRAINT`, etc. Safe to re-run on partial state.
3. **Update the layer doc above** if you add a new table. If you add a column to an existing one, update the "Where does X live?" table.
4. **Mirror in `db_bridge.py`** if scraper/analyzer writes here. Mirror in `backend/server.js` (or `api/`) if the frontend reads it.
5. **Apply on ECS** with `psql "$DATABASE_URL" -f backend/migrations/0NN_...sql` after the PR merges.

---

## What's intentionally not in this doc

- **Frontend `IntelligenceData` shape** — that's `frontend/src/types/ci.ts` and `INTELLIGENCE-ARCHITECTURE-v3.md`. This doc is the storage side; that doc is the wire-format side.
- **Per-pipeline algorithm details** — see each pipeline's docstring in `services/competitor_intel/`.
- **Vercel function topology** — that's `README.md` "Vercel Function Count" section.
- **Migration history rationale** — captured in each migration file's own comments.

---

## When this doc is wrong

Open a PR. Schema doc going stale is worse than no schema doc — it actively misleads.

Last verified: 2026-05-25 against `backend/migrations/001`–`014`. Re-verify when you touch migrations.
