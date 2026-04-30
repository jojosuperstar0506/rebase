# Handoff to Joanna — Day 1 + Day 2 + Lifecycle Fixes Complete

**Date:** 2026-04-30 (evening)
**From:** William (with Claude)
**Continues:** `HANDOFF-FROM-PREV-SESSION-2026-04-30.md` (the morning-version handoff
which planned the 2-day work — this doc reports what got built and verified)
**Reading time:** ~10 minutes including the §6 reference paths

---

## 1. TL;DR (read this; the rest is reference)

**The 2-day plan from the morning handoff is done. All 7 branches verified on ECS.**

End-to-end loop is now live: scrape → score → domain rollup → brief verdict
+ moves → Douyin content drafts → product opportunity → white space → API →
frontend (Brief / Analytics / Library tabs all rendering real DeepSeek output).

The CI vFinal product as designed in `INTELLIGENCE-ARCHITECTURE-v3.md` §3.1 is
no longer running on mocks. Songmont workspace renders a real Brief grounded
in real competitor scores, with verifiable numbers in every move.

Login + lifecycle bugs fixed on the way: token-aware homepage, login lands on
`/ci`, no re-onboarding loops, `user_id` precedence consistent between
onboarding and JWT, "Run Today's Analysis" button now actually regenerates the
full Brief end-to-end (12 seconds for the OMI/Songmont workspace).

**Nothing is blocked on you to merge.** Your `jo/scraping-hardening` branch
is still pending push from your Mac per the April-23 thread; that's still the
only blocker for §4 P1 rate-limit wiring (unchanged from the morning handoff).

---

## 2. What shipped — 7 branches in dependency order

All pushed to GitHub. None merged to `main` yet — your call which to merge first.

| # | Branch | Commits | What it does |
|---|---|---|---|
| 1 | `will/day1-step0-login-ux` | `fcd54f2` | Homepage CTA detects token → "Continue to Dashboard"; login redirects to `/ci`; `Onboarding.tsx` bounces logged-in users; `WORKSPACE-AUDIT-2026-04-29.sql` companion script for dedupe |
| 2 | `will/day1-step1-brief-pipeline` | `d0cea98` + `30a5c8c` | `brand_positioning_pipeline.py` (verdict + 3 moves), `GET /api/ci/brief`, `getBrief()` with mock fallback, `run_daily_pipeline.sh` Steps 2c+2d, TZ fix on `week_of` |
| 3 | `will/day2-gtm-content` | `59e6078` | `gtm_content_pipeline.py` (Douyin script drafts), `run_daily_pipeline.sh` Step 2e, skip-if-exists protects user `mark_posted`/`dismiss` |
| 4 | `will/day2-product-whitespace` | `579aabe` | `product_opportunity_pipeline.py` + `white_space_pipeline.py`, `run_daily_pipeline.sh` Steps 2f+2g |
| 5 | `will/day2-analytics-library` | `86ee71d` | `GET /api/ci/analytics` + `/api/ci/library` + `/api/ci/domain-scores`, `getAnalytics`/`getLibrary`/`getDomainScores` wired with mock fallback, `METRIC_METADATA` constant in server.js |
| 6 | `will/day2-flip-use-mocks-false` | `daa2455` | One-line flip — `USE_MOCKS = false` in `ciMocks.ts` so production shows real backend output, falls through to empty state (not Nike mocks) when API returns null |
| 7 | `will/onboarding-lifecycle-fixes` | `8d6c185` | `user_id` precedence fix (`phone || email` everywhere), `run_analysis_for_workspace.sh` orchestrator script — runs all 7 stages in dependency order when user clicks "Run Today's Analysis" |

**Each branch is verifiable independently** — every commit message has an
ECS verification recipe in its footer.

### Suggested merge order

Linear chain — each builds on the previous. Either:
- **Merge sequentially via GitHub PRs** (one at a time, easy to revert any single step)
- **Or rebase-and-merge as a single super-branch** if you want a clean main history

Order matters because `will/day2-*` depends on `will/day1-step1-brief-pipeline`'s
schema and helpers, which depends on `will/day1-step0-login-ux`'s SQL audit, etc.

---

## 3. Verification status

**Every branch has been ECS-verified in this session.** Highlights:

