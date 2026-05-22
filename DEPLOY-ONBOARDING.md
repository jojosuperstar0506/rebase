# Deploy runbook — onboarding wizard

The self-serve signup wizard (`/signup`) needs the backend updated to go
live. The frontend is already on production. This runbook is for **Will**
(or whoever holds the ECS SSH key).

Status as of writing:
- ✅ Frontend wizard — deployed (PR #47, merged)
- ⏳ Vercel `/api/v2/*` proxy — deploys when **PR #48** is merged
- ❌ ECS backend — still running pre-revamp code (see verification below)
- ❌ Database migration `010` — not yet applied

Until the ECS step below is done, the wizard fails at step 1 for everyone.

---

## Step 1 — Merge PR #48

https://github.com/jojosuperstar0506/rebase/pull/48

Vercel auto-deploys on merge to `main`. This ships `api/v2.js`, the proxy
that routes `/api/v2/*` traffic from the browser to the ECS backend.

## Step 2 — Deploy the ECS backend

SSH into the ECS box (`8.217.242.191`) and run:

```bash
cd <backend repo dir>            # e.g. /var/www/rebase-backend
git checkout main && git pull origin main

# Sanity-check the new code is actually present:
grep -n "v2/auth/signup" backend/server.js
# → must print a line in the PUBLIC_API_PATHS array. If it prints nothing,
#   the pull didn't land — stop and investigate.

# Apply migration 010 (adds is_onboarded, onboarding_step, user_email,
# user_password_hash to the workspaces table). Idempotent + additive —
# safe to run; existing workspaces are backfilled as is_onboarded=true.
cd backend && node migrate.js
cd ..

# CRITICAL — reload the running process. git pull only changes files on
# disk; the live Node process keeps the old code in memory until restart.
pm2 restart all
```

## Step 3 — Verify the deploy took

```bash
curl -X POST http://8.217.242.191/api/v2/auth/signup \
  -H 'Content-Type: application/json' -d '{}'
```

- ✅ **`{"error":"email, password, brand_name are required"}` (HTTP 400)**
  → new code is live. Onboarding works.
- ❌ **`{"error":"Unauthorized"}` (HTTP 401)**
  → still the old code. The `git pull` or `pm2 restart` didn't take —
  recheck Step 2 (right directory? right branch? did pm2 restart the
  correct app — `pm2 list` to confirm).

## Step 4 — End-to-end smoke test

Open `/signup` on production, complete all four steps with an 8+ char
password. You should land on `/ci` with the workspace created.

---

## Notes

- **No new backend npm packages** — the v2 endpoints use only `crypto`,
  `jsonwebtoken`, `pg`, all already installed. No `npm install` needed.
- **No new env vars** — reuses `JWT_SECRET` and `DATABASE_URL`.
- New v2 endpoints, all in `backend/server.js`:
  `POST /api/v2/auth/signup`, `POST /api/v2/auth/login`,
  `GET /api/v2/onboarding/state`, `PATCH /api/v2/onboarding/brand`,
  `POST /api/v2/onboarding/competitors`, `POST /api/v2/onboarding/goals`,
  `GET /api/v2/onboarding/suggest-competitors`.
