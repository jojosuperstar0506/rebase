# Beta Hardening Fixes — 2026-04-10

## Fixed

- **POST /api/ci/scrape**: Missing try/catch around spawn() — added error handling to return 500 instead of crashing
- **GET /api/ci/brands/search**: No try/catch — wrapped in error handler
- **POST /api/ci/workspace**: No input validation — added 400 response for missing user_id, brand_name, or brand_category

## Verified Working (Code Audit)

All 23 Vercel proxy files exist and map correctly:
- workspace-me, workspace, competitors, dashboard, connections, connections-check
- ingest, scrape-targets, scrape, pipeline-status
- trends, trends-summary
- alerts, alerts-read, alerts-count
- deep-dive, deep-dive-status, deep-dive-result, brand-insights
- resolve-brand, parse-link, suggest-competitors, brands-search

DELETE /api/ci/competitors/:id — handled within competitors.js proxy (multi-method)

Error handling: all endpoints have try/catch blocks and return proper 400/500 responses.

SQL injection protection: all queries use parameterized $1/$2 placeholders (no string concatenation).

## Known Issues (non-blocking for beta)

- **CORS default is `*`**: If `FRONTEND_URL` env var is not set on ECS, CORS allows all origins. Set `FRONTEND_URL=https://rebase-lac.vercel.app` in production `.env`.
- **DELETE /api/ci/competitors/:id lacks workspace authorization**: A user could delete a competitor from another workspace if they guess the UUID. Low risk (UUIDs are unguessable) but should add workspace_id check in a future task.
- **Dual directory issue on ECS**: `services/competitor-intel/` (git) vs `services/competitor_intel/` (Python). Must run `cp services/competitor-intel/*.py services/competitor_intel/` after each `git pull`.

## ECS Verification (to be completed manually)

- [ ] All endpoints return 200 from deployed Vercel URL
- [ ] x-user-id flow works (onboard → login → /ci shows workspace)
- [ ] Database health: workspaces, competitors, scores, narratives exist
- [ ] PM2 stable, no crash loops
- [ ] PostgreSQL connections < 25
- [ ] Cron installed and pipeline status file exists
- [ ] FRONTEND_URL set in .env (not relying on wildcard CORS)
- [ ] COOKIE_ENCRYPTION_KEY is not default value
- [ ] Admin password changed from default
