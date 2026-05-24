# Scraper Deploy Runbook — ECS

Step-by-step deploy procedure for PR #81 once Joanna approves. Copy-paste-ready commands.

**Tracks:** issue #62 · branch `will/scrape-apify-spike` · PR #81
**Prereqs:** Joanna's review approved; Vercel preview check is green; you have SSH access to ECS `8.217.242.191`.

---

## Phase A — Merge to main (Vercel auto-deploys frontend) ~5 min

```bash
# On local machine
git checkout main
git pull origin main
gh pr merge 81 --squash --delete-branch
git pull origin main  # confirm merged
```

**What happens next automatically:** Vercel detects the push to main → builds + deploys the frontend. Takes ~2 min. Includes:
- The new admin section at `/admin` (CompetitorXhsUrls component)
- Updated `.env.example` (no runtime impact)

**Verify Vercel deploy:**
- https://rebase-lac.vercel.app/admin — should now show the "Competitors awaiting XHS profile URL" section at the bottom
- If frontend build fails, Vercel UI shows the TS error. Fix in a follow-up PR.

---

## Phase B — ECS deploy (backend + scraper code) ~10 min

```bash
# SSH into ECS
ssh -i ~/.ssh/your-key.pem ec2-user@8.217.242.191

# Pull latest
cd ~/rebase
git pull origin main

# Apply NEW migrations (012 + 013). Both are idempotent —
# safe to re-run if they were partially applied previously.
psql "$DATABASE_URL" -f backend/migrations/012_apify_run_log.sql
psql "$DATABASE_URL" -f backend/migrations/013_workspace_competitors_xhs_url.sql

# Confirm migrations applied
psql "$DATABASE_URL" -c "\d workspace_competitors" | grep xhs_profile_url
# Expected: xhs_profile_url | text |
psql "$DATABASE_URL" -c "\d apify_run_log" | head -5
# Expected: shows columns

# Install new Python dep (apify-client)
pip install -r services/competitor_intel/requirements.txt
# OR for the cron user specifically:
sudo -u <cron_user> pip install -r services/competitor_intel/requirements.txt

# Restart the Node.js backend so the new admin endpoints + frontend
# assets are served. server.js changed in PR #81.
pm2 restart rebase-backend

# (Optional) Tail logs to confirm the restart succeeded
pm2 logs rebase-backend --lines 20
```

**State after Phase B:**
- Frontend: live with admin UI section visible at `/admin`
- Backend: serving new endpoints `PATCH /api/admin/competitors/:id/xhs-url` and `GET /api/admin/competitors/missing-xhs-url`
- Database: has `xhs_profile_url` column + `apify_run_log` table, both unused yet
- Cron: still using existing Playwright scraper (USE_APIFY=false default)

**Zero behavior change in production yet.** Old scraper still runs nightly as before.

---

## Phase C — Wire Apify for the demo workspace ~10 min

This is the "flip the switch" step. Do this ONLY when you're ready to run an actual Apify scrape for at least one workspace.

```bash
# Still SSH'd into ECS
cd ~/rebase

# Add Apify config to backend/.env (do NOT commit; .env is gitignored)
nano backend/.env

# Add these 2 lines at the end:
#   USE_APIFY=true
#   APIFY_API_TOKEN=apify_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxx   (your real token)
#
# Note: XHS_SESSION_COOKIE is NO LONGER needed under easyapi — they handle
# auth via residential proxies. You can remove that env var if it exists.

# Save (Ctrl+O, Enter, Ctrl+X)

# Restart so the daemon picks up the new env vars
pm2 restart rebase-backend

# Verify USE_APIFY is set (don't echo the token)
pm2 env 0 | grep USE_APIFY
# Expected: USE_APIFY=true
```

---

## Phase D — Configure XHS URLs for ONE workspace's competitors ~5-15 min

```bash
# Still SSH'd into ECS
# Find the workspace + its competitors that need URLs configured
psql "$DATABASE_URL" -c "
  SELECT wc.id, wc.brand_name, w.brand_name AS workspace,
         COALESCE(wc.xhs_profile_url, '(not set)') AS url
    FROM workspace_competitors wc
    JOIN workspaces w ON w.id = wc.workspace_id
   WHERE w.brand_name = 'YOUR_PROSPECT_BRAND_NAME'
   ORDER BY wc.created_at;
"
# Note each competitor's UUID
```

**Option 1: Set URLs via the admin UI** (recommended — see admin panel)

Go to https://rebase-lac.vercel.app/admin, scroll to the bottom "Competitors awaiting XHS profile URL" section. For each row:

1. Search the brand on rednote.com (use Chrome/Edge, not necessarily logged in)
2. Click into their official profile
3. Copy the URL from the address bar
4. Paste into the input field (the system auto-strips `?xsec_token=...` query strings)
5. Click "set url" → wait for ✓ saved → row disappears from queue

**Option 2: Set URLs via curl** (faster for bulk)

```bash
# Replace <COMPETITOR_UUID> + <PROFILE_URL>
curl -X PATCH "http://localhost:3000/api/admin/competitors/<COMPETITOR_UUID>/xhs-url" \
  -H "Content-Type: application/json" \
  -H "x-rebase-secret: $API_SECRET" \
  -d '{"xhs_profile_url": "https://www.rednote.com/user/profile/<24-hex-id>"}'
# Expected: {"competitor":{"id":"...","brand_name":"...","xhs_profile_url":"..."}}
```

**Option 3: Set URLs via direct SQL** (fastest if you know the brand → URL map)

```sql
-- One brand at a time
UPDATE workspace_competitors
   SET xhs_profile_url = 'https://www.rednote.com/user/profile/58c7d02b82ec3977dd42c218'
 WHERE workspace_id = '<UUID>' AND brand_name = 'Songmont';
```

