# Handoff to William — Scraper Methodology Upgrade

**Date:** 2026-04-23
**From:** Joanna (with Claude)
**Status of `main`:** 3 modified + 2 new files, **uncommitted** on worktree `thirsty-wozniak`
**TL;DR:** My personal XHS account got banned by anti-bot. We hardened the XHS scraper, gated the scrape endpoint, revoked the banned cookies in DB, and moved all rate-limit + selector config into a central YAML. Scraping is **paused** until we get a burner account. This doc tells you what happened, what's safe to touch, and where we go next.

---

## 1. What happened

**Timeline:**
- **2026-04-21 evening** — I worked through your `JOANNA-SCRAPER-SETUP-PLAN.md` (commit `03ea5fc`). Got to Phase A4 (XHS). Scraper had three issues that day:
  - Picked wrong XHS account (no verified-badge check) → returned data for some unrelated handle
  - Couldn't read follower/like/note counts reliably (XHS's `万` suffix + DOM layout variations)
  - Would occasionally hit XHS auth walls and just return zeros silently
- Fixed all three over ~3 hours with `xhs_scraper.py` edits: a `&type=users` search pass with verified-ranking, a `__INITIAL_STATE__` / `__INITIAL_SSR_STATE__` / `__NEXT_DATA__` reader + a `_extract_xhs_count()` 万-aware regex, and a `_safe_goto()` wrapper with auth-wall probe.
- Ran Songmont smoke successfully (321.0K followers, 619K likes).
- **2026-04-22 (~20 hours after the testing session)** — my personal XHS account `Joannajoann(AI接班版)` got frozen by XHS for "利用自动化（含AI）工具进行内容浏览与账号互动". 3–7 day freeze. This is the account whose cookies were in `platform_connections` (the account we were scraping from).

**Six compounding causes of the ban:**
1. Account nickname literally contains "AI" — almost certainly keyword-matched by anti-bot.
2. Using a personal account with 7K+ followers — XHS weighs established accounts more heavily on automation flags (they have more to lose, but also more signal).
3. ~25 navigations in 50 min during A4 testing — way above human rate.
4. The extra user-tab hop I added (`&type=users` lookup before profile visit) doubled navs per brand.
5. Playwright CDP leaks even with `--disable-blink-features=AutomationControlled`.
6. Zero idle time between brands — scrape → next brand instantly.

---

## 2. What we did (safe to review & extend)

### Layer A — "Stop the bleeding" (all done, ban is isolated)

| # | Action | Where |
|---|---|---|
| A-1 | Quarantined the Playwright profile dir so no local run can replay banned cookies | `~/rebase-scraper-profile` → `~/rebase-scraper-profile.banned-20260422` (on my Mac) |
| A-2 | Gated `POST /api/ci/scrape` behind a new `SCRAPER_ENABLED=true` env var. Default: off. Returns 503 `scraper_paused` otherwise. | `backend/server.js` lines ~1267–1286 |
| A-3 | In Postgres, set the XHS row in `platform_connections` to `status='expired'` and wiped `cookies_encrypted` to `''`. Row id: `249a96e6-29fb-46cb-8b6f-cd4dda9b0299`, workspace = OMI. | Prod DB via SSH tunnel |

**Net effect:** Even if `SCRAPER_ENABLED` is flipped on, there are no valid cookies to decrypt. Four separate things would have to be reversed to accidentally scrape from the banned account.

### Phase C — Central scraping config (partially done, good pattern for us both)

The big methodology win. Previously, selectors + URLs + delays lived scattered inside `xhs_scraper.py` / `douyin_scraper.py` method bodies. When XHS changed a CSS class, either of us had to hunt through ~600 lines. When we both wanted to tune delays, we risked merge conflicts.

**New architecture:**

```
services/competitor_intel/
├── scraping_rules.yml       ⭐ NEW — single source of truth
├── scraping_config.py       ⭐ NEW — loader with typed helpers
└── scrapers/
    └── xhs_scraper.py       MODIFIED — reads auth_wall_markers + nav_delay from YAML
```

**What the YAML covers today:**

