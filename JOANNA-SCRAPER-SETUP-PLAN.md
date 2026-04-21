# Scraper Setup Plan — for Joanna's Claude

> **Context for Claude:** Joanna is running this plan on her Mac on April 21, 2026.
> She's picking up from where Will left off (commit `057ef21` on `main`).
> Goal: get XHS → Douyin → Taobao scrapers running from her residential IP,
> landing data in the ECS Postgres DB.
> Do NOT run scrapers on ECS — datacenter IP gets blocked. Scraping is
> local-only.

---

## 0 · Current state (before any setup)

All three scraper CODE files exist and are production-ready:

| Scraper | File | Status |
|---|---|---|
| XHS (小红书) | `services/competitor_intel/scrapers/xhs_scraper.py` | Browser-mode works. Needs her logged-in Chrome profile. |
| Douyin | `services/competitor_intel/scrapers/douyin_scraper.py` | Will verified end-to-end on Windows. She'll repeat on Mac. |
| Taobao / Tmall (via SYCM) | `services/competitor_intel/scrapers/sycm_scraper.py` | Exists but **requires merchant account access** (生意参谋). For public-side Taobao, no scraper exists yet — call this out. |

Shared setup script: `services/competitor_intel/setup_profiles.py` handles QR-code login for all three platforms and auto-pushes cookies to the ECS DB.

Shared runner: `services/competitor_intel/scrape_runner.py` with `--mode browser`.

**Joanna's SSH key is already on ECS** (Will added it at `/home/joanna/.ssh/authorized_keys`).
Password for root@8.217.242.191 is `RebaseAdmin2026` if she needs it for admin.

---

## 1 · Order of work (do in this sequence)

1. **Mac environment prep** (~15 min) — Python venv, Playwright, Chromium browser
2. **SSH tunnel to ECS DB** (~5 min) — keep this running in a separate terminal throughout
3. **XHS** (~30 min) — login profile + first scrape + verify in DB
4. **Douyin** (~15 min) — same pattern, faster because XHS warmed her up
5. **Taobao evaluation** (~15 min) — decide merchant vs public path
6. **Add OMI workspace competitors + full scrape** (~30 min) — real data end-to-end

Stop at step 4 if time's tight. Steps 5–6 are bonus.

---

## 2 · Step-by-step

### Step 1 — Mac environment prep

```bash
# Clone the repo (if she hasn't yet) - otherwise just git pull
cd ~/projects  # or wherever she keeps repos
git clone https://github.com/jojosuperstar0506/rebase.git
cd rebase
git pull  # ensure on latest

# Python 3.11+ recommended. Create venv:
python3.11 -m venv venv
source venv/bin/activate

# Install Python deps
pip install -r services/competitor_intel/requirements.txt
pip install python-dotenv psycopg2-binary cryptography jieba

# Install Playwright + Chromium browser (this downloads ~170MB)
playwright install chromium
```

**Verify:** `python -c "import playwright; print('ok')"` and `playwright --version`.

---

### Step 2 — SSH tunnel to ECS Postgres

**In a dedicated terminal, keep this running the whole time she's scraping:**

```bash
ssh -L 5432:localhost:5432 joanna@8.217.242.191 -N
```

(Will configured SSH key auth for `joanna@ecs`. No password prompt expected. If it asks for one, SSH to root first with `RebaseAdmin2026` and verify key install.)

**Verify:** in another terminal, `psql "postgresql://rebase_app:RebaseAdmin2026@localhost:5432/rebase" -c "\dt"` lists tables.

---

### Step 3 — XHS (start here)

#### 3a. Create `.env` file

In the repo root (`~/projects/rebase/`), create `.env`:

```bash
# Scraper config
SCRAPER_PROFILE_DIR=/Users/joanna/rebase-scraper-profile
DATABASE_URL=postgresql://rebase_app:RebaseAdmin2026@localhost:5432/rebase

# Crypto key (ask Will — same key as ECS uses to encrypt cookies)
REBASE_COOKIE_KEY=<ask-will-for-this>
```

**Verify:** `cat .env | grep -v '^#' | grep -v '^$'` shows 3 lines.

#### 3b. Log into XHS (one-time, QR code)

```bash
python -m services.competitor_intel.setup_profiles --platform xhs
```

What happens:
- A Chrome window opens to `https://www.xiaohongshu.com/explore`
- Scan the QR code with her phone's 小红书 app
- Once logged in, press Enter in the terminal
- Script auto-extracts cookies + pushes to ECS `platform_connections` table (encrypted)

**Expected output:** `✓ Cookies pushed to database. 小红书 (XHS / RedNote) is ready to scrape.`

**If the push fails** because SSH tunnel isn't open: script falls back to saving cookies locally.
Recovery: open tunnel, then run `python -m services.competitor_intel.push_cookies --platform xhs`.

