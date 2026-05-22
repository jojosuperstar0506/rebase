# Deploy runbook — onboarding wizard

The self-serve signup wizard (`/signup`) needs the **ECS backend** pulled
+ migrated + restarted whenever onboarding code changes. The frontend and
the Vercel `/api/v2/*` proxy auto-deploy on merge to `main`; the ECS box
is the only manual step. This runbook is for **Will** (or whoever holds
the ECS SSH key).

> Every onboarding deploy is the same 4 commands. `node migrate.js` applies
> whatever migrations are pending and skips ones already run, so it is
> always safe to run.

---

## The deploy — 4 commands on ECS

SSH into the ECS box (`8.217.242.191`) and run:

```bash
cd <backend repo dir>                 # e.g. /var/www/rebase-backend
git checkout main && git pull origin main

# Apply any pending DB migrations. migrate.js tracks applied migrations in
# a _migrations table — it only runs new ones. All migrations are additive
# (ADD COLUMN IF NOT EXISTS) and safe. Current onboarding migrations:
#   010_workspace_onboarding.sql      — is_onboarded, onboarding_step, etc.
#   011_workspace_category_l2.sql     — brand_category_l1, brand_subcategories
cd backend && node migrate.js
cd ..

# CRITICAL — reload the running process. git pull only changes files on
# disk; the live Node process keeps the OLD code in memory until restart.
pm2 restart all
```

## Verify the deploy took

**1. Migrations applied** — should list `010…` and `011…` as applied:
```bash
cd backend && node -e "require('dotenv').config();const{pool}=require('./db');pool.query('SELECT filename FROM _migrations ORDER BY filename').then(r=>{console.log(r.rows.map(x=>x.filename).join('\n'));process.exit(0)})"
```

**2. New code is live** — this must return **HTTP 400**, not 401:
```bash
curl -X POST http://8.217.242.191/api/v2/auth/signup \
  -H 'Content-Type: application/json' -d '{}'
```
- ✅ `{"error":"email, password, brand_name are required"}` (400) → live
- ❌ `{"error":"Unauthorized"}` (401) → still old code — the `git pull`
  or `pm2 restart` didn't take. Recheck: right directory? right branch?
  `pm2 list` — did the correct app restart?

## End-to-end smoke test

Open `/signup` on production and complete all four steps (8+ char
password). Step 2 should show the new 2-level categories + platform
picker; Step 3 the "suggest with AI" button. You should land on `/ci`
with the brand + competitors visible in `/ci/settings`.

---

## Notes

- **No new backend npm packages** — endpoints use only `crypto`,
  `jsonwebtoken`, `pg`, all already installed. No `npm install` needed.
- **No new env vars** — reuses `JWT_SECRET` and `DATABASE_URL`.
- **Multi-vertical caveat** — the wizard now accepts non-bag verticals
  (footwear, apparel, beauty, …), but the scraping + analysis pipeline
  only supports bags today. Non-bag signups are stored correctly but
  won't get a real Brief until the pipeline is extended. Tracked as
  `TODO.md` F10.
- v2 endpoints in `backend/server.js`: `POST /api/v2/auth/signup`,
  `POST /api/v2/auth/login`, `GET /api/v2/onboarding/state`,
  `PATCH /api/v2/onboarding/brand`, `POST /api/v2/onboarding/competitors`,
  `POST /api/v2/onboarding/goals`, `POST /api/v2/onboarding/suggest-competitors`.

## Deploy history

| Date | What | Migrations |
|------|------|-----------|
| 2026-05-22 | Onboarding wizard v1 (PR #47, #48) | 010 |
| 2026-05-22 | Onboarding v2 — 2-level categories, AI competitors (PR #50) | 011 |
