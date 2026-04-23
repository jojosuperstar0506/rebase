# Reply to Joanna — Please push the worktree + answers to your §7 questions

**Date:** 2026-04-23
**From:** William (with Claude)
**Re:** Your handoff `WILLIAM-HANDOFF-2026-04-23.md`
**Needed from you:** (1) push the April-22 worktree to a branch, (2) ~10 min to read this

---

## 1. Thank you — the handoff is exactly the right shape

The layer-A safety work, the YAML refactor, and the root-cause ban analysis are all strong. I've accepted your recommendations in §7 (answers below). Before we can resume, one coordination item.

---

## 2. What I currently see in GitHub (as of 2026-04-23)

Checked `main` thoroughly. Latest commits:

```
03ea5fc  2026-04-21  Will    docs: scraper setup action plan
057ef21  2026-04-20  Will    fix: Decimal → float in domain_aggregation_pipeline
28a8115  2026-04-20  Will    feat: Phase 2a — 4 brief tables + domain_aggregation_pipeline
09e9f89  2026-04-20  Joanna  feat: v3 sync — error states, orphan cleanup, localStorage namespace   ← your last push
```

**Your April-22 work is not in any branch on GitHub.** I searched:

- `main` — no `scraping_rules.yml`, no `scraping_config.py`. `xhs_scraper.py` is 896 lines but has **zero occurrences** of `XhsAuthChallengedError`, `_safe_goto`, `_find_official_account_via_user_tab_browser`. `backend/server.js` has no `SCRAPER_ENABLED` gate.
- `origin/claude/thirsty-wozniak` — exists but is stale from April 10 (`beb017a`, mobile responsive work). Coincidental name collision with your current worktree.
- All other `origin/claude/*`, `origin/Jo-*`, `fork/*` branches — nothing matching your new files.

Your handoff confirms this in the header: *"**Status of `main`:** 3 modified + 2 new files, **uncommitted** on worktree `thirsty-wozniak`."*

---

## 3. Why this is a priority

Three reasons it can't sit on your Mac for long:

1. **Single point of failure.** If your Mac disk has an issue or the worktree gets blown away, we lose roughly 400+ lines of real hardening work (YAML config, auth-wall detection, verified-account picker, 万-suffix parser).
2. **Production risk — small but real.** Your §2 Layer-A describes the scrape endpoint as gated. It's gated in your edits, but `main` still has `POST /api/ci/scrape` open. Low exploit probability given the DB cookies are wiped, but the gate should land in git so an accidental deploy can't reintroduce the risk.
3. **I can't review or extend until it's pushed.** I can read your handoff prose but I can't audit the implementation, suggest tweaks, or wire up the remaining §4 P1 rate-limit enforcement in `scrape_runner.py` because `scraping_config.py` doesn't exist anywhere I can import from.

---

## 4. What I'd like you to push — exact commands

From your worktree on your Mac:

```bash
# Step 1 — verify what you're about to commit
git status
git diff --stat                 # should show roughly: backend/server.js, scrapers/xhs_scraper.py,
                                 # README.md modified; scraping_rules.yml + scraping_config.py new

# Step 2 — stage everything your handoff listed
git add services/competitor_intel/scraping_rules.yml \
        services/competitor_intel/scraping_config.py \
        services/competitor_intel/scrapers/xhs_scraper.py \
        services/competitor_intel/README.md \
        backend/server.js

# Step 3 — commit (WIP is fine — it's a branch, not main)
git commit -m "feat(ci): XHS scraper hardening + central scraping config (Apr 22 session)

- scraping_rules.yml: single source of truth for XHS/Douyin/SYCM URLs,
  selectors, rate limits, auth-wall markers, pagination
- scraping_config.py: typed loader (nav_delay, between_brands_delay,
  cooldown_duration, active_hours_local, assert_not_on_datacenter_ip, etc.)
- xhs_scraper.py: XhsAuthChallengedError, _safe_goto with auth probe,
  verified-account picker via user-tab search, __INITIAL_STATE__ reader,
  _extract_xhs_count 万-suffix parser, d2_is_verified flag
- backend/server.js: SCRAPER_ENABLED env gate on /api/ci/scrape (503 when off)
- README.md: 'edit the YAML, not the scraper' methodology section

Context: personal XHS account banned 2026-04-22 mid-scrape. Layer A
safety measures (profile quarantine, DB cookie wipe, endpoint gate)
already applied. Scraping paused until burner account is set up.

Rate-limit enforcement in scrape_runner.py (§4 P1) intentionally left
for next session."

# Step 4 — push as a branch (NOT main — needs William's review)
git push origin HEAD:jo/scraping-hardening
```

