# Handoff to next Claude session — 2026-04-30

> **Read this first.** Then read the docs listed in §6.
> Everything in this file is the *live thread* that wasn't yet committed
> to code or other docs at the moment this session ended.

---

## 1. Where we are (one paragraph)

CI vFinal scoring foundation is solid — today shipped 7 commits including
WTP category-aware baselines (v1.2), domain rollup with `no_data` exclusion
(v1.1), per-category design_vision keywords (v1.1), `reason='no_data'`
tags on floor scores (closed the rollup story), an audit cleanup
(3 orphan endpoints deleted, semantic ColorSet tokens added), plus
verification on ECS that the pipelines produce honest `score=0,
reason='no_data'` for Nike workspace's product domain. Frontend is live
on Vercel with mock data. Joanna's April-22 scraper hardening work
(YAML config + auth-wall detection + verified-account picker) is still
**uncommitted on her Mac** — she needs to push it as a branch before
review/extension can happen.

---

## 2. The OPEN DECISION (this is what's hanging)

User asked: "Can we duplicate scraped data and re-run analysis to give
the user a feeling of a working product, in 2 days?"

**My answer:** Don't fabricate data. Instead, run AI synthesis (Tier 3 —
brief / content / opportunity / white space) DAILY on the same Tier 1+2
score data. Same numbers, fresh AI interpretation. Honest because the
freshness banner shows two timestamps: "Data refreshed [scrape date]"
and "Analysis regenerated daily."

**The 2-day plan I proposed:**

### Day 1 (4–6h)
1. `brand_positioning_pipeline.py` — produces verdict + 3 moves + top action.
   Writes to `weekly_briefs` table (already exists, migration 006).
2. `GET /api/ci/brief` endpoint
3. Wire `frontend/src/services/ciMocks.ts:getBrief()` to real API
   (flip `USE_MOCKS` flag)
4. ECS cron at 6am daily running all 12 pipelines + domain aggregation
   + brand_positioning

### Day 2 (4–6h)
5. `gtm_content_pipeline.py` — Douyin script generator (hook 3s / main
   15s / CTA 3s + hashtags)
6. `product_opportunity_pipeline.py` + `white_space_pipeline.py`
7. 3 more API endpoints + wire `getAnalytics`, `getLibrary` to real data
8. Login UX fixes (1h bundled):
   - Home page: token present → "Continue to dashboard" → `/ci`;
     no token → "Get Started" → `/onboarding`
   - Login redirect: skip homepage, land on `/ci`
   - DB cleanup: drop 4 duplicate Nike-style workspaces

### 3 confirmations I'm waiting for

1. DeepSeek API key has quota: `echo "$DEEPSEEK_API_KEY" | head -c 10`
   on ECS returns 10 chars
2. User accepts "Data refreshed [date], analysis regenerated daily"
   honesty banner
3. OK to delete the 4 duplicate workspaces (`ba09bdc1`, `b9b494e7`,
   `cfadc29c`, `3b5646bb`) — only one of these (`cfadc29c`) is
   actively used by user, others are re-onboarding cruft

**If user says yes to all 3 → start Day 1 immediately.**
**If user pushes back → renegotiate plan; the integrity rule
("no fabricated scrape data") stays.**

---

## 3. The "lost data" UX problem (also open)

User reported: "every time I log in next day, everything is lost."

**Diagnosis:** they're going through `/onboarding` instead of `/login`,
creating duplicate workspaces. The DB has 6 workspaces but probably 2
are real (OMI = `0cf0e691`, Nike = `cfadc29c`). The other 4 are
re-onboarding cruft.

**Quick fix in 2-day plan above** (Day 2 step 8). One-shot SQL +
homepage routing change.

---

## 4. Today's commits — what's live in production

```
ed66e55  fix(scoring): tag floor scores with reason='no_data' (closes v1.1 rollup story)
c199c7d  docs: test plan for today's audit + scoring fixes batch
e948086  chore(audit): delete orphan endpoints + add semantic color tokens + style helpers
0bf7e2d  fix(scoring): per-category design_vision keyword vocabularies (v1.1)
327690d  fix(scoring): exclude no_data fallbacks from domain rollups (v1.1)
dfbb272  fix(scoring): category-aware WTP baselines (v1.2)
f4fde66  docs: status update — scoring-first reprioritization, 3 fixes inbound
a088d58  docs: reply to Joanna's handoff — push request + §7 answers
```

User RAN the test plan on ECS. Verified domain_aggregation produces
`reason='no_data'` for Nike's product_domain. Frontend should now
render 🔒 N/A correctly on those cards.

---

## 5. What's pending from Joanna (BLOCKER for some work)

She has ~400 lines of XHS scraper hardening code uncommitted on her Mac:
- `services/competitor_intel/scraping_rules.yml` (NEW)
- `services/competitor_intel/scraping_config.py` (NEW)
- `services/competitor_intel/scrapers/xhs_scraper.py` (HARDENED)
- `backend/server.js` adds `SCRAPER_ENABLED` env gate

