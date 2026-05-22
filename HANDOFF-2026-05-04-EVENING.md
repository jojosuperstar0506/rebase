# Handoff — 2026-05-04 evening session

> Read this first. Then read the docs in §10 in priority order.

---

## 1. One-paragraph status

This session shipped **10 commits direct to `main`** building toward Will's first client demo:

1. Composite indices V1 (12 indices × 3 pillars + scatter plot)
2. Multiple rounds of bug fixes (start-analysis resilience, scatter completeness, LLM hardening, settings sync, TS build error)
3. Built a **demo seeder** that bypasses scrapers and writes curated McKinsey-quality data to one workspace for client screen-recordings
4. Tightened the demo narratives to consultant-grade (named data sources, P&L modeling, quantified strategic options)
5. Built a "demo lock" UX that prevented accidental edits to the demo dataset
6. **Reverted the demo lock** per Will's clarified UX — demo workspace should let users "mimic the flow" with full interactivity

**End state**: code-side complete. The demo workspace lands the user on a pre-populated TORY BURCH workspace with 6 competitors and full Brief/Analytics/Library data, but with all the regular user-flow buttons (Reset, Add Competitor, rename, remove) still working. Mimics a real customer who already has data.

**What's blocked**: ECS-side activation. The seeder hasn't been run against the Tory Burch user's workspace yet — so when Will logs in with `RB-TORYBU-841E` he still sees an empty OMI workspace from prior testing. Three commands on ECS (in §3 below) activate the demo.

---

## 2. Commits shipped to `main` this session (chronological)

```
5b1c773  revert(ci/settings): remove demo lock UI; pre-populated demo + normal user flow
cd5ece1  feat(ci/demo): is_demo flag locks Settings UI on demo workspaces  ← reverted by 5b1c773
a95e475  ux(ci/settings): collapse add-competitor UI when configured
4b9ee6f  fix(ci/demo): consultant-grade narrative quality + seeder safety check
5dfd61a  feat(ci): demo seeder for screen-recording client demos
de194e7  fix(ci): scatter plot only shows 1 brand of N — reconcile + reorder
0826e29  fix(ci): start-analysis resilience + auto-resume polling on Brief
4fc7b1c  fix(ci): LLM-call hardening — surface real errors, stop silent failures
bc2749a  fix(ci/settings): use API workspace.id for backend sync (TS build fix)
939c863  fix(ci/settings): sync competitor add/remove to backend immediately
```

### Per-commit summary

**939c863** — Settings page now eagerly syncs competitor add/remove to backend (`POST /api/ci/competitors`) instead of localStorage-only. Previously orchestrator never saw new brands → user reported scatter showing only 1 of 6 competitors.

**bc2749a** — TS build fix. The above referenced `workspace.id` from the localStorage `CIWorkspace` shape (no `id` field there). Switched to `getWorkspace().data.id`. Vercel build was failing with 7× TS2339.

**4fc7b1c** — Hardened LLM call surface. 5 fixes: single `buildDeepseekUrl()` helper (URL drift caused partial outages), `AbortSignal.timeout(30s)` on both `callLLM` and `translateBatch`, cache-poisoning guard on Brief's translate-on-demand, surfaced real upstream errors via `tryApiVerbose()` to AI Suggestions banner, structured `LlmCallError` exception in Python pipelines.

**0826e29** — Start Analysis resilience. handleStart distinguishes `'fetch' | 'create' | 'analysis'` failure modes with specific copy. If runAnalysis returns null but a prior `rebase_ci_analysis_job_id` exists, navigates to /ci anyway. Added auto-resume polling to CIBrief — when both `rebase_ci_analysis_job_id` AND `rebase_ci_analysis_started` are set, Brief auto-shows orchestrator stage progress on mount.

**de194e7** — Scatter plot completeness. Three fixes: (1) orchestrator was fail-fast and ran composite_indices LAST after 4 LLM stages — moved to Stage 4 (right after domain aggregation, before LLM stages). (2) handleStart now reconciles local→backend competitors unconditionally (not only when wsId is `'local'`). (3) Per-competitor diagnostic logging in composite_indices.py.

**5dfd61a** — Demo seeder MVP. New `services/competitor_intel/demo_seeder.py` (~875 LOC) writes curated data for one workspace: 6 hand-picked TORY BURCH competitors with full 16-metric profiles, products, brand_insight narratives, weekly_briefs, content_recommendations, product_opportunities, white_space_opportunities. Triggers `composite_indices.compute_all_for_workspace()` to derive the 12 composite indices. Idempotent. Workspace-isolated.