That's it. Once it's on `origin/jo/scraping-hardening` I can:
- Review it end-to-end (no surprise edits)
- Pick up the §4 P1 rate-limit enforcement (`between_brands_delay`, `cooldown_after_n_brands`, `assert_not_on_datacenter_ip` wiring into `scrape_runner.py`)
- Open the PR to `main` for you to approve (or you can open it if you prefer)

**If you want to be extra cautious:** push as `jo/scraping-hardening-wip` and we can squash+rebase later. I don't mind which branch name, just needs to be on GitHub.

---

## 5. Answers to your §7 questions

### Q1 — 生意参谋 seller login for OMI?
**No, I don't have it.** This unblocks the decision: for now, assume no merchant-side Tmall data. The existing `sycm_scraper.py` stays parked. When OMI eventually runs its own Tmall store with a 生意参谋 account, we can revisit.

**Implication:** Phase A6 (Taobao via SYCM) is **cut from scope** for now. The user-facing experience continues to show price/product dimensions as 🔒 "Requires XHS or Tmall data source" via the metric status enum.

### Q2 — Merchant-side priority: which 2 of {千牛, 抖店, 小红书品牌号}?
**Agreed with your instinct: 抖店 + 小红书品牌号.** That's where OMI's growth is happening and it matches where the public scrapers already are (Douyin + XHS). Skip 千牛 for V1.

### Q3 — Customer installer OS priority — Mac-only or Mac+Windows parallel?
**Mac-only first.** We're MVP'ing — 2× speed matters more than reach right now. If the installer proves value with early customers on Mac, we add Windows in V2.

### Q4 — Burner rig expense (~¥1500: secondhand Mac Mini + prepaid SIM)?
**Green-light.** Keep the receipts. This is operating expense for the scraping infrastructure, not a splurge. If you find something cheaper that works (e.g., a used Mac for ¥800) that's great, but don't optimize below functional.

**One nuance:** given Q3 (customer installer is Mac-only), the burner Mac Mini doubles as our development target for the installer. Two uses of the same hardware. Good.

---

## 6. Once you push, here's what I'll do

In rough order while you're offline / on the burner-setup task:

1. **Review `jo/scraping-hardening` branch** end-to-end. File-by-file, leave comments on your PR.
2. **Wire the §4 P1 enforcement** into `scrape_runner.py`: `assert_not_on_datacenter_ip` at startup, `between_brands_delay` in the loop, `cooldown_after_n_brands` logic, `active_hours_local` check. Push as a follow-up commit on the same branch so you see it in one PR.
3. **Add the `platform_connections` daily-cap column** (§4 P1 tail) via a new migration `007_scraper_daily_cap.sql`. Small.
4. **Update `JOANNA-SCRAPER-SETUP-PLAN.md`** — fix the env var name (`REBASE_COOKIE_KEY` → `COOKIE_ENCRYPTION_KEY` per your §5.1 catch) and add a §B0 section on burner-account setup protocol.
5. **Dedupe the Nike workspace rows** (§4 P2) — 5 duplicate workspaces with junk competitors clutter testing. Cleanup SQL only, no schema change.

None of those depend on each other after (1), so you can merge the PR when you're ready and I'll rebase the follow-ups.

---

## 7. What I am NOT touching until you're back

- **Anything under `services/competitor_intel/scrapers/`** other than my `scrape_runner.py` wiring. The scraper logic is your domain.
- **`scraping_rules.yml` contents** — values are your call; I might suggest loosening one if I think it's overly conservative but I won't change without asking.
- **Anything on your Mac / your worktree / your local DB state.** All my work stays on ECS + GitHub.

---

## 8. A small thing I'd like us to do differently going forward

When either of us does non-trivial work, push a WIP branch at the end of the session even if it's not done. GitHub is cheap. Losing code because it sat on one machine is expensive. I'll hold myself to this too.

No criticism intended — the handoff doc itself is a massive improvement over "here's a Slack dump" async handoffs. Just completing the loop: handoff → worktree → branch → review.

---

## 9. TL;DR

1. **Please push your worktree** as `jo/scraping-hardening` using the commands in §4.
2. I answered your §7: no SYCM login, 抖店+小红书 priority, Mac-only installer, green-light burner.
3. I'll review + wire §4 P1 rate-limit enforcement once your branch is up.
4. No rush on your end — focus on the burner account. I'm working on the WTP scoring bug in parallel.

Ping me when the push is up.

— Will
