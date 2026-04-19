# Intelligence Layer — Joanna/William Handoff Tracker

> Last updated: 2026-04-20
> Sessions: Wave 1–3 (2026-04-11) → Wave 4 frontend (2026-04-12) → Wave 4 backend + bug fix (2026-04-12) → Scraper setup (2026-04-20)
> Latest commit: `db921e6`

---

## Overall Status: Intelligence layer COMPLETE. Scraper is the last blocker.

The frontend is deployed and fully wired. All 12 scorers are running on ECS. The only thing standing between zero data and a live intelligence page is Joanna's scraper — which needs to run on her Mac to feed real data into the pipeline.

**Joanna's scraper is 80% set up.** Steps 1–4 are done locally. She is blocked on SSH access to ECS (one action from William, details below).

---

## What William Needs to Do Right Now (ONE THING)

Joanna has generated an SSH key on her Mac. William needs to add it to the ECS server so she can open the DB tunnel and run the scraper.

**William runs this on ECS:**
```bash
sudo mkdir -p /home/joanna/.ssh
sudo bash -c 'echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICf0Y/mkwrn8JHuQhznGolnbwSGHYpY5hcXemtO6+WFa joanna@rebase" >> /home/joanna/.ssh/authorized_keys'
sudo chmod 700 /home/joanna/.ssh
sudo chmod 600 /home/joanna/.ssh/authorized_keys
sudo chown -R joanna:joanna /home/joanna/.ssh
```

Once done, Joanna can run the scraper immediately. No other blockers.

---

## Also: Run the Brand Name Cleanup on ECS (10 seconds)

A bug was found and fixed: the old paste-link flow stored XHS user IDs (e.g. `"XHS: 62848d2700000000210271174"`) as competitor brand names. The write path is fixed. William needs to delete the bad existing records:

```bash
# On ECS — step 1, dry run to see what's affected
curl -H "x-rebase-secret: $API_SECRET" \
  "http://localhost:3000/api/ci/admin/cleanup-brand-names"

# Step 2 — actually delete (run after reviewing step 1 output)
curl -H "x-rebase-secret: $API_SECRET" \
  "http://localhost:3000/api/ci/admin/cleanup-brand-names?confirm=true"
```

Affected users will need to re-add those competitors with correct names. The paste-link flow will now correctly prompt for a name instead of auto-saving the ID.

---

## Joanna's Scraper Setup — Current Status

| Step | Status | Detail |
|------|--------|--------|
| 1. `git pull` | ✅ Done | On `db921e6` — latest |
| 2. Python deps | ✅ Done | `psycopg2-binary`, `httpx`, `playwright`, `chromium` all installed |
| 3. `.env` configured | ✅ Done | `/Users/joannazhang/rebase/.env` — all values set |
| 4. Scraper profile dir | ✅ Done | `/Users/joannazhang/rebase-scraper-profile/` created |
| 5. SSH tunnel to ECS DB | ❌ BLOCKED | Needs William to add SSH key (see above) |
| 6. Test DB connection | ❌ Waiting on 5 | |
| 7. Browser login (XHS + Douyin) | ❌ Waiting on 5 | Needs QR scan on phone |
| 8. Test scrape one brand | ❌ Waiting on 7 | |
| 9. Full scrape all watchlist | ❌ Waiting on 8 | |
| 10. Trigger scoring pipeline | ❌ Waiting on 9 | |

**Important:** Python module is `services.competitor_intel` (underscore), NOT `services.competitor-intel` (hyphen). The architecture doc has a typo. All commands below use the correct underscore form.

### Commands to Run After William Adds SSH Key

**Terminal 1 — open SSH tunnel and keep open:**
```bash
ssh -L 5432:localhost:5432 joanna@8.217.242.191 -N
```

**Terminal 2 — verify DB connection:**
```bash
cd /Users/joannazhang/rebase
python3 -c "
import psycopg2
conn = psycopg2.connect('postgresql://rebase_app:RebaseAdmin2026@localhost:5432/rebase')
cur = conn.cursor()
cur.execute('SELECT COUNT(*) FROM workspace_competitors')
print(f'Connected! {cur.fetchone()[0]} competitors in database.')
conn.close()
"
```

**Set up browser profiles (need phone for QR scan):**
```bash
python3 -m services.competitor_intel.setup_profiles
```

**Test scrape single brand:**
```bash
python3 -m services.competitor_intel.scrape_runner --platform xhs --brand "Songmont"
```

**Full scrape:**
```bash
python3 -m services.competitor_intel.scrape_runner --platform xhs --tier watchlist
python3 -m services.competitor_intel.scrape_runner --platform douyin --tier watchlist
```

**Trigger scoring (replace workspace_id with real value from DB):**
```bash
curl -X POST -H "Content-Type: application/json" \
  -H "x-rebase-secret: a9231db3907bef4f146cea299efa9f37960781fd5f191ae5f369ba3742e082ea" \
  -d '{"workspace_id":"<actual-workspace-id>"}' \
  "http://8.217.242.191:3000/api/ci/run-analysis"
```

---

## Full Build History

### Session 1 — 2026-04-11 (Joanna)
Built the entire `/ci/intelligence` frontend from scratch — Waves 1–3. Commits `6892434`, `3802867`.