**4b9ee6f** — Two follow-ups on the seeder: (1) safety allowlist — refuses to overwrite a workspace whose `brand_name` isn't in `SEED_ALLOWLIST_NAMES = {'', 'TORY BURCH', 'OMI', 'Testing 5.3', 'Testing 5.4', ...}` unless `--override` flag passed. (2) Lifted demo data to McKinsey-grade: data-source attribution, 12-month GMV-at-risk modeling, quantified strategic options with payback math, named owners + deadlines, voice-of-customer UGC quotes per brand, P&L for the product opportunity, "why this score" reasoning on every white space.

**a95e475** — General UX win for ALL workspaces. When `competitors.length > 0`, Settings shows a `✓ N competitors configured` banner pointing to Reset, with AddCompetitorSection collapsed behind a `<details>` "+ Add another competitor" disclosure. Empty state unchanged.

**cd5ece1** — Demo workspace lock UX (later reverted by 5b1c773). Added `is_demo BOOLEAN` column to `workspaces` (migration 009). Frontend gated UI on it.

**5b1c773** — Reverted the lock UX from cd5ece1. The demo workspace now feels like a real-customer-with-data: pre-populated, fully interactive. Migration 009 + the seeder's `is_demo=TRUE` write are preserved (harmless flag, future-proofs re-locking).

---

## 3. Operational state — what to apply on ECS

These commands enable the demo on ECS. **Run them in order.** Steps that may already be done are marked with ⚠️.

```bash
cd ~/rebase
git pull                                     # → up to 5b1c773 (latest)

set -a && source backend/.env && set +a

# Migration 008 (composite_indices table) — likely already applied earlier
psql "$DATABASE_URL" -f backend/migrations/008_composite_indices.sql || echo "(maybe already applied)"

# Migration 009 (workspaces.is_demo column) — NEW THIS SESSION
psql "$DATABASE_URL" -f backend/migrations/009_workspace_is_demo.sql

# Restart PM2 so new server.js (with /api/ci/indices, resolveLang, etc) is live
pm2 restart rebase-backend

# Find the right workspace UUID. The user behind RB-TORYBU-841E may already
# have an OMI workspace from prior testing — that's the one to seed.
# "OMI" is in SEED_ALLOWLIST_NAMES so the seeder will accept it.
psql "$DATABASE_URL" -c "
  SELECT id, brand_name, user_id, is_demo, created_at
  FROM workspaces
  ORDER BY created_at DESC LIMIT 10
"

# Run the seeder against the right UUID
python -m services.competitor_intel.demo_seeder \
  --workspace-id <UUID-FROM-ABOVE> --confirm

# Expected output ends with:
#   [demo] ✓ workspace identity updated → TORY BURCH (is_demo=TRUE)
#   [demo] ✓ Done. The dashboard should now render fully populated.
```

After running, log in as `RB-TORYBU-841E`:
- **Settings tab** — TORY BURCH brand profile + 6 competitors (COACH, MICHAEL KORS, Dissona, MCM, 古良吉吉, VALENTINOORLANDI). Reset visible. ✎ rename and × remove on each row. "+ Add another competitor" collapsed below.
- **Brief tab** — verdict + 3 quantified moves naming specific competitor actions, with named UGC quotes
- **Analytics tab** — all 12 composite indices populated, scatter with 7 brands plotted at distinct positions
- **Library tab** — current week's brief in archive
- **Brands tab** — 6 competitors with per-brand AI insight narratives (consultant-grade analysis)

---

## 4. Backlog / next priorities

After demo is verified working on ECS:

### High-value next items