| Section | Contents |
|---|---|
| `xhs.urls` | `profile`, `search_notes` (`type=51`), `search_users` (`type=users`), `home` |
| `xhs.selectors` | `follower_count`, `like_count`, `note_card`, `profile_anchor`, `verified_badge`, `rate_limit_marker` |
| `xhs.auth_wall_markers` | 6 phrases that indicate XHS served a login wall (was a module const, now YAML) |
| `xhs.account_scoring` | Weights + verify-badge marker list for the user-tab picker |
| `xhs.rate_limit` | See next section — the important part |
| `xhs.pagination` | `max_note_cards`, `scroll_step_px`, `scroll_pause_seconds` |
| `douyin.*` | Same shape, pre-populated with conservative defaults |
| `sycm.*` | Same shape, looser limits because it's an authenticated seller session |

**Rate-limit values** (do not loosen these without discussing):

```yaml
xhs.rate_limit:
  nav_delay_seconds: [7, 13]                # jittered pause between page.goto()
  between_brands_seconds: [300, 900]        # 5–15 min between brand scrapes
  max_navs_per_brand: 6
  cooldown_after_n_brands: 5
  cooldown_duration_seconds: [3600, 7200]   # 1–2 hr idle every 5 brands
  max_scrapes_per_account_per_day: 10
  active_hours_local: [9, 23]               # no 2–7 AM scraping
  forbidden_ip_hostname_substrings:         # blocks ECS scraping
    - aliyun
    - amazonaws
    - googleusercontent
    - digitalocean
    - linode
```

Previously we had no enforced gaps between brands. That's what got us banned.

**Loader (`scraping_config.py`):**
- `load_rules(platform)` — returns the platform dict
- `nav_delay(platform)` — returns a jittered float, ready for `asyncio.sleep`
- `between_brands_delay(platform)` — same pattern
- `cooldown_duration(platform)`, `cooldown_after_n_brands(platform)`, `max_navs_per_brand(platform)`
- `max_scrapes_per_account_per_day(platform)`, `active_hours_local(platform)`
- `assert_not_on_datacenter_ip(platform)` — **call this at scraper startup**; raises if reverse-DNS matches forbidden substrings
- `auth_wall_markers(platform)` — returns tuple for `XhsScraper._safe_goto()`
- `dump_summary(platform)` — print rate-limit summary for debugging
- `ScrapingRulesError` — raised on missing file / bad YAML / missing platform. We fail loudly on purpose.
- Smoke test: `python -m services.competitor_intel.scraping_config`

**What's wired into `xhs_scraper.py` so far:**
- `_XHS_AUTH_WALL_MARKERS` now loaded from YAML (fallback to hardcoded tuple if YAML missing)
- `_safe_goto()` reads nav delay from YAML instead of hardcoded 7–13s

**What's NOT wired yet (leftover):**
- `between_brands_seconds` — `scrape_runner.py` still goes brand-to-brand with no enforced gap. **This is the single most important remaining wiring task.** Without it, rate limits only exist on paper.
- `cooldown_after_n_brands` + `cooldown_duration_seconds` — not enforced
- `max_scrapes_per_account_per_day` — not enforced
- `active_hours_local` — not enforced
- `assert_not_on_datacenter_ip()` — helper exists but nobody calls it
- `selectors.*` — still hardcoded in scrapers. Lower priority since they change less often.
- `account_scoring.*` — verify-marker list + weights still hardcoded in `_pick_best_account()`. Low priority until next XHS layout change.
- `douyin_scraper.py` — not refactored at all yet. Start here when you touch Douyin.

---

## 3. Current state of `xhs_scraper.py` (what you'll find)

The file is ~600 lines now (was ~400). Key additions on top of the original:

| Symbol | Purpose |
|---|---|
| `XhsAuthChallengedError` | Raised by `_safe_goto` when a login wall appears |
| `XhsBrandData.d2_is_verified: bool` | New field; true if the picked account has a verify badge |
| `_safe_goto(page, url, min_wait?, max_wait?)` | Replaces raw `page.goto()`. Reads delay from YAML. Probes for auth walls. |
| `_find_official_account_via_user_tab_browser(page, brand)` | Navigates to `search_result?type=users`, enumerates anchors via `page.evaluate`, scores candidates, picks best |
| `_pick_best_account(candidates, brand)` | Scoring: +10 verified, +5 name/name_en match, +3 keyword match, +N/万 followers capped +20 |
| `_find_counts_in_state(state_obj)` | Recursive walker; finds `fansCount`, `noteCount`, `likedCount` variants in `__INITIAL_STATE__` / `__INITIAL_SSR_STATE__` / `__NEXT_DATA__` |
| `_extract_xhs_count(text, label)` | Regex + 万/w suffix handling. Handles both "45.6万粉丝" and "粉丝 45.6万" orderings |
| Top-level `except XhsAuthChallengedError` | Returns `scrape_status='auth_challenged'` instead of silently writing zeros |