#### 3c. Test-scrape ONE brand

Test with a single known brand before running a full sweep:

```bash
python -m services.competitor_intel.scrape_runner --platform xhs --brand "Songmont" --mode browser
```

(Songmont is Joanna's own OMI brand — good smoke test.)

**Expected output:**
- Chrome window opens (headed mode — she'll see the scraper navigate)
- Lines like `[XHS] Scraping Songmont...` and summary stats at the end
- Final: `[OK] xhs / Songmont: success (followers=XXX)`

**If scores are all zeros** or the profile doesn't load: check `.debug/` folder for page text dumps; likely a selector issue from an XHS UI change.

#### 3d. Verify data landed in ECS DB

```bash
psql "postgresql://rebase_app:RebaseAdmin2026@localhost:5432/rebase" -c \
"SELECT brand_name, follower_count, engagement_metrics, scraped_at
 FROM scraped_brand_profiles
 WHERE platform='xhs' AND brand_name='Songmont'
 ORDER BY scraped_at DESC LIMIT 1;"
```

**Expected:** one row with realistic follower count (likely 100K-1M for Songmont) and non-null engagement_metrics.

#### 3e. Scrape all OMI workspace competitors

```bash
python -m services.competitor_intel.scrape_runner --platform xhs --tier watchlist --mode browser
```

This hits every brand in `workspace_competitors` tier='watchlist'.

Rate-limit-safe: the runner has 45–90s jittered delay between brands. Don't interrupt; let it finish.

**Verify all brands at once:**
```bash
psql "postgresql://rebase_app:RebaseAdmin2026@localhost:5432/rebase" -c \
"SELECT brand_name, follower_count, scraped_at FROM scraped_brand_profiles
 WHERE platform='xhs' AND scraped_at > NOW() - INTERVAL '1 hour'
 ORDER BY brand_name;"
```

---

### Step 4 — Douyin

Same pattern as XHS but faster (she already knows the flow):

```bash
# 4a. Login (QR scan with Douyin app)
python -m services.competitor_intel.setup_profiles --platform douyin

# 4b. Smoke test with ONE brand
python -m services.competitor_intel.scrape_runner --platform douyin --brand "Songmont" --mode browser --limit 1

# 4c. Verify
psql "postgresql://rebase_app:RebaseAdmin2026@localhost:5432/rebase" -c \
"SELECT brand_name, follower_count FROM scraped_brand_profiles
 WHERE platform='douyin' AND brand_name='Songmont'
 ORDER BY scraped_at DESC LIMIT 1;"

# 4d. Full watchlist
python -m services.competitor_intel.scrape_runner --platform douyin --tier watchlist --mode browser
```

**Known Douyin-specific gotchas** (Will hit these on Windows, may recur):
- Douyin actively rate-limits. The runner has anti-bot defenses — if she sees `[ABORT] Rate-limit page detected`, STOP and wait 1–2 hours before retrying.
- Douyin doesn't expose product prices. The `price_positioning` / `trending_products` / `design_profile` / `wtp` metrics will return no-data for Douyin-only brands. This is expected — rendered as 🔒 "Requires XHS" in the UI via the status enum.
- Her Mac Chrome profile for Douyin can coexist with XHS — `SCRAPER_PROFILE_DIR` handles both.

---

### Step 5 — Taobao / Tmall decision point

**This is the fork in the road. Read carefully.**

The existing `sycm_scraper.py` uses **生意参谋** (SYCM / Seller's Compass) — Taobao's **merchant-only** analytics dashboard. It requires:
- A Tmall/Taobao SELLER account (not a shopper account)
- Access to 生意参谋 at `https://sycm.taobao.com`

**Question for Joanna:** does she have 生意参谋 access?

- **If YES (she runs an OMI Tmall store):**
  ```bash
  python -m services.competitor_intel.setup_profiles --platform sycm
  # Then:
  python -m services.competitor_intel.scrape_runner --platform sycm --tier watchlist --mode browser
  ```
  This unlocks the "OMI-style insider data" path — product catalog with prices, sales rank, category share. High-quality data.

- **If NO (she doesn't have a seller account):**
  The public-side Taobao/Tmall product page scraper doesn't exist yet. We'd need to build a new scraper (~3–4h of work, next session). For today, **skip Taobao and document this as a pending V2 item.**

**Write the decision in the session notes:** "Taobao merchant access: YES / NO." Without this info, the next session can't plan the Taobao pipeline.

---

### Step 6 — Add/verify OMI workspace competitors, then run full AI pipeline

#### 6a. Verify her OMI workspace exists and has competitors

```bash
psql "postgresql://rebase_app:RebaseAdmin2026@localhost:5432/rebase" -c \
"SELECT w.brand_name AS workspace, c.brand_name AS competitor, c.tier
 FROM workspace_competitors c
 JOIN workspaces w ON w.id = c.workspace_id
 WHERE w.brand_name = 'OMI'
 ORDER BY c.tier, c.brand_name;"
```

Expected: OMI workspace exists with competitors (Songmont, 古良吉吉, CASSILE at minimum).

If workspace doesn't exist: she creates one via the CI Settings page of the Rebase frontend (not by hand in the DB).

#### 6b. Once XHS + Douyin scrapes are in, trigger the AI pipelines on ECS

**SSH to ECS** (open a new terminal):

```bash
ssh root@8.217.242.191  # password: RebaseAdmin2026
cd ~/rebase
set -a && source backend/.env && set +a

# Run the 9 individual metric pipelines for all workspaces
for p in voice_volume mindshare content_strategy keyword kol_tracker design_vision launch_tracker price_analysis product_ranking; do
  echo "━━━ ${p} ━━━"
  ~/rebase/venv/bin/python -m services.competitor_intel.pipelines.${p}_pipeline --all \
    || echo "[WARN] ${p} failed"
done

# Roll up into 3 domains (Consumer / Product / Marketing) — runs AFTER above
~/rebase/venv/bin/python -m services.competitor_intel.pipelines.domain_aggregation_pipeline --all

# Generate the AI narrative (verdict + action items)
~/rebase/venv/bin/python -m services.competitor_intel.narrative_pipeline --all
```

#### 6c. Verify the full stack on the frontend

Open the Vercel URL → log into OMI workspace → click 竞品情报.
- Brief page should show real AI narrative (not mock)
- Analytics tab should show real priority metrics + differentiated scores
- Library will still be mock (brief_generator pipeline doesn't exist yet)

---

## 3 · Success criteria

Joanna is done when **all three** of these are true:

1. ✅ XHS login profile saved + cookies pushed to DB (`platform_connections` has an xhs row)
2. ✅ At least one full XHS scrape finished for the OMI workspace watchlist (`scraped_brand_profiles` has xhs rows for each competitor, dated today)
3. ✅ Taobao decision written down (merchant-path YES or public-scraper-TBD)

Bonus:
4. ✅ Same for Douyin (`platform='douyin'` rows in `scraped_brand_profiles`)
5. ✅ AI pipelines re-run on ECS and the Brief page shows real narrative on OMI workspace

---

## 4 · Known gotchas

| Symptom | Likely cause | Fix |
|---|---|---|
| `psycopg2 ImportError` | Binary didn't install | `pip install psycopg2-binary` |
| `Executable doesn't exist` (Playwright) | Chromium not downloaded | `playwright install chromium` |
| SSH tunnel silent hang | Key auth broken | Try `ssh -v joanna@8.217.242.191` to see verbose; if it prompts for password, tell Will to re-add the key |
| `Role root does not exist` on psql | `.env` DATABASE_URL has wrong user | Use `rebase_app`, not `root` |
| `Object of type Decimal not JSON serializable` | Old pipeline code | `git pull` — Will fixed this in `057ef21` |
| Scrape returns all zeros | Anti-bot / selector drift / cookie expiry | Check `.debug/` folder for dumped page text; re-run `setup_profiles --platform <x>` |
| `[ABORT] Rate-limit page detected` | Douyin / XHS flagged the IP | STOP. Wait 1–2 hours. Do NOT retry immediately. |
| Cookies encrypt/decrypt error | `REBASE_COOKIE_KEY` mismatch | Ask Will for the exact key — must match ECS `backend/.env` |

---

## 5 · What to send back to Will after the session

One short note with:
1. XHS scrape status: number of brands scraped, any errors
2. Douyin scrape status: same
3. Taobao decision: merchant-YES or need-public-scraper
4. Any code changes she had to make (git log of her branch if she diverged)
5. If she hit an unresolved bug: the exact error + `.debug/` file contents

Will uses this to plan the next session (brand_positioning pipeline + prompt work).

---

## 6 · Reference — file locations

```
services/competitor_intel/
├── scrapers/
│   ├── xhs_scraper.py           ← XHS browser + API scraper
│   ├── douyin_scraper.py        ← Douyin browser + API scraper
│   └── sycm_scraper.py          ← Tmall merchant backend (生意参谋)
├── setup_profiles.py            ← One-time login with QR, auto-pushes cookies
├── scrape_runner.py             ← Main entrypoint for scraping (--platform --mode --brand --tier)
├── push_cookies.py              ← Recovery tool if setup_profiles couldn't reach DB
└── db_bridge.py                 ← Shared DB connection + cookie crypto

backend/migrations/
└── 006_brief_tables.sql         ← Already applied on ECS (Will ran it)
```

*Last updated: April 21, 2026 by Will's Claude · Commit `057ef21`*