| # | Item | Effort | Why |
|---|------|--------|-----|
| A | Joanna verifies the demo flow end-to-end as a prospect would experience it | 30 min UX review | Catches anything we missed; informs sales script |
| B | Decide: should `Start Analysis` on a demo workspace skip `brand_positioning` LLM regen so curated Brief copy persists across click-arounds? | 1 hr discuss + ~30 LOC | Today, clicking Start Analysis on demo will overwrite the McKinsey-grade Brief with LLM output (the underlying numbers stay good but copy changes) |
| C | Multi-tenancy fix: Vercel `/api/auth/verify-code` signs JWT with `sub: 'user'` (literal string), backend signs with phone. Vercel-issued JWTs all share `user_id='user'` server-side → workspaces collide. Need to align before sharing platform with multiple real customers | 2-3 hr | Prevents cross-customer workspace leak in production |
| D | Cinch Tote concept (white_space #1 in seed data) — if demos go well, build a real product opportunity flow for the Brief tab | TBD | Customer-facing differentiation |

### Lower-priority but on the radar

- Render `data_sources` field on the Brief tab (seeder already writes it but UI doesn't render yet)
- Admin "list demo workspaces" tool using the `is_demo` partial index
- Backfill English translations for legacy zh-only weekly_briefs (script at `services/competitor_intel/backfill_translations.py` from PR #34)
- Cron timing: full daily pipeline grew to 50-70 min for one workspace post-LLM-hardening — worth a single-workspace timing check
- Continue J1 burner XHS account thread (blocks fresh-data work for non-demo customers)

---

## 5. For Joanna — strategic / product items

Hi Joanna 👋 — handoff specifically for you.

### A. We have a working client demo

**TORY BURCH demo workspace** activated by invitation code `RB-TORYBU-841E`. Once Will runs the seeder on ECS (one command), prospects can log in and see:
- Fully populated dashboard with TORY BURCH as own brand
- 6 curated competitors (COACH dominant, 古良吉吉 rising guochao threat, MICHAEL KORS fading, MCM declining, Dissona NPS surge, VALENTINOORLANDI niche)
- Brief verdict with named data sources, 12-month GMV-at-risk modeling, 3 quantified moves
- Product opportunity with full P&L (¥6.8M invest, 18-22 mo payback)
- White spaces with explicit "why this score" reasoning + 5-7 supporting data points each
- All Settings + interactive buttons work normally — prospect can click around like a real user

This was hand-crafted by Will + Claude. Numbers are realistic and grounded in Douyin Compass screenshots. **Worth reading the seed file `services/competitor_intel/demo_seeder.py` to see what "consultant-grade output" looks like** — useful reference when we wire similar narrative depth for real customers.

### B. The 12 composite indices framework is fully shipped

3 pillars × 12 indices, all derived from the 16 raw scoring pipelines. Spec: `SPEC-COMPOSITE-INDICES-V1.md`. UI lives on the Analytics tab + scatter plot for picking any 2 indices for X/Y comparison. Per-category hierarchy (女包 / 美妆个护 / 食品饮料 / 家居生活 / 鞋类 + default) determines hero-per-pillar — easy to extend when we onboard new categories.

### C. Strategic question for you

The demo workspace tells a clear story: "TORY BURCH is squeezed between COACH dominance and 古良吉吉 momentum." Defensible because the underlying data is consistent.

For a **real customer** (e.g. real OMI prospect), Will currently has no scraping pipeline that can produce equivalent depth. Scrapers blocked on the J1 burner XHS account remain blocked. So the question for product positioning:

> **When we sell Rebase to a real prospect, what's the path from "demo we showed you" → "your actual data populated by next week"?**

Three options:
1. **Sell the demo as forward-looking** — "this is the kind of intelligence we'll generate from your scrapes" — accept a 1-2 week onboarding delay
2. **Build a manual onboarding tool** where Joanna or Will hand-crafts the first Brief based on competitor desk research (~4-6 hr one-time investment per new customer to populate their first dashboard). Could feel premium / white-glove.
3. **Wait until J1 burner work resumes** and full automation is back

Worth a 30-min conversation. The demo flow is convincing; the gap to real customer scale is the open question.

### D. Multi-tenancy concern (for Will / next-session Claude, but worth knowing)

JWT auth bug: Vercel's `/api/auth/verify-code` signs all tokens with `sub: 'user'` (literal). Backend `/workspace/me` queries `WHERE user_id = $1`, so all Vercel-issued JWTs share `user_id='user'` server-side. In testing this isn't a problem because we're typically the only user. But before sharing the platform with multiple real customers, this needs to be fixed (item C in §4).

---

## 6. For next Claude / Will session

Top items in priority order:

1. **Run the seeder on ECS** (§3 above) so the demo activates — 5 min ops
2. **Verify end-to-end** in browser as RB-TORYBU-841E user — 5 min
3. **Discuss with Joanna** the items in §5 above
4. **Decide on item B** in §4 (preserve curated Brief through Start Analysis click) before any live demo

Don't start new feature work until the demo flow is verified working. The narrative quality from this session is the most valuable artifact and worth ensuring it's seen by an actual prospect before shipping anything else.

---

## 7. Files / locations to know

| Location | What |
|---|---|
| `services/competitor_intel/demo_seeder.py` | The whole demo dataset + seeder logic (~875 LOC, well-commented) |
| `services/competitor_intel/composite_indices.py` | 12-index compute layer (~700 LOC). Reads `analysis_results.raw_inputs` + `scraped_products` |
| `services/competitor_intel/index_hierarchy.py` | Per-category hero/supporting pillar config |
| `backend/migrations/008_composite_indices.sql` | composite_indices table |
| `backend/migrations/009_workspace_is_demo.sql` | is_demo flag column |
| `services/competitor_intel/run_analysis_for_workspace.sh` | Orchestrator (Stage 4 = composite_indices, runs before LLM stages) |
| `frontend/src/services/ciIndices.ts` | Types + fetch helper for `/api/ci/indices` |
| `frontend/src/components/ci/IndexCard.tsx` | Single index card (hero/small/proxy/coverage-pending) |
| `frontend/src/components/ci/PillarSection.tsx` | Pillar wrapper (responsive grid) |
| `frontend/src/components/ci/IndexScatterPlot.tsx` | Raw-SVG scatter with X/Y axis pickers |
| `frontend/src/pages/ci/CIAnalytics.tsx` | Composite indices integration + Comparison View |
| `frontend/src/pages/ci/CISettings.tsx` | Settings page (configured banner + collapsed Add disclosure) |
| `C:\Users\wchiang\.claude\plans\federated-snacking-raven.md` | Approved plan for the now-completed revert (historical) |

---

## 8. Useful commands

```bash
# On the Windows dev box (no node/npm/gh available — by design):
git log --oneline origin/main -10                # latest commits
git diff origin/main..HEAD --stat                 # what's local-only
python -m services.competitor_intel.composite_indices --workspace-id <UUID>  # smoke compute
python -m py_compile services/competitor_intel/demo_seeder.py                # syntax check

# On ECS (8.217.242.191):
cd ~/rebase && git pull
set -a && source backend/.env && set +a
psql "$DATABASE_URL" -f backend/migrations/008_composite_indices.sql
psql "$DATABASE_URL" -f backend/migrations/009_workspace_is_demo.sql
pm2 restart rebase-backend
pm2 logs rebase-backend --lines 50
python -m services.competitor_intel.demo_seeder --workspace-id <UUID> --confirm

# Find the right workspace UUID for RB-TORYBU-841E:
psql "$DATABASE_URL" -c "
  SELECT id, brand_name, user_id, is_demo, created_at
  FROM workspaces ORDER BY created_at DESC LIMIT 10
"
```

---

## 9. State of branches

```
origin/main (head):
  5b1c773  revert(ci/settings): remove demo lock UI; pre-populated demo + normal user flow
  cd5ece1  feat(ci/demo): is_demo flag locks Settings UI on demo workspaces
  a95e475  ux(ci/settings): collapse add-competitor UI when configured
  4b9ee6f  fix(ci/demo): consultant-grade narrative quality + seeder safety check
  5dfd61a  feat(ci): demo seeder for screen-recording client demos
  de194e7  fix(ci): scatter plot only shows 1 brand of N — reconcile + reorder
  0826e29  fix(ci): start-analysis resilience + auto-resume polling on Brief
  4fc7b1c  fix(ci): LLM-call hardening — surface real errors, stop silent failures
  bc2749a  fix(ci/settings): use API workspace.id for backend sync (TS build fix)
  939c863  fix(ci/settings): sync competitor add/remove to backend immediately

local feature branches (will/...) all deleted.
local claude/heuristic-volhard-39dc2f branch retained but not pushed.
```

No PRs open. Everything since this morning's start has gone direct to main via fast-forward push.

---

## 10. Reference docs (read in priority order)

1. **This doc** — current handoff
2. **`SPEC-COMPOSITE-INDICES-V1.md`** — the 12-index framework spec (locked)
3. **`HANDOFF-FROM-PREV-SESSION-2026-05-04.md`** — prior handoff (covers the trust-polish + V1.5 UI batch from this morning)
4. **`SPEC-COMPARISON-SETS-V2.md`** — V2 work (auto-segmentation), not started
5. **`DATA-FLOW-AND-METRICS-ANALYSIS-2026-05-02.md`** — pre-session data quality audit
6. **`ROADMAP.md`** — overall product status

---

*End of handoff. ~12-min reading time including priority docs in §10. Hand to Joanna for §5 discussion or to next Claude session for §6 execution.*