The catalog-length fallback (`if d2_total_notes == 0 and full_note_catalog: d2_total_notes = len(full_note_catalog)`) is in `scrape_brand_browser()`.

---

## 4. What's left — prioritized

### 🔴 P0 — Don't scrape yet
**B0. Burner XHS account.** Any further XHS scraping must be from a disposable account, not a real one. The plan:
1. Fresh SIM (eSIM or cheap 流量卡, ~10¥/mo)
2. Register new XHS with a boring human name — "李小雨", "momo的日常". **Never** include AI/bot/crawler/auto/版 in the nickname
3. Manually pre-warm 2–3 days: follow 20–30 accounts, like ~50 notes, comment 3–5, post 1 real note
4. THEN export cookies via `setup_profiles.py`
5. Expected lifetime: 1–3 months before ban. Treat accounts as consumables.

If we can do it on a different device (old phone, cheap Mac Mini) on a different network (mobile hotspot vs. home Wi-Fi), the lifetime doubles. Using my banned Mac + home IP with a new account is the compromise version — it'll work but not forever because XHS has seen this fingerprint.

### 🟠 P1 — Enforce the rate limits that currently only exist on paper
In `scrape_runner.py`, between brand iterations:
```python
from services.competitor_intel.scraping_config import between_brands_delay, cooldown_after_n_brands, cooldown_duration, active_hours_local, assert_not_on_datacenter_ip

assert_not_on_datacenter_ip(platform)  # at startup
# ... existing loop ...
if i > 0:
    await asyncio.sleep(between_brands_delay(platform))
if (i+1) % cooldown_after_n_brands(platform) == 0:
    await asyncio.sleep(cooldown_duration(platform))
```
Also gate on `active_hours_local` — if current hour is outside, exit with a clear message.

Daily-cap enforcement needs a small DB touch: query `scraped_brand_profiles WHERE platform=X AND scraped_at > NOW() - INTERVAL '24 hours'` and short-circuit if count ≥ `max_scrapes_per_account_per_day`. Probably clean to add a column to `platform_connections` tracking last-24h nav count, bumped by the scraper.

### 🟡 P2 — Data hygiene
- OMI workspace `0cf0e691-89f4-46f5-8c6f-ad227339e600` has only 3 competitors in `workspace_competitors` (CASSILE / Songmont / 古良吉吉). `config.BRAND_GROUPS` has 20. Decide: add 17 more to the DB, or fall back to `BRAND_GROUPS` when the workspace list is <N.
- Nike workspace exists 5× with junk competitors ("shoe", Adidas ×3, etc.) — dedupe + cleanup.

### 🟡 P2 — Finish Phase C refactor
- Wire selectors from YAML into `xhs_scraper.py` (right now only auth markers + nav delay are wired)
- Refactor `douyin_scraper.py` to read from YAML (mirror what we did for XHS)
- Move `account_scoring` weights + verify markers from `_pick_best_account()` into YAML reads

### 🟢 P3 — Originally planned, now unblocked-but-deferred
- **A5 Douyin** — not banned, but scraping it from my same fingerprinted Mac before burner is done just trades one platform's risk for another's. Wait.
- **A6 Taobao / SYCM** — still need your input: does OMI have a 生意参谋 seller account we can use? Yes/no unblocks Phase B.
- **A7** — rerun ECS AI pipelines. Gated by having real scraped data, which is gated by B0.

### 🟢 P3 — Bigger plan
See `.claude/plans/hazy-mapping-blossom.md` for the full 4-phase plan:
- **Phase A** — Run scrapers locally on my Mac (mostly done, blocked on B0)
- **Phase B** — Merchant-side scrapers (抖店, 小红书品牌号, 千牛) — different risk model, logged-in seller sessions
- **Phase C** — Centralize scraping logic (in progress, see above)
- **Phase D** — One-button customer installer (Mac/Windows, wraps `setup_profiles` + `scrape_runner` in a native app)

