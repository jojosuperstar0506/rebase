# Wind-Down & Revival Runbook

> **Created:** 2026-06-25 · **Authors:** William & Joanna
> **Why this exists:** We are pausing the current "Rebase" product (AI virtual employees /
> ERP intelligence / XHS war room) to pivot. This document is the single source of truth for
> (a) exactly what we are shutting down, (b) how we backed it up, and (c) **how to rebuild the
> entire stack from scratch if we ever come back.** Read it top to bottom before touching billing.

---

## 0. TL;DR

- **All application code is safe in GitHub** (`jojosuperstar0506/rebase`). Cancelling cloud
  services does **not** delete code.
- **The only irreplaceable assets are the PostgreSQL database and the OSS bucket** — they live
  on Alibaba, not in git. They MUST be backed up before cancelling (see §3).
- After backup, everything in §4 can be cancelled. Revival from a cold start is documented in §6
  and takes ~2–4 hours of work plus DNS propagation.

---

## 1. State snapshot — what was live on 2026-06-25

```
User (China/HK/US)
      │
      ▼
Vercel  ─────────────  Frontend SPA (React + Vite + TS)  ·  also hosts /api/* serverless funcs
      │                Project builds from this repo, main branch
      │ HTTPS + x-rebase-secret header
      ▼
Alibaba Cloud ECS — Hong Kong Zone B — 8.217.242.191
      │   ecs.t5-lc1m1.small (1 vCPU / 1 GB RAM), Alibaba Cloud Linux 3
      │   Node 20 LTS + PM2 (process "rebase-backend") + Nginx (80 → 3000)
      │   App dir: /root/rebase  (git clone of this repo; .env at /root/rebase/backend/.env)
      │   (NOTE: an old abandoned copy exists at /var/www/rebase-backend.ABANDONED-20260504 — ignore)
      │   Runs: backend/server.js  AND  backend/scheduler.js cron jobs
      ├──────────► PostgreSQL 13  (LOCAL on this box, db "rebase", owner rebase_app)
      │              auto-dumped nightly ~20:00 to /var/backups/rebase/*.sql.gz (~15 days kept)
      ├──────────► Alibaba OSS  bucket "rebase-docs" (uploaded documents)
      ├──────────► Anthropic Claude API   (primary LLM)
      ├──────────► DeepSeek API           (secondary LLM)
      ├──────────► Qwen / DashScope       (Chinese LLM backup)
      ├──────────► Apify                  (XHS/Douyin scrapers — feature-flagged OFF)
      └──────────► Resend                 (daily intelligence emails)
```

**Cron jobs that were running 24/7** (`backend/scheduler.js`) — these silently spend LLM tokens:
- Daily 06:30 HK (22:30 UTC): competitor-intel agent → emails report via Resend + WeChat Work.
- Weekly Sunday 06:00 HK (22:00 UTC Sun): playbook optimizer.

> ⚠️ **This cron is the main source of "mystery" recurring spend.** Stopping the ECS box kills it.

---

## 2. Accounts & credentials inventory

| System | Owner / login | Notes |
|---|---|---|
| GitHub | `jojosuperstar0506/rebase` | Holds all code. **Do not delete.** |
| Alibaba Cloud (main) | William — console.aliyun.com | Owns ECS, OSS, billing |
| Alibaba Cloud RAM (sub) | Joanna — `joannazhang@5071674200231983.onaliyun.com`, login `https://signin.alibabacloud.com/5071674200231983/login.htm`, PowerUserAccess | Revoke after shutdown |
| Vercel | (project: `rebase`) | Frontend + serverless `/api/*` |
| Anthropic Console | console.anthropic.com | `ANTHROPIC_API_KEY` |
| DeepSeek | platform.deepseek.com | `DEEPSEEK_API_KEY` |
| Qwen / DashScope | dashscope.aliyuncs.com | `QWEN_API_KEY` |
| Zhipu GLM | open.bigmodel.cn | free tier |
| Apify | console.apify.com | `APIFY_API_TOKEN` |
| Resend | resend.com | `RESEND_API_KEY` |
| Domain (if registered) | check registrar | `rebase.ai` referenced in email "from" |

> The live secrets were stored ONLY in `/root/rebase/backend/.env` on the ECS box and
> in Vercel env vars — never committed to git. When we release the box, those secret VALUES are
> gone, but every key can be regenerated from its provider console (see §6.5).