- **Brief prose grade A** — DeepSeek output cites real deltas (`+17, -13, -10`),
  references only tracked competitors, never hallucinates a brand
- **Content drafts grade A** — first-person voice ("我们慌了？"), 3s/15s/3s
  Douyin structure enforced, hashtags grounded
- **Product opportunity grade A** — concept name specific, target_price is a
  range (¥599-899), signals labeled "估算" when hypothesis vs data
- **White space** — categories distribute correctly (dimension > pricing/channel),
  scores 65-82, integrity rule held (refused to pad to 4 when only 2 had real backing)
- **`/api/ci/analytics`** — returns 5 priority_metrics + 12 all_metrics + 3
  white_space; priority_rationale is template-built (deterministic, no LLM)
- **`/api/ci/library`** — assembles weekly_briefs ⨝ content ⨝ product per week
- **`/api/ci/domain-scores`** — 3 keys (consumer/product/marketing) × {own, competitors}
- **Run-Analysis orchestrator** — 12 seconds end-to-end on Songmont workspace
  (2 competitors); status transitions queued → scoring → narrating → complete

---

## 4. The OMI/Songmont identity fix (data hygiene)

During verification I caught a structural data issue and fixed it via SQL.

**The problem:** OMI workspace (`0cf0e691-89f4-46f5-8c6f-ad227339e600`) had
`brand_name = 'OMI'` but the actual scraped data lived under `Songmont` (which
is OMI's actual brand name per `JOANNA-SCRAPER-SETUP-PLAN.md` §3c). Worse,
Songmont was ALSO in `workspace_competitors` — so the system thought Songmont
was a competitor of OMI, and the brief verdict said things like
"为OMI创造精准截流窗口" (create a precise traffic-interception window for OMI
[from Songmont]). OMI was being told to compete with itself.

**The fix I applied on ECS today:**
```sql
BEGIN;
UPDATE workspaces SET brand_name = 'Songmont'
  WHERE id = '0cf0e691-89f4-46f5-8c6f-ad227339e600';
DELETE FROM workspace_competitors
  WHERE workspace_id = '0cf0e691-89f4-46f5-8c6f-ad227339e600'
    AND brand_name = 'Songmont';
COMMIT;
```

Then re-ran the 4 LLM pipelines with `--force`. The brief now reads in
first-person ("Songmont心智与声量双降, CASSILE营销猛攻"), drafts say "我们慌了"
not "OMI vs Songmont", and the priority metrics show real competitive gaps
(you=15 vs CASSILE=85 on voice volume).

**Other workspaces probably need similar audits.** If you remember any other
workspaces where `brand_name` differs from how the scraped data is keyed,
flag them — the fix is small but I'd want your confirmation before running.

---

## 5. Open architectural items (no code; just decisions)

These three are the meaningful "what's next" items:

### 5.1 New-user scrape bootstrap (Gap 4 from the audit)

**Architectural reality, not a bug:** ECS datacenter IPs are blocked from XHS
and Douyin. Per the morning handoff §9: "scraping is local-only." So when a
brand-new customer applies, gets approved, and logs in:

1. Workspace + competitor list created from onboarding form ✓
2. They see the Brief page → empty state ("Your brief is on its way" — already
   in `CIBrief.tsx:218-242`)
3. They click "Run Today's Analysis" → orchestrator runs but produces empty
   results because no scrape data exists
4. **Someone (you or me) must manually run `scrape_runner` on a residential-IP
   machine** for that workspace's competitors before the brief means anything

This is the bottleneck that makes Rebase un-self-serve until Phase D (customer
installer) ships. Two interim options worth your input:

- **(a) Quick admin tool** — `/api/admin/pending-scrapes` endpoint that lists
  workspaces with no scrape data. You/I see "TestCo needs initial scrape"
  in the admin panel, run it locally, ping the customer when done. ~3h work.
- **(b) Phase D installer** — the longer-term answer. Per your April-22
  handoff §4 P3, this is in the larger plan. Weeks of work.

**My recommendation: (a) now, (b) post-V1.** The admin tool is small and
unblocks customer onboarding flow.

### 5.2 Auto-email invite codes

User explicitly opted to keep this manual for V1. The hook is wired (Resend
client lives in `notifyNewApplicant` for the admin notification flow) — would
take ~30 min to add a similar call to `POST /api/admin/approve` so codes get
emailed automatically. **Park this until V1 launches.**

### 5.3 Real WoW deltas + 8-week trend sparklines

Both `/api/ci/analytics` and the `LibraryEntry` shape have a `delta: number | null`
and `trends: Record<string, ...>` field that I left as `null` and `{}` for V1.
Honest absence of fake history. To populate them properly, we need a per-week
snapshot table:

```sql
CREATE TABLE analysis_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  week_of DATE NOT NULL,
  metric_type TEXT NOT NULL,
  competitor_name TEXT NOT NULL,
  score NUMERIC NOT NULL,
  snapshotted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, week_of, metric_type, competitor_name)
);
```

Plus a cron-stage that snapshots every Monday morning. ~2h work. **Defer to V2.**

---

## 6. Reference paths — where the work lives

In suggested reading order if you want to dive in:

1. **`HANDOFF-FROM-PREV-SESSION-2026-04-30.md`** (root) — the morning version
   that planned this work. Read §1+§2 for context.
2. **`INTELLIGENCE-ARCHITECTURE-v3.md`** §3.1 — original product spec; the
   shipped pipelines map 1:1 to the §4 Phase 1+2 task list.
3. **`services/competitor_intel/brand_positioning_pipeline.py`** — the prompt
   pattern. Every other LLM pipeline (gtm_content, product_opportunity,
   white_space) follows this shape: argparse → load workspace + brief →
   build prompt → call DeepSeek → parse + coerce → DB write. Read this one
   to understand all four.
4. **`services/competitor_intel/run_analysis_for_workspace.sh`** — the
   orchestrator that runs all 7 stages in dependency order. Replaces the
   previous "10 detached parallel spawns" approach in `POST /api/ci/run-analysis`.
5. **`backend/server.js` lines ~1115–1455** — the new `/api/ci/brief`,
   `/api/ci/analytics`, `/api/ci/library`, `/api/ci/domain-scores` endpoints.
   Each cast `week_of::text` to avoid the TZ gotcha (PG DATE → JS Date at
   local-tz midnight shifts the day backward on UTC+8 servers).
6. **`frontend/src/services/ciMocks.ts`** — fetch helpers + mock fallback
   pattern. `USE_MOCKS = false` now; flipping back to `true` is a 1-line revert.
7. **`services/competitor_intel/category_baselines.py`** — single source of
   truth for per-category baselines + design keyword vocabularies. Unchanged
   from your April 23 read.
8. **`backend/migrations/006_brief_tables.sql`** — schema for
   `weekly_briefs` / `content_recommendations` / `product_opportunities` /
   `white_space_opportunities`. All four tables in active use now.

---

## 7. Strategic context for your Claude session

**Things I learned this session that aren't obvious from code:**

- **DeepSeek prompt quality is high** when given concrete numbers + tracked-
  brand names + an explicit "do not invent" instruction. Every coerce layer
  has a "drop hallucinated brand IDs but keep the body" path — the LLM rarely
  triggers it.
- **Skip-if-exists is the right idempotency rule for content/product/whitespace.**
  Re-running the orchestrator preserves the user's `mark_posted` / `dismiss` /
  `accept` state. Brief is UPSERT (analyst commentary that should freshen);
  user-actionable items are skip-if-exists. Different rules for different
  data types.
- **`week_of::text` in SQL is mandatory** for any DATE column returned via
  node-postgres. The driver parses DATE as JS Date at local-tz midnight,
  `.toISOString().slice(0,10)` then shifts the Monday → Sunday on a UTC+8
  server. Lesson: cast to text for any DATE-typed column you want to display.
- **Songmont = OMI brand identity issue applies to other workspaces too —
  worth a sweep when you have time.** SQL diagnostic:
  ```sql
  SELECT w.id, w.brand_name AS workspace_brand,
         array_agg(c.brand_name) AS competitors
    FROM workspaces w
    JOIN workspace_competitors c ON c.workspace_id = w.id
   GROUP BY w.id, w.brand_name
   HAVING w.brand_name <> ALL(array_agg(c.brand_name))
       OR w.brand_name = ANY(array_agg(c.brand_name));
  ```
  Shows workspaces where own brand isn't in competitors (good) AND workspaces
  where own brand IS also in competitors (bad — same as OMI/Songmont was).

**Things from your April-22 handoff that are still load-bearing:**

- **Scraping is local-only.** Both `run_daily_pipeline.sh` (cron) and the new
  `run_analysis_for_workspace.sh` (button) skip the scrape step — they assume
  scrape data already exists. New workspaces need bootstrap.
- **`forbidden_ip_hostname_substrings`** in your YAML config exists to make
  ECS-side scrape attempts fail loud. Once `jo/scraping-hardening` lands,
  `assert_not_on_datacenter_ip()` should be wired into `scrape_runner.py` per
  your §4 P1 spec.
- **METRIC_VERSION bumps:**
  - `brand_positioning` = v1.0 (new)
  - `gtm_content` = v1.0 (new)
  - `product_opportunity` = v1.0 (new)
  - `white_space` = v1.0 (new)
  - `domain_aggregation` = v1.1 (unchanged)
  - All others (momentum/threat/wtp = v1.2, design_profile = v1.1, etc.)
    unchanged from the April 23 batch

---

## 8. What's blocked on you (still)

Same as the April 23 thread. Nothing new.

- **Push `jo/scraping-hardening`** to origin so:
  - I can review your XHS scraper hardening + YAML config + auth-wall detection
  - I can wire §4 P1 rate-limit enforcement into `scrape_runner.py`
  - The `SCRAPER_ENABLED` env gate lands in production (currently `main` has
    the open scrape endpoint per your April 22 §3 finding)

The 7 branches I shipped this session **don't depend on your branch** — they
all operate on existing scrape data and bring the AI synthesis layer to life.
But your branch lands first or after, the integration plan is the same.

---

## 9. Suggested first message to your Claude session

```
Read WILL-TO-JOANNA-2026-04-30.md at repo root, then skim §6 references.

State of the world: Will shipped the full 2-day plan from the morning
handoff. 7 branches pushed, all ECS-verified, none merged to main yet.
Songmont workspace is the canonical end-to-end test — both Brief tab
and Analytics tab render real DeepSeek output grounded in real
competitor scores.

What I want to focus on:
[fill in: review-and-merge / push my scraping branch first / something else]
```

That gets your Claude productive in ~5 minutes.

---

## 10. What NOT to do without explicit approval

(Mostly carrying forward from the morning handoff §9 — adding session-specific items.)

- ❌ Don't run scrapers on ECS — still local-only
- ❌ Don't push directly to `main` while my 7 branches are pending review
  unless you're explicitly merging them. Force-push to main especially bad.
- ❌ Don't drop migration 006 (`weekly_briefs` / `content_recommendations` /
  `product_opportunities` / `white_space_opportunities`) — every Day-1+2
  pipeline writes here.