---

## 5. Things I think are important for you to know

1. **The env var name in your original plan was wrong.** You wrote `REBASE_COOKIE_KEY` in `JOANNA-SCRAPER-SETUP-PLAN.md` — the actual variable read by `crypto_utils.py:22` and `backend/server.js:1025` is `COOKIE_ENCRYPTION_KEY`. I flagged this in a comment block in my local `.env`. Worth updating the plan doc for the next person.

2. **The SSH tunnel password-prompt thing is a papercut.** The tunnel drops every few hours when idle. Restarting it means typing the password every time (sshpass isn't on my Mac by default). For long-running work, key-based auth would save a lot of friction. Low priority.

3. **Scraping from ECS will never work for XHS / Douyin.** Datacenter IPs get instant-banned. The `forbidden_ip_hostname_substrings` guard in the YAML exists to make this a hard error, not a silent failure. If you ever see logic that scrapes XHS/Douyin from the server, it's wrong.

4. **The customer-installer angle (Phase D) changes the threat model.** When real Rebase customers run the scraper on their own Macs, each customer is their own residential IP + fingerprint. That's actually better than one burner of ours. But it also means the rate limits in `scraping_rules.yml` need to be enforced per-customer-per-workspace, not globally.

5. **I'd recommend we both get in the habit of:**
   - Running `python -m services.competitor_intel.scraping_config` before and after YAML edits to confirm the loader parses cleanly
   - Looking at `.debug/` dumps whenever a scrape returns zeros — `xhs_scraper.py` now dumps the page text there when counts are missing
   - Treating `XhsAuthChallengedError` log lines as a P0 signal, not a routine "try again tomorrow" — it means a real person needs to refresh cookies OR the rate limits need to tighten
   - **Never running scrape_runner in a tight loop during testing.** Each run is a navigation budget spent against anti-bot. If smoke-testing, use one brand at a time with 5+ min between runs.

6. **One file the plan didn't account for:** `backend/migrations/` — if we add daily-cap tracking to `platform_connections` (P1 above) we'll need a migration. Keep migrations sequential.

---

## 6. Files changed this session (for code review)

**Modified:**
- `backend/server.js` — gate on `/api/ci/scrape` (+16 lines)
- `services/competitor_intel/README.md` — "edit the YAML, not the scraper" section (+41 lines)
- `services/competitor_intel/scrapers/xhs_scraper.py` — account picker + count parser + auth-wall detection + YAML wiring (+386 lines over original)

**New:**
- `services/competitor_intel/scraping_rules.yml` — central config
- `services/competitor_intel/scraping_config.py` — loader
- `.debug/` — local-only dump directory (gitignored, not reviewed)

**Plan docs (local to my Claude sessions):**
- `.claude/plans/hazy-mapping-blossom.md` — full 4-phase plan if you want the bigger picture
- `JOANNA-SCRAPER-SETUP-PLAN.md` — your original setup doc (unchanged, commit `03ea5fc`)

**Production DB state change:**
- `platform_connections` row `249a96e6-29fb-46cb-8b6f-cd4dda9b0299` (OMI workspace, XHS): `status` active→expired, `cookies_encrypted` wiped. Reversible by re-running `setup_profiles --platform xhs` after the burner account is ready.

---

## 7. Questions I need from you before we resume

1. **Do you have the HK region 生意参谋 seller login for OMI?** (Phase A6 / Phase B depends on it.)
2. **Merchant-side priority** if we can only build 2 of {千牛, 抖店, 小红书品牌号} this month, which 2? My instinct is 抖店 + 小红书品牌号 since that's where OMI's growth is. Confirm?
3. **Customer installer OS priority** — Mac-only first (2× faster) or Mac + Windows in parallel?
4. **Burner account cost** — I can expense a secondhand Mac Mini + prepaid SIM (~¥1500 total) for a dedicated scraping rig. Green-light or hold off?

Ping me on Slack when you've read this. Happy to walk through any section on a call.

— Joanna