---

## 3. BACKUP PROCEDURE — do this BEFORE cancelling anything

Estimated time: ~20–30 minutes. You need the SSH key / Alibaba Cloud Workbench access to the ECS box.

### 3.1 — Connect to the box
Alibaba Cloud Console → ECS → instance `8.217.242.191` → **Connect** (Workbench), or SSH:
```bash
ssh root@8.217.242.191
```

### 3.2 — Back up the PostgreSQL database (MOST IMPORTANT)
```bash
# Easiest, password-free method — dump as the postgres OS superuser via peer auth.
# (No need for the rebase_app password. cd /tmp avoids a harmless cwd warning.)
cd /tmp && sudo -u postgres pg_dump rebase --no-owner --no-privileges \
  > /root/rebase-db-backup-$(date +%Y-%m-%d).sql

# Sanity check it's non-trivial (was ~6.6 MB on 2026-06-25, not a few bytes):
ls -lh /root/rebase-db-backup-*.sql
head -40 /root/rebase-db-backup-*.sql   # expect "PostgreSQL database dump" + CREATE statements
```
> There is ALSO an automated nightly dump cron writing to `/var/backups/rebase/rebase_*.sql.gz`
> (gzipped, ~15 days retained). Download that whole folder too — it's free extra history.

### 3.3 — Also export the human-valuable tables to CSV (lead list = real relationships)
```bash
PSQL="psql $(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)"
# List tables first so we grab the right names:
$PSQL -c "\dt"
# Export the lead / applicant / workspace tables (adjust names to what \dt shows):
$PSQL -c "\copy (SELECT * FROM workspaces)  TO '~/workspaces.csv'  CSV HEADER"
$PSQL -c "\copy (SELECT * FROM leads)       TO '~/leads.csv'       CSV HEADER" 2>/dev/null || true
$PSQL -c "\copy (SELECT * FROM applicants)  TO '~/applicants.csv'  CSV HEADER" 2>/dev/null || true
```

### 3.4 — Save the live `.env` (so revival is instant, not a key hunt)
```bash
cp /root/rebase/backend/.env ~/rebase-env-backup-2026-06-25.txt
```
> This file contains real secrets. Store it in a password manager / encrypted vault, NOT in git,
> NOT in plain cloud storage.

### 3.5 — Back up the OSS bucket (uploaded documents)
Easiest via Alibaba Console → OSS → bucket `rebase-docs` → select all → Download.
Or with `ossutil` if installed:
```bash
ossutil cp -r oss://rebase-docs ~/oss-rebase-docs-backup/
```

### 3.6 — Download everything to your laptop
From your laptop (not the server), pull the files down:
```bash
scp root@8.217.242.191:~/rebase-db-backup-2026-06-25.sql .
scp root@8.217.242.191:~/rebase-env-backup-2026-06-25.txt .
scp root@8.217.242.191:~/*.csv .
# OSS folder: download via console, or scp the ~/oss-rebase-docs-backup/ folder
```
Or use the Alibaba Workbench "Download file" button for each.

### 3.7 — Capture the Vercel env vars (they are NOT in the DB dump)
In Vercel → Project `rebase` → Settings → Environment Variables, copy the **values** of:
`VITE_BACKEND_URL`, `VITE_API_SECRET`, `VITE_ACCESS_CODE`, `VITE_ADMIN_PASSWORD`
into the same vault as the `.env` backup.

### 3.8 — Store the backup set, verify, label
Put all of the above in ONE folder, e.g. `Rebase-Backup-2026-06-25/`, in two places (laptop +
encrypted cloud / password manager). **Open the `.sql` file and confirm it has `CREATE TABLE`
and `COPY`/`INSERT` lines.** A backup you haven't opened is not a backup.

✅ Backup is complete only when §3.2, §3.4, and §3.7 are all saved and verified locally.

---

## 4. WIND-DOWN CHECKLIST — cancel in this order (only after §3 is verified)

- [ ] **Rotate/disable all API keys FIRST** (security — the box held them all):
      Anthropic, DeepSeek, Qwen, Apify, Resend, and any `GITHUB_TOKEN`.
