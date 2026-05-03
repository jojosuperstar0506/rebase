# Handoff to Joanna — Trust Polish + V1.5 UI batch shipped to main

**From:** William (with Claude)
**Date:** 2026-05-04
**Replaces / closes:** `HANDOFF-WILLIAM-2026-05-03.md` (your handoff to me)
**Status:** all 5 PRs merged to `main`. Branches deleted. Live on Vercel after auto-deploy.
**Reading time:** ~10 minutes

> **🆕 To Joanna's Claude reading this:** read this doc IN FULL FIRST. Then
> read `OPEN-TODOS-FOR-JOANNA-2026-05-03.md` (lives in repo root, has the
> coverage-audit matrix in §8). Confirm in your first reply by listing 3
> specific things you learned from each. Then start the work in §6 below.

---

## 1. TL;DR — what shipped while you were heads-down

I shipped **everything in your HANDOFF-WILLIAM-2026-05-03 §4 W1–W8** plus
**most of FRONTEND-BACKEND-GAP-ANALYSIS §5**, all merged to `main` as **5 sequential merge commits**:

```
da91780  Merge will/v1.5-quick-wins (#34)        — 7 small wins
6954912  Merge will/coverage-audit-fixes (#33)   — #16 + #18 + design audit
44e2199  Merge will/v1.5-polish (#32)            — chip / banner / alerts mounted
cb7fa17  Merge will/track2-endpoints-i18n (#31)  — W5 W6 W7 W8
20916d0  Merge will/track1-trust-polish (#30)    — W1 W2 W3 W4
```

**~70% of your handoff** done. The remaining 30% is intentional — either
deliberately disagreed with reasoning, or sequenced behind something
more important (snapshot table, customer signal, your J1 burner). Details in §3-§4.

**The product is in better trust shape than yesterday.** The numeric coercer
catches LLM hallucinated deltas before they ship; zero-follower scrapes
can't poison growth math anymore; admins can see new customers needing
their first scrape; English-locale users actually get English on every page.

---

## 2. Phases of the product (no timelines — just maturity)

Updated since your 2026-05-03 doc:

| Phase | Status | Delta |
|---|---|---|
| **V1 Launchable** | ✅ Live on `main` | unchanged |
| **V1 Trust Polish** | ✅ Done — merged today | was: 🟡 in flight |
| **V1.5 UI Polish** | 🟡 70% done — 3 disagreements + 2 deferred | new state |
| **V1.5 Composite Indices** | ⏸ Awaiting scope sync | I'm pushing back on V1.5 scope — see §4 |
| **V2 Comparison Sets** | 📋 Spec ready, not started | unchanged |
| **V2 Snapshot table** | 📋 Recommended next | I argue it's foundation for everything else |
| **V2 Merchant scrapers** | 🔴 Queued | blocked on your J1 burner |
| **V3 Customer installer** | 🔴 Queued | unchanged |

---

## 3. Detailed scoreboard — by your task #

### ✅ Track 1 (HANDOFF §4 W1-W4) — DONE in commit `20916d0`