**She agreed to push as `jo/scraping-hardening`** but hadn't done so
when this session ended.

Until she pushes:
- ❌ Don't try to wire `§4 P1` rate-limit enforcement into `scrape_runner.py`
  (depends on her config module)
- ✅ The Day 1+2 plan above doesn't depend on her work

---

## 6. Reference docs to read in priority order

Already in the repo — read these before doing anything else:

1. `INTELLIGENCE-ARCHITECTURE-v3.md` (root) — product vision + phases.
   This is the governing doc.
2. `STATUS-2026-04-23-WILLIAM.md` (root) — yesterday's reprioritization
   rationale (scoring-first).
3. `TEST-PLAN-2026-04-23-AUDIT.md` (root) — what was tested today and
   what passed.
4. `WILLIAM-TO-JOANNA-2026-04-23.md` (root) — last reply to Joanna.
   Note `§5` answered her 4 questions: no SYCM seller login,
   抖店+小红书 priority, Mac-only installer, green-light burner ¥1500.
5. `JOANNA-SCRAPER-SETUP-PLAN.md` (root) — what Joanna is following.
6. `~/Downloads/WILLIAM-HANDOFF-2026-04-23.md` — Joanna's prose
   describing her uncommitted work (NOT in git).
7. `services/competitor_intel/category_baselines.py` — single source
   of truth for per-category numeric baselines + keyword vocabularies.
   Resolution order documented in module docstring.
8. `services/competitor_intel/pipelines/domain_aggregation_pipeline.py`
   — exclusion rules in `_aggregate()`. New pipelines that emit floor
   scores MUST add `reason="no_data"` to raw_inputs.

---

## 7. Strategic context that lives in the conversation, not in code

- **Three lenses always applied** before any change: Architect, UIUX,
  User (SMB owner). User explicitly asks for these.
- **No fabrication rule:** never inflate scores or invent data. Same
  data + fresh AI synthesis is fine; synthetic numeric drift is not.
- **Scraping is local-only.** ECS cron can run pipelines but NOT
  scrapers — Douyin/XHS block datacenter IPs. This is architectural.
- **Joanna got her XHS personal account banned 2026-04-22** mid-scrape.
  Burner Mac Mini (~¥1500, approved) being set up. Scraping paused.
- **OMI workspace (`0cf0e691`)** has rich data — XHS scrapes from
  earlier OMI backend access. Use this for "good differentiation"
  smoke tests.
- **Nike workspace (`cfadc29c`)** has only Douyin data — useful for
  testing the `no_data` / N/A code paths. Currently the active test
  workspace.
- **METRIC_VERSION bumps** on every scoring change. Current state:
    momentum/threat/wtp = v1.2
    voice_volume = v1.0
    consumer_mindshare = v1.2
    keywords = v1.0
    content_strategy = v1.3 (just bumped)
    kol_strategy = ?
    design_profile = v1.1
    launch_frequency = ?
    price_positioning = ?
    trending_products = v1.2 (just bumped)
    domain rollups = v1.1
- **Frontend ColorSet** now has semantic + platform + domain tokens.
  See `frontend/src/theme/colors.ts`. New code should use tokens
  (`C.platformDouyin`, `C.success`, `C.warning`, `C.domainConsumer`,
  etc.) — not hardcoded hex. Existing pages migrate opportunistically.
- **`frontend/src/theme/styles.ts`** is the new shared helpers module
  (`radii`, `space`, `motion`, `transitionAll`, `btnPrimary(C)`,
  `onHoverLift(C)`, `focusableInput(C)`). Opt-in. Existing pages
  haven't migrated.

---

## 8. Suggested first message to paste into the next session

```
Read HANDOFF-FROM-PREV-SESSION-2026-04-30.md at repo root, then read
the docs in §6 in order. After that, my decision on the 2-day plan in
§2 is: [YES / NO / MODIFIED — fill in].

If YES, start Day 1 step 1: brand_positioning_pipeline.py. Apply three
lenses before each commit. Match the existing pipeline pattern (argparse
--workspace-id | --all, run_for_workspace function, INSERT into
analysis_results, METRIC_VERSION constant). Use DeepSeek via the LLM
helper in narrative_pipeline.py. Write to weekly_briefs table (schema
already in migrations/006).

Don't try to wire scrape_runner.py rate limits — depends on Joanna's
unmerged work.
```

That gets a fresh Claude productive in ~5 minutes.

---

## 9. What NOT to do in the next session without explicit approval

- ❌ Don't fabricate / inflate / synthesize numeric scrape data
- ❌ Don't drop migration 006 (those tables are about to be used)
- ❌ Don't delete `agents/playbook-optimizer.js` (still used by scheduler.js)
- ❌ Don't push directly to `main` if Joanna has unmerged work — open a PR
- ❌ Don't run scrapers on ECS — scraping is local-only

---

*End of handoff. Total reading time for next Claude: ~5 minutes
including the §6 docs.*
