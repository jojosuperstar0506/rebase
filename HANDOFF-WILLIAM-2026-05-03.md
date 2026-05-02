# Handoff to William — Composite Indices + V1 Trust Polish

**From:** Joanna (with Claude)
**Status:** Ready for William to read + (a) ack the spec, (b) start implementation
**No timelines in this doc** — only tasks, ownership, and dependencies.

> **🆕 Update — Parallel Claude session shipped PR #29.** 4 frontend bugfixes + 1 bonus fix landed on `jo/bugfixes-and-display-fixes`. Verification surfaced **2 backend gaps that block the workspace switcher from working end-to-end** — these are now in your queue (W6, W7 below). PR #29 is mergeable but the workspace switcher only fully works once W6+W7 land.

---

## 0. How to use this doc

**If you're William:** read sections 1-4 (~10 min), then either greenlight the spec in §3 or ping Joanna with concerns. Then read §5 to know what your Claude should do.

**If you're William's Claude:** read this doc IN FULL FIRST before touching any code. Then read the docs in §6 in the order listed. Confirm in your first reply that you've read all of them by listing 3 specific things you learned from each. Then start the implementation in §5. **Do not stray** from the scope in §5.

---

## 1. TL;DR — where we are

Recent shipped state:
- 🟢 **CI vFinal in production.** Brief / Analytics / Library render real DeepSeek output, no mocks. End-to-end loop on Songmont workspace. (William's Day 1 + Day 2 + lifecycle, PRs #25/#26.)
- 🟢 **Scraper hardening shipped.** XHS scraper has verified-account picker, `万`-aware count parser, auth-wall detection. Central `scraping_rules.yml`. `/api/ci/scrape` gated to 503. (Joanna, PR #25.)
- 🟢 **Frontend polish shipped.** Real `runAnalysis` polling on Refresh, relative-time freshness, stale-data banner, workspace context block, AI-deltas disclaimer. (Joanna, PR #27.)
- 🟢 **DB cleanup applied.** 5 buggy zero-follower scrape rows + 334 duplicate analysis_results deleted.
- 🟢 **Composite indices framework locked.** 3 pillars × 12 indices spec written and ready for implementation. **PR #28 open for review.**
- 🟢 **UI bugfixes shipped.** Workspace switcher, brand-link parser, brand_insight panel, Coverage-pending pills, refetch loop fix. **PR #29 ready for review.**

**The product is launchable** for design-partner customers using Songmont as the canonical demo. Several issues prevent self-serve onboarding (see §4 V1 polish queue).

---

## 2. Phases of the product (no timelines, just maturity)

| Phase | Status | What it covers |
|---|---|---|
| **V1 Launchable** | ✅ Live | Brief/Analytics/Library on real data; 1 demo workspace fully working |
| **V1 Trust Polish** | 🟡 In progress | Numeric coherence, dark metrics, English i18n, admin onboarding tool, workspace endpoints |
| **V1.5 Composite Indices** | 📋 Spec locked | 3 pillars × 12 proprietary indices; pre-computed table; new API + UI |
| **V2 Comparison Sets** | 📋 Spec ready | Free-form LLM clustering of competitors; per-cluster briefs |
| **V2 Snapshot table** | 🔴 Queued | Real WoW deltas + 8-week sparklines |
| **V2 Merchant scrapers** | 🔴 Queued | 抖店 / 小红书品牌号 / 千牛 — different risk model, unique data |
| **V3 Customer installer** | 🔴 Queued | One-button Mac/Windows installer for self-serve onboarding |

**Goal:** ship V1 Trust Polish + V1.5 Composite Indices to make the product sellable. Sequence matters more than dates.

---

## 3. PR #28 — the locked spec

**File:** `SPEC-COMPOSITE-INDICES-V1.md`
**PR:** https://github.com/jojosuperstar0506/rebase/pull/28
**Length:** ~1,200 lines, 13 sections

**The framework:**
```
🎯 BRAND EQUITY      → HERO: Brand Heat
                       Brand NPS · Pricing Power Index · Loyalty Index

📣 MARKETING ENGINE  → HERO: Content Velocity Index
                       Influencer Footprint · Search Dominance

🚀 COMMERCE ENGINE   → HERO: Hero Product Index (爆品)
                       Launch Cadence · Trend Capture · Innovation Score · Promotional Discipline
```

3 hero numbers always visible; 9 supporting one click away. Each index has 'Explain this score' drill-down. Pre-computed to a new `composite_indices` table.

**5 open questions for William** (in §10 of the spec):
1. Cost ceiling on +12 derivations per workspace per `/api/ci/run-analysis`
2. NPS scale convention: native -100 to +100 (recommended) or normalized 0-100?
3. First-week defaults when direction/delta are null
4. Trend Capture detection algorithm — most novel pipeline, deserves a 30-min sync
5. Versioning policy: what triggers `v1.0` → `v1.1` bump?

**Decision needed from William:** answer the 5 questions, then implementation can start.

---

## 4. All open todos by owner

### 🔴 William — V1 Trust Polish (do BEFORE composite indices)

These are blocking customer trust. Fix first.

| # | Task | Why it matters | Doc reference |
|---|---|---|---|
| W1 | **Numeric-coherence coercer** in `brand_positioning_pipeline.py` | LLM hallucinates specific deltas in move text ("from 82 to 72" when 82 doesn't exist anywhere). The disclaimer in PR #27 is interim; this is the real fix. | DATA-FLOW §3 Issue 3 |
| W2 | **Investigate dark metrics** — `brand_insight`, `design_profile`, `kol_strategy` | Find what input each pipeline expects vs has. `brand_insight` is actually fine (it's a narrative, not a score — frontend just hides it). `design_profile` + `kol_strategy` need scraper coverage (post-burner). | METRIC-LOGIC §2 |
| W3 | **`follower_count = 0` guard** in scoring pipelines | Prevents future zero-result scrapes from poisoning growth math. | DATA-FLOW §3 Issue 1 |
| W4 | **UPSERT in domain_aggregation_pipeline** (or dedup-on-insert) | Prevents the 5× duplicate rows we just cleaned up from coming back. | DATA-FLOW §3 Issue 2 |
| W5 | **Admin pending-scrapes tool** — `GET /api/admin/pending-scrapes` + admin page | Unblocks new-customer onboarding. Today: customer signs up → empty Brief forever. With this: admin sees them and triggers scrape manually. | WILL §5.1a |
| **W6** 🆕 | **`GET /api/ci/workspaces`** — list endpoint returning all workspaces for the current user | Workspace switcher UI was built in PR #29 (`WorkspaceSwitcher.tsx`) but currently can't populate the dropdown — there's no list endpoint. Need: `GET /api/ci/workspaces` returns `[{id, brand_name, brand_category, created_at}, ...]` filtered by `user_id` from JWT. | PR #29 footer |
| **W7** 🆕 | **Fix `POST /api/ci/workspace` to not upsert** — currently overwrites; must INSERT a NEW workspace instead | Today the endpoint upserts, so you can never create a 2nd workspace per user. Fix: split into POST (always insert), PATCH (update specific id). The "+ New Workspace" button in PR #29 will work once this lands. | PR #29 footer |
| **W8** 🆕 | **English i18n audit** — every UI string must have a working English version | Joanna flagged: when `lang='en'`, some strings still render in Chinese. Specific known case: `formatScriptForCopy` in `CIBrief.tsx` hardcodes `【开场3秒】 / 【主体15秒】 / 【结尾3秒】`. Audit all CI pages + components systematically. PR #29 didn't cover this — was added to scope after the parallel Claude session started. Could go to either William OR Joanna's parallel session as a follow-up. | This doc |

**Sequence:** Do W1-W8 BEFORE starting composite indices (W9-W11). Each is a separate small commit; one PR for the whole batch is fine.

### 🔴 William — V1.5 Composite Indices

After V1 trust polish lands.

| # | Task |
|---|---|
| W9 | Read `SPEC-COMPOSITE-INDICES-V1.md` end to end |
| W10 | Answer the 5 open questions in spec §10 (PR #28 conversation) |
| W11 | Implement per the 6-step migration plan in spec §9 |

**Sequence:** W9 → W10 → W11. W11 starts after Joanna acks W10 answers.

### ✅ Parallel Claude session — DONE (PR #29 shipped)

Branch: `jo/bugfixes-and-display-fixes`. **PR #29 open, ready for Joanna review + merge.** 5 commits.

| # | Task | Status | Where |
|---|---|---|---|
| P1 | Workspace switcher UI (`WorkspaceSwitcher.tsx` mounted in `CISubNav`) | ✅ **shipped** — but blocked on backend (W6+W7) before fully functional | `WorkspaceSwitcher.tsx` |
| P2 | Brand-link auto-resolve in Settings — pasted XHS/Douyin URLs auto-resolve via `parseLink` | ✅ **shipped** | `CISettings.tsx:249` |
| P3 | Render `brand_insight.ai_narrative` as "AI brand insights" panel on Analytics | ✅ **shipped** | `CIAnalytics.tsx:226-256` |
| P4 | "Coverage pending" pill for `design_profile` + `kol_strategy` (instead of 0) | ✅ **shipped** | `CIAnalytics.tsx:536` |
| Bonus | Cut a refetch loop in `addKnownWorkspace` that fired during preview verification | ✅ **shipped** | (per PR body) |
| **P5** 🟡 | **English i18n audit** — added to scope after the parallel Claude started; PR #29 didn't cover. **Still pending** — assigned to William as W8 above (or could route back to a fresh parallel Claude) | 🟡 pending | TBD |

**Verification (per parallel Claude):** browser preview against stub backend — workspace pill renders, AI insights panel populates with 3 cards, Coverage-pending pills replace zeros, URL paste resolves to "Songmont", bad URL produces inline error. `tsc --noEmit` and `vite build` both clean.

**Caveat** — the workspace switcher UI is built but won't fully function until W6+W7 land on the backend. Joanna can merge PR #29 now; the switcher just won't be useful until then. Or hold the merge until W6+W7 are ready and ship together.

### 🟢 Joanna — background

| # | Task | Status |
|---|---|---|
| J1 | B0 burner XHS account procurement + manual pre-warm | Not started — blocks all fresh-data work and merchant scrapers |
| J2 | Validate composite-index outputs against intuition once they ship | Awaiting William implementation |
| J3 | Optimize Overview tab — what data should show + match with backend | Deferred until W1-W5 + V1.5 lands |

### 🟢 Future / V2

| Task | Owner | When |
|---|---|---|
| Comparison Sets implementation per `SPEC-COMPARISON-SETS-V2.md` | William | Post-V1.5 |
| `analysis_history` snapshot table → real WoW deltas + sparklines | William | Post-V1.5 |
| Mount orphaned components (`CIAlertFeed`, `CIWelcomeBanner`) | Either | V2 polish |
| Phase B merchant scrapers (抖店 / 品牌号 / 千牛) | Joanna + William | Post-burner |
| Phase D customer installer | William | V3 |

---

## 5. For William's Claude — what to do, what NOT to do

### ✅ Read first, then implement

You have 3 sequential bodies of work. Order matters; do not skip ahead.

**Track 1 — V1 trust polish core (W1-W4):**
- W1 numeric-coherence coercer in `brand_positioning_pipeline.py`
- W2 dark metrics investigation (mostly read-only — `brand_insight` is fine, `design_profile` + `kol_strategy` are scraper-coverage gaps)
- W3 `follower_count = 0` guard in scoring pipelines
- W4 UPSERT in `domain_aggregation_pipeline`

Each is one file, one commit. Open one PR titled "v1 trust polish: coercer + zero-follower guard + UPSERT + dark-metric audit." Reference DATA-FLOW-AND-METRICS-ANALYSIS-2026-05-02.md.

**Track 2 — V1 trust polish endpoints + i18n (W5-W8):**
- W5 admin pending-scrapes tool (`GET /api/admin/pending-scrapes` + admin page)
- W6 `GET /api/ci/workspaces` list endpoint
- W7 fix `POST /api/ci/workspace` to insert (not upsert)
- W8 English i18n audit

Can be one PR or split — your call. Title: "v1 trust polish: workspace endpoints + admin tool + i18n."

**Track 3 — Composite Indices V1 (W9-W11):**
- W9 Read `SPEC-COMPOSITE-INDICES-V1.md` end to end FIRST
- W10 Reply on PR #28 with answers to the 5 open questions in §10
- W11 After Joanna acks the answers, start the 6-step migration in spec §9
- Open implementation PR titled `will/composite-indices-v1`

**Sequence rule:** Track 1 → Track 2 → Track 3. The trust fixes block customer launch; indices are the bigger lift but customer trust is the foundation.

### ❌ Do NOT do these things

- ❌ **Don't modify the composite-indices spec without sync.** If you disagree with a design choice, raise it in the PR #28 conversation. Don't silently change weights or formulas.
- ❌ **Don't refactor adjacent code "while you're there."** Scope discipline beats polish. Each PR should do exactly what its title says.
- ❌ **Don't touch the frontend bugfixes** — `jo/bugfixes-and-display-fixes` is owned by a parallel Claude session. Workspace switcher, brand-link parser, brand_insight display, "Coverage pending" badges, English i18n — all theirs. You implement backend + maybe small UI for the indices.
- ❌ **Don't run scrapers** or trigger `/api/ci/scrape`. It's gated to 503 in V1 and will stay that way until burner account work lands. If you need fresh data for testing, ask Joanna.
- ❌ **Don't add new endpoints beyond what the specs prescribe.** The endpoint surface is already at 35; we're trying to consolidate, not expand.
- ❌ **Don't implement Comparison Sets V2** (`SPEC-COMPARISON-SETS-V2.md`). That's post-V1.5. Different scope.
- ❌ **Don't merge your own PRs to main.** Open them; Joanna reviews + merges.

### 🤝 When to ask, when to decide

**Ask Joanna when:**
- A spec ambiguity affects user-facing behavior (NPS scale convention, "Coverage pending" copy, etc.)
- Your testing produces an index score that intuitively feels wrong — show her the score and the inputs
- You discover a 5th open question not in §10

**Decide on your own when:**
- Implementation choices that don't affect output (data structures, code organization, naming of internal helpers)
- Test fixtures, error handling patterns
- Query optimizations
- Migration step ordering within the 6-step plan

---

## 6. Reference docs — read in this order

For William's Claude:

1. **`SPEC-COMPOSITE-INDICES-V1.md`** ⭐ THE locked spec, your primary work
2. **`DATA-FLOW-AND-METRICS-ANALYSIS-2026-05-02.md`** — explains W1, W3, W4
3. **`METRIC-LOGIC-INVESTIGATION-2026-05-02.md`** — explains W2 (note: header says "partially superseded" — read for dark-metric root causes only, ignore the tier proposal)
4. **`FRONTEND-BACKEND-GAP-ANALYSIS-2026-05-02.md`** — explains W5 + endpoint surface to avoid bloating
5. **`WILL-TO-JOANNA-2026-04-30.md`** §1-§5 — your previous handoff, reminds you what's already shipped
6. **`WILLIAM-HANDOFF-2026-04-23.md`** — Joanna's scraper hardening context (you'll touch scoring pipelines that consume scrape data)
7. **`SPEC-COMPARISON-SETS-V2.md`** — skim only; out of scope for now
8. **`ROADMAP.md`** — current state of overall product

After reading, in your first reply, list 3 specific things you learned from each of docs 1-4. This proves you actually read them. Skim 5-8.

---

## 7. Success criteria (no timelines, just done states)

**Track 1 + Track 2 done when:**
- Brief verdicts no longer fabricate deltas (W1)
- Dark-metric audit shipped + documented (W2)
- Zero-follower scrapes can't poison growth math (W3)
- No more 5× duplicate analysis_results rows (W4)
- New customers can be onboarded via admin trigger (W5)
- Workspace switcher dropdown populates from real data (W6)
- "+ New Workspace" creates a 2nd workspace (W7)
- All UI text renders in English when `lang='en'` (W8)
- PR #28 open questions answered + acked by Joanna

**Track 3 done when:**
- All 12 indices computed + stored in `composite_indices` table
- 3 hero indices visible at top of Analytics; 9 supporting on demand
- "Explain this score" drill-down works on every index
- API endpoint `/api/ci/indices` returning the right shape
- Joanna has validated the Songmont outputs against intuition; weights tuned if needed
- Old 12-metric grid still exists (V1.5 sunset is later, separate scope)

---

## 8. Communication

- **Spec questions:** PR #28 comment thread
- **Implementation questions:** New issue per track, tag Joanna
- **Crisis:** Slack Joanna directly
- **Daily progress (recommended):** push commits to a `wip/` branch on each track so Joanna can see the diff incrementally; flip to `will/` branch + open PR when ready for review

---

## 9. Status of branches

| Branch | Owner | Status | What's on it |
|---|---|---|---|
| `main` | both | merged | V1 live (PRs #25, #26, #27) |
| `jo/metrics-and-bugfixes` | Joanna | PR #28 open | The composite indices spec + this handoff doc |
| `jo/bugfixes-and-display-fixes` | Parallel Claude | **PR #29 open — ready for Joanna review/merge** | P1-P4 + bonus refetch fix |
| (`will/v1-trust-polish`) | William | not yet created | W1-W8 in §5 (includes the 2 new backend gaps W6+W7) |
| (`will/composite-indices-v1`) | William | not yet created | W9-W11 in §5 |
| `jo/scraping-hardening` | Joanna | merged → can be deleted | Old branch from PR #25 |
| `jo/frontend-polish` | Joanna | merged → can be deleted | Old branch from PR #27 |

---

## 10. Questions for Joanna (William, write your answers here)

1. **Spec questions** — see §10 of `SPEC-COMPOSITE-INDICES-V1.md`. Reply on PR #28.
2. **Anything else** that's unclear from this handoff? Surface it before starting impl.
3. **Re-sequencing requests** — if priorities have shifted on your end, ping early so we can adjust the queue order.

---

**Joanna's expectation:** ack PR #28, then start the work in the sequence laid out in §5.