---

## Phase E — Trigger a test scrape + verify Brief generation ~30 min wait

```bash
# Manual one-off scrape (instead of waiting for nightly cron)
USE_APIFY=true python -m services.competitor_intel.scrape_runner \
  --platform xhs --tier watchlist
# OR for one specific brand:
USE_APIFY=true python -m services.competitor_intel.scrape_runner \
  --platform xhs --brand "Songmont"

# Expected log output:
#   [SCRAPE/apify] xhs / Songmont (profile: https://..., tier: watchlist)
#   apify: user_posts done items=N cost=$0.XX
#   apify: profile done items=1 cost=$0.005
#   [OK/apify] xhs / Songmont: success | notes=N cost=~$0.XX

# Verify data landed in DB
psql "$DATABASE_URL" -c "
  SELECT brand_name,
         follower_count,
         jsonb_pretty(engagement_metrics) AS em,
         scraped_at
    FROM scraped_brand_profiles
   WHERE brand_name IN ('Songmont', '...other competitors...')
   ORDER BY scraped_at DESC LIMIT 5;
"

# Verify cost tracking landed in apify_run_log (if cost-logger wired)
psql "$DATABASE_URL" -c "
  SELECT brand_name, actor_id, mode, items_returned,
         ROUND(cost_estimate_usd::numeric, 4) AS cost_usd,
         invoked_at
    FROM apify_run_log
   ORDER BY invoked_at DESC LIMIT 10;
"
```

**Trigger scoring + brief regeneration** so the customer's `/ci` Brief reflects the new data:

```bash
# Hits the existing run-analysis endpoint to re-score with fresh scrape data
curl -X POST "http://localhost:3000/api/ci/run-analysis" \
  -H "Content-Type: application/json" \
  -H "x-rebase-secret: $API_SECRET" \
  -d '{"workspace_id":"<UUID>"}'
# Returns: {"job_id":"...","status":"queued",...}

# Wait 30-60 sec for the pipelines to finish; check status
curl "http://localhost:3000/api/ci/analysis/status?workspace_id=<UUID>" \
  -H "x-rebase-secret: $API_SECRET"
```

**Then verify in the browser**: log in as the customer at https://rebase-lac.vercel.app/ci → see the populated Brief.

---

## Rollback procedures

### If frontend Vercel deploy fails

```bash
# Vercel auto-deploys on push to main. To rollback:
# 1. In Vercel dashboard, find the previous successful deploy
# 2. Click "..." → "Promote to Production"
# OR via CLI:
vercel promote <previous_deploy_url> --scope <your-team>
```

### If migration 012 or 013 caused issues

```bash
# Both migrations are additive (ADD COLUMN, CREATE TABLE IF NOT EXISTS),
# so they shouldn't break existing behavior. If somehow they did:

# Drop the new column (won't affect existing rows)
psql "$DATABASE_URL" -c "ALTER TABLE workspace_competitors DROP COLUMN xhs_profile_url;"

# Drop the new table
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS apify_run_log CASCADE;"
```

### If USE_APIFY=true causes the cron to fail

```bash
# Easy: just set USE_APIFY=false in backend/.env and restart
# Existing Playwright path resumes
sed -i 's/USE_APIFY=true/USE_APIFY=false/' backend/.env
pm2 restart rebase-backend
```

### If the new admin endpoints expose sensitive data unintentionally

```bash
# The endpoints respect the global requireSecret middleware. If you suspect
# leakage, rotate API_SECRET immediately:
# 1. Generate new secret (e.g., openssl rand -hex 32)
# 2. Update API_SECRET in backend/.env AND in Vercel env vars
# 3. pm2 restart rebase-backend
# 4. Old requests will start failing with 401
```

---

## Known gaps / things to monitor

1. **JS tests for admin endpoints**: not written yet (Will-away scope decision). Manual verification covers it for now.
2. **Cost monitoring alerts**: `apify_run_log` table captures per-call cost, but no alert when daily spend exceeds a threshold. Add a `pg_cron` or external Slack monitor if costs grow.
3. **Profile actor fuzzy counts**: easyapi profile returns `"1万+"` for follower counts, not exact. Documented in strategy doc. Means momentum scoring can't detect intra-bucket growth.
4. **Per-brand config scales linearly**: Phase D takes ~10 min per workspace today. M-E (customer-facing URL collection in wizard) is the longer-term fix — deferred until first 5 prospects inform the UX.

---

## Smoke test after each phase

| After | Verify |
|---|---|
| Phase A (Vercel deploy) | `/admin` loads, shows new "Competitors awaiting XHS URL" section |
| Phase B (ECS deploy) | `curl -s http://localhost:3000/health` returns 200; `pm2 logs` shows no startup errors |
| Phase C (USE_APIFY=true) | `pm2 env 0 | grep USE_APIFY` shows `USE_APIFY=true` |
| Phase D (URL configured) | `GET /api/admin/competitors/missing-xhs-url` no longer returns the brand you configured |
| Phase E (test scrape) | `scraped_brand_profiles` has a row for the brand with `data_confidence='apify_easyapi'`; cost shows in `apify_run_log` |

---

## Time budget

| Phase | Realistic time |
|---|---|
| A: Merge + Vercel deploy | 5 min (mostly waiting for Vercel) |
| B: ECS git pull + migrations + pip install + restart | 10 min |
| C: Env vars + restart | 5 min |
| D: Configure URLs for ONE workspace (5-10 competitors) | 10-15 min |
| E: Test scrape + verify Brief | 30-45 min total (including waiting for scoring pipeline) |

**Total first-time end-to-end:** ~1 hour. Subsequent prospects: 15-30 min each (just Phase D + E).