- [ ] **Apify** — console.apify.com → cancel subscription. (Pure China-content tooling; irrelevant to pivot.)
- [ ] **Resend** — drop to free or delete; only the cron used it.
- [ ] **Alibaba OSS** — delete bucket `rebase-docs` (after §3.5 download).
- [ ] **Alibaba ECS** — **turn OFF auto-renew, THEN release** instance `8.217.242.191`.
      (Subscription billing keeps charging if you only "stop" it — you must release it.)
- [ ] **Alibaba RDS** — only if a SEPARATE managed RDS exists (the DB was likely on the ECS box;
      confirm in Console → RDS before assuming).
- [ ] **Vercel** — downgrade to Free (or delete project). Keep the repo; the project can be re-imported.
- [ ] **Neo4j** — if a hosted Neo4j Aura instance exists, cancel it (it was a planned/optional dep).
- [ ] **Domain** — decide: keep `rebase.ai` (cheap, protects the name) or let it lapse.
- [ ] **Revoke Joanna's Alibaba RAM sub-account** once the box is gone.
- [ ] LLM pay-per-use keys (Anthropic/DeepSeek/Qwen) bill only on use — no "cancel," just stop calling. Rotating them in step 1 already guarantees zero spend.

---

## 5. What is safe vs. what dies on shutdown

| Asset | Where it lives | Survives shutdown? |
|---|---|---|
| All source code | GitHub | ✅ Yes — untouched |
| Migrations / schema definition | GitHub (`backend/migrations/*.sql`) | ✅ Yes |
| Deploy & infra docs | GitHub (this repo) | ✅ Yes |
| Database **data** (leads, workspaces, scraped intel) | ECS local Postgres | ❌ Only via §3.2 backup |
| Uploaded documents | OSS `rebase-docs` | ❌ Only via §3.5 backup |
| Secret VALUES (`.env`) | ECS box + Vercel | ❌ Only via §3.4 / §3.7 backup (else regenerate) |
| Scraper cookies / browser profiles | ECS box | ⚪ Disposable — ignore |

---

## 6. REVIVAL RUNBOOK — rebuild the whole stack from a cold start

Assumes everything was cancelled and you have the §3 backup folder. ~2–4 hours + DNS.

### 6.1 — Provision a server
Any Linux VPS works (Alibaba ECS HK again for China latency, or anything else).
Recommended: 2 vCPU / 4 GB (the old 1 GB box was tight). Open ports 22, 80, 443, 3000.
Record the new public IP — call it `NEW_IP`.

### 6.2 — Install the stack
```bash
# Node 20 LTS
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs git nginx postgresql-server postgresql-contrib
sudo npm install -g pm2

# Initialize + start PostgreSQL
sudo postgresql-setup --initdb
sudo systemctl enable --now postgresql
```

### 6.3 — Recreate the database role + empty DB
```bash
sudo -u postgres psql <<'SQL'
CREATE USER rebase_app WITH PASSWORD 'CHOOSE_A_STRONG_PASSWORD';
CREATE DATABASE rebase OWNER rebase_app;
GRANT ALL PRIVILEGES ON DATABASE rebase TO rebase_app;
SQL
```

### 6.4 — Clone the code
```bash
sudo mkdir -p /var/www && cd /var/www
sudo git clone https://github.com/jojosuperstar0506/rebase.git rebase-backend
cd rebase-backend/backend
npm install
```

### 6.5 — Restore the `.env`
Best case: drop your saved `~/rebase-env-backup-2026-06-25.txt` back in as `backend/.env`,
but **update** `DATABASE_URL` to the new password from §6.3 and any rotated keys.
If you don't have the backup, recreate it from `.env.example` at repo root. **Required vars** the
backend actually reads (from code audit):
```
DATABASE_URL=postgresql://rebase_app:PASSWORD@localhost:5432/rebase
ANTHROPIC_API_KEY=...        ANTHROPIC_MODEL=claude-opus-4-5 (or current)
API_SECRET=...               # MUST equal Vercel VITE_API_SECRET
JWT_SECRET=...               COOKIE_ENCRYPTION_KEY=...   ADMIN_SECRET=...
DEEPSEEK_API_KEY=... DEEPSEEK_BASE_URL=https://api.deepseek.com DEEPSEEK_MODEL=deepseek-chat
QWEN_API_KEY=... (optional)  RESEND_API_KEY=... (optional, for cron emails)
PORT=3000   NODE_ENV=production   FRONTEND_URL=https://<vercel-domain>
SERVER_URL=http://NEW_IP
```
Generate any missing secret with `openssl rand -hex 32`.