| # | Task | Notes |
|---|---|---|
| W1 | Numeric-coherence coercer in `brand_positioning_pipeline.py` | METRIC_VERSION bumped to v1.1. Tolerance ±1 (covers LLM rounding, catches 2-point fabrications). Drops moves with ≥1 unsupported number. Logged for future prompt-iteration monitoring. |
| W2 | Dark metrics audit | Documented inline in `design_vision_pipeline.py`, `kol_tracker_pipeline.py`, and `narrative_pipeline.py`. brand_insight = narrative not score (frontend display fix already in PR #29); the other two need note-feed scrape (blocked on J1). |
| W3 | `follower_count = 0` guard | New `VALID_PROFILE_FILTER` SQL constant in `db_bridge.py`. Applied to 5 pipelines: voice_volume, mindshare, scoring, narrative, brand_positioning. Auth-walled / silent-zero rows are skipped at the SQL layer — Joanna's voice_volume=15 case won't recur. |
| W4 | UPSERT in domain_aggregation_pipeline | METRIC_VERSION bumped to v1.2. Delete-then-insert pattern keyed on (workspace_id, competitor_name, metric_type, metric_version, analyzed_at::date). Yesterday's history preserved; today's reruns idempotent. No schema migration needed. |

### ✅ Track 2 (HANDOFF §4 W5-W8) — DONE in commit `cb7fa17`

| # | Task | Notes |
|---|---|---|
| W5 | Admin pending-scrapes tool | New `GET /api/admin/pending-scrapes` endpoint + Admin page panel. Returns workspaces with competitor_count > 0 AND scraped_count = 0. Click-to-copy `python -m … scrape_runner` command per row. Soft-fails if endpoint unreachable. |
| W6 | `GET /api/ci/workspaces` | Lightweight projection (id, brand_name, brand_category, brand_price_range, created_at, updated_at). Filtered by user_id from x-user-id header. Newest-first ordering. |
| W7 | Split POST/PATCH on `/api/ci/workspace` | POST is now INSERT-only (always 201); new `PATCH /api/ci/workspace/:id` validates ownership before mutating. CORS allowedMethods updated to include PATCH. Frontend `saveWorkspace()` picks the right verb based on whether `workspace.id` is set. |
| W8 | English i18n audit | Fixed 2 real bugs: `formatScriptForCopy` in CIBrief + CILibrary (hardcoded `【开场3秒】` / `【主体15秒】` / `【结尾3秒】` now respect lang); `generateMockAlerts` in CIAlertFeed (hardcoded Chinese alert messages now lang-aware). 38-line audit confirms remaining CI strings are correctly bilingual via `lang === 'zh' ? … : …` ternaries. |

### ✅ V1.5 UI polish (FRONTEND-BACKEND-GAP-ANALYSIS §5) — DONE across `44e2199` + `6954912` + `da91780`

| Your # | Task | Status / commit |
|---|---|---|
| #6 | Mount `CIAlertFeed` as Brief sidebar | ✅ Mounted as Section 1c of CIBrief (between moves and content). |
| #7 | Mount `CIWelcomeBanner` in CIBrief empty state | ✅ Replaces the previous text-only empty state. |
| #8 | Show `priority_rationale` on Analytics metric cards | ✅ Already shown on lines 460+692 of CIAnalytics.tsx — verified, no work needed. |
| #9 | "Why this score?" expandable using `raw_inputs` | ✅ New `WhyThisScore` component on the metric drill-down modal. Backend `/api/ci/analytics` now passthroughs raw_inputs (was flattened to score-only). Smart formatting: % suffix for *_pct/*_rate/*_growth keys, integer/float precision, JSON dump for nested. |
| #10 | Brand chip on each move card in Brief | ✅ `brandColorHsl(name)` deterministic HSL hue per brand name — same brand always gets the same color across pages. After merge conflict resolution, the chip is ALSO clickable + cross-links to Analytics with `?focus_brand=…` (combines #10 with my §3.2 cross-link addition). |
| #11 | Per-brand scrape recency | ✅ `/api/ci/competitors` LATERAL JOIN with `scraped_brand_profiles`. Brief workspace context chips now show "Songmont · 12d ago" with color coding (red >7d, green ≤2d). Hover shows full timestamp + platform. |
| #13 | Admin pending-scrapes tool | (Same as W5 — already shipped.) |

### ✅ V1.5 quick wins I added (not in your gap analysis but valuable) — `da91780`

| Source | Item | Notes |
|---|---|---|
| gap §5 #21 | Auto-email invite code on `/api/admin/approve` | Reuses Resend integration. Soft-fails when RESEND_API_KEY not set. Fallback path: admin manual share. |
| W6 follow-on | Wire WorkspaceSwitcher to `listWorkspaces()` | Hydrates the dropdown from server on mount. Merges server-known into local cache. Kills the stale "coming soon" footer. |
| coverage audit §8.2 | Stop generating orphaned `analysis_narratives` in cron | Added `--brands-only` flag to `narrative_pipeline.py` so brand_insight rows still write (the AI panel consumes them) but the workspace-level synthesis (which no V3 page consumes) is skipped. Saves 1 LLM call per workspace per cron run. Cron has fallback to full pipeline if flag isn't supported on a node yet. |
| metric-logic §5 item 7 | WTP cap handling | Added `cap_hit` boolean + `raw_score_uncapped` to wtp's raw_inputs. Frontend can now surface "tied at top" instead of identical 100s. UI work on this is V1.5+ follow-up. |
| coverage audit §8.3 #1 | ⓘ affordance on priority cards | Small "Why this score?" pill at bottom-right of each priority card, surfacing the path to the raw_inputs disclosure for users who never expand the metric grid. |
| coverage audit §8.3 #3 | Own-brand placeholder card on AI insights | When workspace_brand_name is missing from competitor insights (the common state after the OMI/Songmont identity fix), pins an own-brand placeholder explaining where the user's strategic synthesis lives. Section now always renders when workspace_brand_name exists. |
| coverage audit §8.3 #2 | Cross-link Brief move → Analytics drill | Brand chip on each move clicks to `/ci/analytics?focus_brand=…`. Analytics reads param, smooth-scrolls + highlight-pulses the matching insight card, shows banner with Clear button. After merge conflict resolution, the chip both has the brandColorHsl coloring (#10) AND is clickable. |

### ✅ #21 customer-email notifications

In your gap analysis as item #21 ("hook exists, ~30 min"). Shipped as part
of v1.5-quick-wins commit `06dc218`. The `notifyApplicantApproved()` helper
in `backend/server.js` reuses the same Resend pattern as
`notifyNewApplicant()`. Triggers on POST `/api/admin/approve` automatically.
RESEND_FROM_EMAIL env var optional (defaults to `Rebase <onboarding@resend.dev>`).

---

## 4. What I deliberately did NOT do — and why

### 🔴 Pushed back on: V1.5 Composite Indices implementation (W9-W11)

**My read of `SPEC-COMPOSITE-INDICES-V1.md`:** the strategic argument
(composite scores as moat) is correct. The 3-pillar / 12-index framework
is well-thought-out. Drill-down + versioning + per-category hierarchy
are all sound.

**My pushback:** this is **V2-sized work labeled V1.5**.
- 12 indices, 4 of which need new pipelines (`trend_capture`, `innovation`,
  deeper `kol_strategy`, plus `loyalty` repeat-author tracking)
- 6 of 12 are marked Medium / Low confidence today — they'll produce
  noisy output for weeks while we tune weights
- The 5 "open questions" in §10 are non-trivial design decisions, not
  stylistic preferences. Q4 (Trend Capture algorithm) alone deserves a
  30-min whiteboarding sync per your spec
- We have 1 demo customer (Songmont). Building 12 proprietary indices
  for 1 customer feels like over-engineering before customer signal

**My counter-proposal in priority order:**
1. **Ship #21 `analysis_history` snapshot table first** (~2-3 days). It's
   foundation work. Every index in the spec benefits — `direction`/`delta`
   stop being null, sparklines unlock, the Brief's WoW deltas become real
   instead of LLM-narrated. **More valuable than indices for the same effort.**
2. **Get V1 in front of 3-5 real customers** (your J5). See what they
   actually ask for.
3. **THEN re-decide on indices scope.** All 12 might be right; or 6
   high-confidence ones; or pivot the surface based on real feedback.

**My answers to your §10 open questions** (so the spec conversation can
proceed if you disagree with my pushback):

| Q | My answer |
|---|---|
| Q1: Cost ceiling on 12 derivations | OK, 30s runtime on Songmont workspace is fine. |
| Q2: NPS scale -100..+100 vs 0..100 | **Disagree with native NPS**: normalize to 0..100 for UI consistency. SMB owners aren't comparing to internal NPS surveys. Visual consistency matters more than convention purity. |
| Q3: First-week defaults | Agree with your proposal: show score, hide arrow, soft note about trends starting next week. |
| Q4: Trend Capture algorithm | This is a hard ML problem. **Defer to V2** until we have weeks of historical data to validate against. |
| Q5: Versioning policy | **Disagree with "weight tweaks don't bump"**: any output-affecting change bumps a patch version. Customers seeing scores move without changelog erodes trust. v1.0 → v1.0.1 cost is near-zero. |

### 🟡 Cleanup disagreements (kept my position from OPEN-TODOS-FOR-JOANNA §3)

| # | Your recommendation | My position |
|---|---|---|
| #14 | Delete `CITrendChart` component | **Keep parked.** Once snapshot table ships it's free wiring. Code is cheap to keep. |
| #19 | Delete 4 unused backend endpoints (`intelligence`, `connections/check`, `pipeline/status`, `trends/summary`) | **Keep all four.** Code is cheap to keep, expensive to ripple-remove. Better cleanup target after V2 ships when paths are confirmed dead. |

### ⏸ Deferred for time / sequencing

| # | Item | Effort | Why deferred |
|---|---|---|---|
| #16 (mine) | Frontend UI surface for WTP `cap_hit` (tied-at-top display) | ~30 min | Backend ready, FE work is small but optional V1.5+. |
| #18 follow-up | Cron schedule audit (current 2am HK runtime grew with new pipelines) | ~30 min | Worth spot-checking but not blocking. |
| Bigger | `analysis_history` snapshot table (#21) | ~2-3 days | Recommended next big work item. |
| Bigger | Comparison Sets (#20 / SPEC-V2) | ~5-6 days | Sequence after #21 + customer signal. |

---

## 5. Verification checklist — what to confirm on Vercel preview

After Vercel auto-deploys `main`, log in as the OMI/Songmont workspace and
verify these:

| Page | What to check |
|---|---|
| `/ci` (Brief) | Workspace context chips show per-brand "Nd ago" (#11). Each move has a clickable colored brand pill (#10 + cross-link). CIAlertFeed renders below moves (#6). On a fresh empty workspace, CIWelcomeBanner replaces the old empty-state (#7). |
| Click brand chip on move | Lands on `/ci/analytics?focus_brand=<name>`. Banner at top says "Focusing on: <name> · scrolled to its AI insight card". Auto-scrolls + pulse-highlights the matching card. Click "Clear" drops the param. |
| `/ci/analytics` | Each priority card has the small ⓘ "Why this score?" pill at bottom-right. AI insights panel has an own-brand placeholder card pinned first if no own-brand narrative exists. |
| Click "All 12 metrics" → click a metric → modal | New "Why this score?" section at bottom shows per-brand expandable raw_inputs (growth_rate, voice_share_pct, platform_breakdown, etc.). |
| `/admin` | New "Pending Scrapes" panel above applicants list. Click-to-copy scrape command per workspace. |
| Approve a test applicant via admin | They receive an email with the invite code if RESEND_API_KEY is set on ECS. |
| Workspace switcher dropdown | Hydrates from `GET /api/ci/workspaces` on mount. No more "coming soon" footer; says "Create / edit workspaces in Settings." |
| `/ci/settings` editing workspace | PATCH /api/ci/workspace/:id is called (was POST upsert). |

If anything's broken, ping me on Slack with the page + symptom.

---

## 6. Recommended next sequence (your decision)

### Option A (my recommendation) — Foundation-first

1. **You merge nothing more from me right now**, since the 5 PRs already landed
2. **Verify on Vercel preview** (the §5 checklist above)
3. **Push your J1 burner XHS account work** when ready
4. **I start `will/snapshot-history`** (#21 from gap analysis — analysis_history table + WoW deltas + sparklines)
5. **In parallel: 3-5 customer outreach** to get real signal
6. **Re-discuss composite indices scope after that** — you might still want all 12; might want 6; might want a different surface

### Option B — Accept my pushback on indices, give me green-light for snapshot

Same as A but skip step 6's discussion — you already buy the foundation-first
argument and I can start indices implementation only after #21 + customer signal.

### Option C — Override me on indices

Tell me to start the composite indices implementation now per your spec.
I'll do W9-W11 starting with the 9 high-confidence indices in §9 Step 2.
Will be ~5-7 days of focused work + ~1-2 weeks of weight tuning + the
3 new pipelines from §9 Step 4.

---

## 7. Open questions for you

1. **§4 my answers to your spec §10 questions** — agree? disagree? Reply on PR #28 or here.
2. **Option A / B / C above** — which path?
3. **Workspace narrative cleanup** — I added `--brands-only` to narrative_pipeline + cron uses it (with full-pipeline fallback). Is that the right resolution, or do you want to actually surface the workspace narrative somewhere?
4. **Composite indices spec drift** — if we go with Option C, do you want to lock the spec further first (eliminate my disagreements on Q2 + Q5) or implement-as-written and adjust during?

---

## 8. What's blocked on you (carry-forward)

Same as your handoff §4 J-row, unchanged:

| # | Task |
|---|---|
| J1 | B0 burner XHS account procurement + manual pre-warm — blocks all fresh-data work, dark metrics, merchant scrapers |
| J2 | Validate composite-index outputs against intuition once shipped |
| J3 | Optimize Overview tab when V1.5 lands |
| J4 (mine) | Review the 5 merged commits if you want to spot-check anything I shipped |
| J5 | Share platform link with 3-5 target SMB contacts (gap §5 #5) — gives us real signal that should drive Option A vs C |

---

## 9. References

- `OPEN-TODOS-FOR-JOANNA-2026-05-03.md` — coverage audit matrix in §8 (everything backend → UI)
- `WILL-TO-JOANNA-2026-04-30.md` — prior handoff (Day 1 + Day 2 + lifecycle)
- `WILLIAM-HANDOFF-2026-04-23.md` — your scraper hardening context
- `SPEC-COMPOSITE-INDICES-V1.md` — what we're disagreeing about
- `DATA-FLOW-AND-METRICS-ANALYSIS-2026-05-02.md` — the 3 issues, all resolved
- `FRONTEND-BACKEND-GAP-ANALYSIS-2026-05-02.md` — the 22-item workplan, mostly resolved
- `ROADMAP.md` — overall product state

---

## 10. Process notes from this session

- **Merge strategy:** `git merge --no-ff` (preserved per-PR commits + verification recipes). Each merge commit's title `Merge will/X — <one-line summary> (#NN)` makes `git log --oneline` scannable.
- **Conflict resolution log:** the only real conflict was on the move-card brand chip — combined `brandColorHsl` (PR #32) with the cross-link button (PR #34) into a single colored, clickable chip. No feature dropped.
- **Branches deleted** (local + remote): all 5. `main` is now the source of truth.
- **Three-lens (Architect / UIUX / User) framing** in every commit body. Tell me if too verbose — I'll trim next session.
- **`.claude/settings.local.json`** intentionally never committed (Will's local IDE settings).
- **`INTELLIGENCE-ARCHITECTURE-v2.md`** — pre-existing draft from before this session, intentionally never staged.

---

Standing by. Ping when you've reviewed §6 and decided A/B/C.

— Will (with Claude)
