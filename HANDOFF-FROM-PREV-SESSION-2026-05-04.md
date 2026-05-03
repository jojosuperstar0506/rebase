# Handoff to next Claude session — 2026-05-04

> **Read this first.** Then read the docs in §6 in order. Everything in
> this file is the *live thread* that wasn't yet a code-merged or doc-
> committed action when the session ended.

---

## 1. Where we are (one paragraph)

V1 Trust Polish + V1.5 UI Polish complete on `main` as of 2026-05-03 evening
HKT. **Five PRs merged in one focused session today**: W1-W4 trust polish,
W5-W8 endpoints + i18n, V1.5 UI polish (chip / banner / alerts), coverage
audit fixes (#16 raw_inputs disclosure + #18 per-brand scrape recency), and
V1.5 quick wins (auto-email invite codes, switcher API wiring, narrative
cron cleanup, WTP cap handling, ⓘ affordance, own-brand placeholder, Brief→
Analytics cross-link). Merge commits are `da91780` `6954912` `44e2199`
`cb7fa17` `20916d0`. Branches deleted; everything's on `main`. **About 70%
of Joanna's HANDOFF-WILLIAM-2026-05-03 §4 is done**; the remaining 30% is
intentional — I pushed back on V1.5 composite indices scope (recommended
foundation-first: snapshot table → customer signal → re-decide) and held
two cleanup recommendations (keep CITrendChart parked, keep 4 unused
endpoints). Joanna pulls main next session and sees everything intact.

---

## 2. The OPEN DECISION

**Joanna needs to decide between three paths** (laid out in
`WILLIAM-TO-JOANNA-2026-05-04.md` §6):

- **Option A** (my recommendation): foundation-first — I start `will/snapshot-history` (#21 analysis_history table → real WoW deltas + sparklines, ~2-3 days). She pushes J1 burner. Customer outreach in parallel. Re-discuss composite indices after.
- **Option B**: accept pushback, green-light snapshot, defer indices.
- **Option C**: override pushback, start composite indices implementation now per `SPEC-COMPOSITE-INDICES-V1.md` §9 (~5-7 days for the 9 high-confidence indices + ~2 weeks weight tuning + 3 new pipelines).

**Until she decides, do not start composite indices work.** That's
explicitly the open conversation. If she replies with anything ambiguous,
ask before coding.

There are also **5 specific open questions** for Joanna in
`WILLIAM-TO-JOANNA-2026-05-04.md` §7 — my answers to her spec §10
questions. The two I disagree on are:
- Q2 NPS scale (I vote 0-100, she votes -100 to +100)
- Q5 versioning policy (I vote any change bumps, she votes weight tweaks don't)

---

## 3. Today's commits — what's live in production

Direct commits to `main` from this session:

```
da91780  Merge will/v1.5-quick-wins (#34)
6954912  Merge will/coverage-audit-fixes (#33)
44e2199  Merge will/v1.5-polish (#32)
cb7fa17  Merge will/track2-endpoints-i18n (#31)
20916d0  Merge will/track1-trust-polish (#30)
```

Per-PR feature commits (still in history):
```
06dc218  feat(ci): v1.5 quick wins — 7 items (auto-email + switcher + narrative cleanup + WTP cap + ⓘ + own-brand + cross-link)
b5c6c4b  feat(ci): coverage audit fixes — #16 raw_inputs disclosure + #18 per-brand scrape recency
b175a02  docs: open-todos tracker for Joanna
8f9feec  feat(ci): v1.5 polish — brand chip on moves + CIWelcomeBanner + CIAlertFeed mounted
e056b63  feat(ci): Track 2 endpoints + i18n — W5 admin pending-scrapes + W6 list workspaces + W7 POST/PATCH split + W8 i18n audit
be09949  fix(ci): Track 1 trust polish — W1 numeric coercer + W3 zero-follower guard + W4 idempotent insert + W2 dark-metric audit
```

Vercel auto-deploys `main` → check Vercel dashboard for the build.

---

## 4. What's pending from Joanna (BLOCKER for some work)

| Item | Blocks |
|---|---|
| **Decision A/B/C from §2** | All major next-step work. Don't start composite indices without it. |
| **J1 burner XHS account** | All fresh-data work, dark metrics fix, merchant scrapers, customer onboarding. |
| **Spec §10 answers acknowledgment** | If we go Option C, the implementation depends on her acks for Q2/Q5. |

Until she pushes / acknowledges:
- ❌ Don't start composite indices implementation
- ✅ The snapshot-history work (Option A path) doesn't depend on her — can start once she greenlights

---

## 5. What I deliberately did NOT do

(Maintain these positions unless explicitly overridden.)

| # | Item | My position | Source |
|---|---|---|---|
| W9-W11 | Composite indices implementation | **Pushback on V1.5 scope.** Foundation-first via snapshot table. | `WILLIAM-TO-JOANNA-2026-05-04.md` §4 |
| #14 | Delete `CITrendChart` orphaned component | **Keep parked.** Free wiring once snapshot lands. | `OPEN-TODOS-FOR-JOANNA-2026-05-03.md` §3 |
| #19 | Delete 4 unused backend endpoints | **Keep all four.** Cheap to keep, expensive to ripple-remove. | `OPEN-TODOS-FOR-JOANNA-2026-05-03.md` §3 |
| #16 frontend | UI surface for WTP `cap_hit` (tied-at-top) | Backend ready, FE deferred for V1.5+. | `WILLIAM-TO-JOANNA-2026-05-04.md` §4 |
| Narrative cleanup (full removal) | Stopped writing `analysis_narratives` via `--brands-only` flag, kept `narrative_pipeline.py` itself | Conservative — Joanna may want to surface it in some other form | This session |
| App.tsx Suspense fallback i18n | Out of CI scope, ~5min | Won't fit single-session scope | This session |

---

## 6. Reference docs to read in priority order

For the next Claude session, read in order:

1. **`WILLIAM-TO-JOANNA-2026-05-04.md`** (root) — most recent handoff, has the OPEN DECISION + scoreboard
2. **`OPEN-TODOS-FOR-JOANNA-2026-05-03.md`** (root) — coverage-audit matrix in §8 (every backend datum → which UI surface)
3. **`HANDOFF-WILLIAM-2026-05-03.md`** (root) — Joanna's request that drove this session's work
4. **`SPEC-COMPOSITE-INDICES-V1.md`** (root) — the locked spec we're pushing back on
5. **`SPEC-COMPARISON-SETS-V2.md`** (root) — V2 spec, lower priority
6. **`DATA-FLOW-AND-METRICS-ANALYSIS-2026-05-02.md`** — 3 issues, all resolved
7. **`FRONTEND-BACKEND-GAP-ANALYSIS-2026-05-02.md`** — 22-item workplan, ~70% resolved
8. **`METRIC-LOGIC-INVESTIGATION-2026-05-02.md`** — partially superseded by indices spec
9. **`ROADMAP.md`** (root) — overall product state
10. **`WILL-TO-JOANNA-2026-04-30.md`** — prior handoff, gives context on Day 1 + Day 2 + lifecycle

---

## 7. Strategic context that lives in the conversation

- **Three lenses always applied** before any change: Architect / UIUX / User. Will's project memory mandates this.
- **Honesty rules from the morning handoff still apply:** never inflate scores, never invent competitor names, never fabricate WoW deltas. The W1 coercer enforces this at the brand_positioning layer.
- **Scraping stays local-only.** ECS datacenter IPs blocked. Joanna's `assert_not_on_datacenter_ip` from PR #25 is wired in. New customers need someone (Will/Joanna) to manually run scrape on residential IP until Phase D.
- **METRIC_VERSION bumps** since 2026-04-30:
  - brand_positioning: v1.0 → **v1.1** (numeric coercer)
  - domain_aggregation: v1.1 → **v1.2** (idempotent insert)
  - others unchanged
- **Workspace identity hygiene:** OMI workspace renamed to Songmont; Songmont removed from competitors. Diagnostic SQL in `WILL-TO-JOANNA-2026-04-30.md` §4 should be re-run if any other workspace shows similar drift.
- **`narrative_pipeline.py`** now supports `--brands-only` flag. Cron uses it. The orphaned `analysis_narratives` table is no longer being written to. Restore by removing the flag from `run_daily_pipeline.sh:152`.
- **`VALID_PROFILE_FILTER`** in `db_bridge.py` is the SQL clause that excludes auth-walled / silent-zero scrape rows. Used by 5 pipelines. Add to any new scoring pipeline that reads `scraped_brand_profiles` for trend math.
- **Frontend ColorSet** unchanged from prior session. New code uses tokens (`C.platformDouyin`, `C.success`, etc.).
- **`brandColorHsl(name, sat, light)`** in CIBrief.tsx — deterministic HSL hue per brand name. Reuse if any other page needs the same coloring.

---

## 8. Suggested first message to paste into the next session

```
Read HANDOFF-FROM-PREV-SESSION-2026-05-04.md at repo root, then read
the docs in §6 in order. Joanna's decision on the §2 OPEN DECISION
(A / B / C) is: [YES Option A / B / C / TBD - waiting on Joanna].

If A or B (foundation-first / snapshot table approved), start
will/snapshot-history. Specifically: design the analysis_history table
(migration 009), write the snapshot job that runs at end of run_analysis_for_workspace.sh,
update brand_positioning_pipeline + /api/ci/analytics to compute real WoW
deltas from the snapshot. Apply three lenses before each commit.

If C (composite indices), follow SPEC-COMPOSITE-INDICES-V1.md §9
6-step migration. Skip Trend Capture (Q4 deferred). Implement 9 high-
confidence indices first per §9 Step 2.

Match the existing pipeline pattern (argparse --workspace-id|--all,
run_for_workspace function, METRIC_VERSION constant, INSERT into the
right table). Use DeepSeek via the LLM helper in narrative_pipeline.py.

Don't try to wire scrape_runner.py rate limits — depends on Joanna's
unmerged work (status: depends on Joanna's J1 push).
```

---

## 9. What NOT to do without explicit approval

- ❌ Don't start composite indices implementation (`will/composite-indices-v1`) without Joanna's Option C decision in §2.
- ❌ Don't re-enable workspace-level narrative_pipeline output (the `--brands-only` flag is intentional; flip back only if Joanna asks).
- ❌ Don't fabricate / inflate / synthesize numeric scrape data — coercer enforces this anyway.
- ❌ Don't drop migrations 001-006 (every CI table depends on them).
- ❌ Don't run scrapers on ECS — still local-only.
- ❌ Don't push directly to `main` without merging via a will/* branch UNLESS the change is a doc-only fix (the 5 merge commits are the precedent).
- ❌ Don't delete `CITrendChart` (kept parked for snapshot-table follow-on).
- ❌ Don't delete the 4 "unused" backend endpoints (decision held).
- ❌ Don't reverse W1 coercer behavior (drop moves with unsupported numbers) without prompt-iteration data showing too many false positives.

---

## 10. Tiny things that might bite

- **Line endings on Windows:** git's `core.autocrlf=true` keeps warning on every commit. `*.tsx text eol=lf` in `.gitattributes` would silence them. Not blocking.
- **`.claude/settings.local.json`** changes regularly with local IDE state. Never commit it.
- **`INTELLIGENCE-ARCHITECTURE-v2.md`** is a pre-existing draft sitting untracked at root. Don't add it to git unless explicitly asked.
- **Vercel preview deploy** runs on every push to `main`. After today's 5 merges + push, check the deploy didn't break — node-postgres LATERAL JOIN on `/api/ci/competitors` (#18) is the most likely place for a runtime issue if any.
- **`cap_hit` field in WTP raw_inputs** is added but no UI surfaces it yet. If you build that UI in a follow-up, it's already in the data.
- **The 2am HK cron** (`run_daily_pipeline.sh`) now runs ~7 stages before narratives. Total runtime probably grew from ~30 min to 50-70 min for 1 workspace, much more for many. Worth a single-workspace timing check on the next ECS sync.

---

## 11. State of branches + PRs

```
Local + remote main                            ← all 5 PRs merged here
  ┌─ feat: trust polish (be09949)
  ├─ feat: track2 endpoints + i18n (e056b63)
  ├─ feat: v1.5 polish + tracker doc (8f9feec, b175a02)
  ├─ feat: coverage audit (b5c6c4b)
  └─ feat: v1.5 quick wins (06dc218)

Deleted today (local + remote):
  will/track1-trust-polish
  will/track2-endpoints-i18n
  will/v1.5-polish
  will/coverage-audit-fixes
  will/v1.5-quick-wins

Joanna's open PRs (not mine — for reference):
  None pending — PR #28 (composite indices spec) and PR #29 (UI bugfixes)
  both merged before this session began.
```

---

*End of handoff. Total reading time for next Claude: ~10 minutes including
the §6 priority docs. Good luck.*