### 6.6 — Restore the database data, then reconcile migrations
```bash
cd /var/www/rebase-backend/backend
# Load the dump into the empty DB:
psql "$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)" < ~/rebase-db-backup-2026-06-25.sql
# The dump already contains the schema. migrate.js is idempotent and tracked via _migrations,
# so running it now safely applies anything newer / no-ops everything already present:
node migrate.js
```
> If starting WITHOUT a data backup (fresh DB), skip the `psql < dump` line — `node migrate.js`
> alone builds the full schema from `backend/migrations/001..017`.

### 6.7 — Start the app under PM2
```bash
cd /var/www/rebase-backend/backend
pm2 start server.js --name rebase-backend --update-env
pm2 save
pm2 startup        # run the command it prints, so it survives reboot
curl http://localhost:3000/health   # expect {"status":"ok",...}
```
> ⚠️ The scheduler/cron starts with server.js. If you do NOT want daily LLM spend on revival,
> confirm whether `startScheduler()` is gated behind an env flag before going live, or comment
> its call in `server.js` until you have active users.

### 6.8 — Nginx reverse proxy (port 80 → 3000)
Create `/etc/nginx/conf.d/rebase.conf`:
```nginx
server {
    listen 80;
    server_name _;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```
```bash
sudo nginx -t && sudo systemctl reload nginx
```
(Optional, recommended) HTTPS: `sudo dnf install -y certbot python3-certbot-nginx && sudo certbot --nginx`.

### 6.9 — Re-point the frontend (Vercel)
1. Re-import this repo in Vercel (framework: Vite; build & output already in `vercel.json`).
2. Set env vars (Settings → Environment Variables):
   - `VITE_BACKEND_URL = http://NEW_IP`  (or the HTTPS domain from §6.8)
   - `VITE_API_SECRET  = ` **same value as `API_SECRET` on the server** (must match or all API calls 401)
   - `VITE_ACCESS_CODE = ` the gated login code
   - `VITE_ADMIN_PASSWORD = ` admin panel password
3. Redeploy.

### 6.10 — Smoke test (end to end)
```bash
curl http://NEW_IP/health
curl -X POST http://NEW_IP/api/v2/auth/signup -H 'Content-Type: application/json' -d '{}'
#   → expect 400 {"error":"email, password, brand_name are required"}  (proves new code live)
#   → 401 {"error":"Unauthorized"} means old/wrong code path — recheck deploy
```
Then open the Vercel URL → `/signup`, complete onboarding, confirm you land on `/ci`.

---

## 7. Gotchas (the things that will bite you)

1. **`API_SECRET` (server) must equal `VITE_API_SECRET` (Vercel)** — every browser→backend call
   sends `x-rebase-secret`; a mismatch = silent 401 on everything.
2. **`git pull` does NOT update the running app** — PM2 holds old code in memory. Always
   `pm2 restart rebase-backend --update-env` after a pull or `.env` change.
3. **The cron spends money with zero users** — daily Claude/DeepSeek calls fire on schedule.
   Disable on revival until you actually have active users.
4. **Alibaba subscription billing** — "Stop" ≠ "no charge." You must disable auto-renew AND
   release the instance to truly stop billing.
5. **Migrations are forward-only and tracked in `_migrations`** — never edit an already-applied
   `.sql`; add a new numbered file instead.
6. **The DB lives LOCALLY on the ECS box** — PostgreSQL 13, db "rebase" (confirmed 2026-06-25),
   NOT a managed RDS. Releasing the box destroys it; that's why §3.2 exists. A nightly cron also
   dumps it to `/var/backups/rebase/*.sql.gz` — download that folder too before releasing.
7. **`ANTHROPIC_MODEL`** in the old `.env` points at a model that may be retired by revival time —
   set it to a current Claude model id when you come back.

---

## 8. Pivot note

We are pausing this to pursue a sharper wedge (live tariff / landed-cost intelligence for
mid-market importers — see `Overall Business Idea/`). This stack is mothballed, not deleted.
If the pivot needs any piece of it (the diagnostics/intake funnel, ERP-ingestion plumbing, the
agent/cron scaffolding), it can be revived per §6 or cherry-picked from git history.