### Session 2 — 2026-04-12 (Joanna)
Wave 4 polish: interactive brand tabs in detail panel, ScoreTrendLine SVG sparkline component, ciApi.ts cleanup (removed 6 dead exports superseded by William's intelligence layer). Commit `d8023dd`.

### Session 3 — 2026-04-12 (William)
Completed all 12 scorers. Key work:
- Field name audit — fixed 10 mismatches across 4 pipelines to match frontend contracts
- Built `kol_tracker_pipeline.py` and `design_vision_pipeline.py`
- Upgraded `KOLTracker.tsx` and `DesignAnalytics.tsx` from stubs to real detail views
- Fixed `getScoreTrends()` — correctly extracts `.data` from API response
- Wired trend data into CIIntelligence.tsx (lazy-loads on card expand)
- Cleared `WAVE4_METRICS` — all 12 cards are now active
- Added both pipelines to `backend/server.js` and `run_daily_pipeline.sh`

Commit `fd22dd0`.

### Session 4 — 2026-04-20 (Joanna)
Found and fixed brand name bug: old paste-link flow was storing `"XHS: 62848d..."` as brand_name. Fixed in two places:
1. Write-time guard in `POST /api/ci/competitors` (rejects bad pattern at API level)
2. `GET /api/ci/admin/cleanup-brand-names` endpoint — dry-run to find affected records, `?confirm=true` to delete

Also ran scraper setup locally (Steps 1–4 complete). Blocked on SSH key. Commits `92e0006`, `a49e0e8`, `db921e6`.

---

## Architecture Reference

### Data Flow
```
Joanna's Mac
  └── scrape_runner.py
        ├── reads targets from workspace_competitors (via SSH tunnel → ECS Postgres)
        ├── scrapes XHS/Douyin with Playwright
        └── POSTs to /api/ci/ingest → ECS backend

ECS Backend
  └── /api/ci/run-analysis
        └── scoring_pipeline.py
              └── reads scraped_brand_profiles + scraped_products
              └── writes to analysis_results (competitor_name, metric_type, score, raw_inputs)

ECS Backend
  └── GET /api/ci/intelligence?workspace_id=X
        └── reads analysis_results
        └── returns IntelligenceData shape (domains → metrics → brands → {score, raw_inputs, ai_narrative})

Vercel Frontend
  └── CIIntelligence.tsx
        └── getIntelligence(workspaceId)
        └── renders 12 AttributeCards + detail views
```

### Vercel Function Count — CRITICAL (Hobby plan = 12 max)
Currently at **12/12**. Do NOT add new files to `api/`. Route new features through existing functions via query params.

### Key Endpoints
| Endpoint | Status |
|----------|--------|
| `GET /api/ci/intelligence?workspace_id=X` | ✅ Live |
| `GET /api/ci/dashboard?workspace_id=X` | ✅ Live (Dashboard only, not used by Intelligence page) |
| `GET /api/ci/trends?workspace_id=X&competitor=Y&metric=Z&days=N` | ✅ Live (William built) |
| `GET /api/ci/admin/cleanup-brand-names` | ✅ Live — run on ECS to fix bad data |
| `POST /api/ci/ingest` | ✅ Live — scraper pushes here |
| `POST /api/ci/run-analysis` | ✅ Live — triggers all 12 scoring pipelines |

### raw_inputs Contracts (frontend expects these exact field names)

**`keywords` → `KeywordCloud.tsx`**
```json
{ "keyword_cloud": {"word": count}, "categories": {"name": count}, "trending": ["word"] }
```

**`consumer_mindshare` → `SentimentPanel.tsx`**
```json
{ "engagement_share_pct": 12.5, "ugc_ratio": 0.78, "avg_comments_per_note": 14,
  "sentiment_ratio": 0.72, "positive_keywords": ["高颜值"], "negative_keywords": ["偏贵"] }
```

**`trending_products` → `ProductRanking.tsx`**
```json
{ "top_products": [{ "product_name": "...", "price": 599, "sales": 3200 }] }
```

**`price_positioning` → `PriceMap.tsx`**
```json
{ "price_band_distribution": {"0-500": 4, "500-1000": 8}, "avg_price": 780,
  "premium_ratio": 35, "avg_discount_depth": 18, "price_level": "mid" }
```
`price_level` values: `"entry"` (green), `"mid"` (blue), `"premium"` (purple), `"luxury"` (gold)

**`launch_frequency` → `LaunchTimeline.tsx`**
```json
{ "total_launches_90d": 24, "avg_per_week": 2.7, "acceleration_pct": 15,
  "recent_launches": [{ "name": "...", "date": "2026-03-28" }] }
```

**`voice_volume` → `VoiceVolume.tsx`**
```json
{ "follower_growth": 12.4, "content_growth": 8.1, "engagement_growth": 21.3,
  "voice_share_pct": 18.5, "platform_breakdown": {"xhs": 0.65, "douyin": 0.35} }
```

**`content_strategy` → `ContentLabels.tsx`**
```json
{ "total_notes": 1420, "engagement_per_note": 847, "n_content_types": 4,
  "top_content": [{ "title": "...", "likes": 12400 }] }
```