- ❌ Don't flip `USE_MOCKS` back to `true` without good reason — if a workspace
  shows empty Brief, the right fix is to populate its data, not to overlay
  Nike mocks on a women's-bag brand
- ❌ Don't delete the orchestrator script (`services/competitor_intel/run_analysis_for_workspace.sh`)
  — it's load-bearing for the "Run Today's Analysis" button now
- ❌ Don't change `user_id` precedence in onboarding or JWT without updating
  the OTHER place at the same time — they MUST agree on `phone || email`

---

## 11. Tiny things that didn't make this session

For your awareness, in case you bump into them:

- **Onboarding success page** still says "Application received" without a
  timeline. Could add "We'll email your code within 24h" — 1-line copy change.
- **CISettings page** — I didn't audit whether users can edit `brand_category`
  or `competitor list` from the UI. If they can't and they need to (e.g., to
  fix the Songmont/OMI-style identity), that's a small gap.
- **The 2am cron timezone** — `run_daily_pipeline.sh` runs at 2am HK per the
  comment in the file. With my new Steps 2c-2g, total cron runtime probably
  grew from ~30 min (scrape + score) to ~45-60 min (+ domain agg + 4 LLM calls
  per workspace). If multi-workspace cron starts blowing past 9am login window,
  consider parallelizing across workspaces or moving to 1am.

---

*End of handoff. Ping me on Slack when you've read this and we can sync on
merge order + your scraping-hardening push.*

— Will (with Claude)
