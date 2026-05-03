# Open todos for Joanna — what shipped, what didn't, what's next

**From:** William (with Claude)
**Date:** 2026-05-03
**Reading time:** ~5 min
**Action needed from Joanna:** review §3 disagreements + answer §4 sequencing question

---

## 1. What shipped this session — 3 PRs ready for your review

| Branch | What | Maps to your handoff |
|---|---|---|
| `will/track1-trust-polish` | Numeric coercer + zero-follower guard + idempotent insert + dark-metric audit | W1 + W2 + W3 + W4 |
| `will/track2-endpoints-i18n` | Admin pending-scrapes + workspace list endpoint + POST/PATCH split + i18n audit | W5 + W6 + W7 + W8 |
| `will/v1.5-polish` | Brand chip on moves + CIWelcomeBanner empty state + CIAlertFeed mounted | gap §5 #12 + #13 + #17 |

All three are linear (each branched from `main`, can be merged in any order — no conflicts among them). Each is tightly scoped with verification recipes in the commit message.

---

## 2. Items I did NOT build today

### 🟡 Skipped within Batch C — deferred, ~2.5h total work

These are low-risk and worth doing soon, just couldn't fit in this session:

| # | Task | Effort | Why I skipped |
|---|---|---|---|
| **#16** | "Why this score?" expandable using raw_inputs on Analytics cards | ~1.5h | Needs backend passthrough on `/api/ci/analytics` + frontend disclosure component. High-value trust win but a real day's work, not a quick win. |
| **#18** | Per-brand scrape recency in workspace context | ~45min | Needs SQL helper to surface `last_scraped_at` per competitor + frontend wiring. Smaller than #16 but still backend+frontend. |

Both are on the recommended path. They're notably cleaner to do AFTER your `#21 analysis_history snapshot table` lands — `last_scraped_at` becomes one of the snapshot columns rather than a JOIN.

### 🟢 Verified already done — no work needed

| # | Task | Status |
|---|---|---|
| **#15** | Show `priority_rationale` on Analytics metric cards | Already rendered at `CIAnalytics.tsx:460` and `:692`. Your gap analysis must have been against an earlier commit. |

### 🔴 Disagreements — held back deliberately

I disagreed with two recommendations from your `FRONTEND-BACKEND-GAP-ANALYSIS-2026-05-02.md`. Open to your pushback:

| # | Your recommendation | My take | Reasoning |
|---|---|---|---|
| **#14** | Delete `CITrendChart` component (orphaned today) | **Keep parked** | Once `analysis_history` snapshot table ships, `CITrendChart` becomes free wiring. Code is cheap to keep, expensive to remove and re-add. Current `if (trends.length === 0) return null` already prevents it from rendering. |
| **#19** | Delete 4 unused backend endpoints (`intelligence`, `connections/check`, `pipeline/status`, `trends/summary`) | **Keep all four for V1.5** | Code is cheap to keep. Removing risks inadvertently breaking a path I haven't traced. Better cleanup target after V2 ships, when we know definitively which paths are dead. |

Tell me if you disagree on either; happy to delete if you want a slimmer surface area.

---

## 3. The bigger items I haven't started

These are real work, not deferred polish. They split into two categories:

### 🔴 Will/V1.5 — HIGH VALUE, ~2-3 days

| Branch | Task | Effort |
|---|---|---|
| `will/snapshot-history` (not started) | **#21 `analysis_history` snapshot table** | ~2-3 days |
| Goal | Real WoW deltas on every metric (no more `delta: null`) + 8-week sparklines unblocked + `CITrendChart` unblocked | |

I think this is **more valuable than the composite indices spec** because:
- It's a foundation: every index you proposed in `SPEC-COMPOSITE-INDICES-V1.md` benefits from real historical data
- Without it, indices ship with `direction=null` for the first 8 weeks — degrading the value of the framework
- It's "data layer work" that customers don't see directly but every customer-facing number gets sharper

**My recommendation: do this BEFORE any composite indices work.**

### 🔴 Will/V2 — Comparison Sets, ~5-6 days

| Branch | Task | Effort |
|---|---|---|
| `will/comparison-sets` (not started) | **#20 per `SPEC-COMPARISON-SETS-V2.md`** | ~5-6 days |
| Goal | LLM auto-clustering of competitors into segments (国际启发 / 价值挑战者 / 国潮新锐 etc.) | |

I haven't started this because the V1 trust polish has to land first. Worth a sync before I begin.

### 🟠 Composite Indices — pushback from earlier still stands

Per my earlier message: I think W9–W11 (composite indices implementation) is **V2-sized work labeled V1.5**. 12 indices, 4 of which require new pipelines, 6 of which are Medium/Low confidence today. **My recommendation: ship #21 (snapshot table) → put V1 in front of 3-5 customers → THEN decide if all 12 indices are right or 6 simpler ones are enough.** I'll answer your 5 §10 questions on PR #28 as part of this conversation, but I don't think we should commit to implementation until we have customer signal.

---

## 4. Suggested sequence (for your sign-off)

My recommended order from here:

1. **Now** — review + merge the 3 PRs from §1 (trust polish + endpoints + v1.5 polish)
2. **Then** — I do #16 + #18 (~2h) on a small follow-up branch
3. **Then** — I start `will/snapshot-history` (#21, ~2-3 days)
4. **In parallel** — you push your `B0 burner XHS account` work; once that lands, the dark metrics (`design_profile`, `kol_strategy`) get real inputs and unblock honestly
5. **After #21** — sync on composite indices scope. I argue for **6 high-confidence indices** instead of all 12, given customer count
6. **After indices** — Comparison Sets (#20)

If you disagree on order or scope, tell me — I'll adjust.

---

## 5. Items still on you (carry-forward from your handoff §4)

| # | Task |
|---|---|
| J1 | B0 burner XHS account procurement + manual pre-warm — blocks all fresh-data work |
| J2 | Validate composite-index outputs against intuition once shipped |
| J3 | Optimize Overview tab when V1.5 lands |
| Pending | Push `jo/scraping-hardening-v2` if you have follow-up scraper work |

---

## 6. Process notes for next session

- **Linter is normalizing line endings** on Windows — git keeps showing CRLF warnings on `.tsx` files. Harmless but loud. Worth a `.gitattributes` entry: `*.tsx text eol=lf` if you want clean diffs.
- **My commits use heredoc commit messages** with verification recipes in the footer. If you find them too verbose, say so and I'll trim.
- **Three-lens (Architect/UIUX/User) framing** is in every commit body — your call whether to keep that going or simplify.
- **`OPEN-TODOS-FOR-WILLIAM-2026-05-04.md`** would be a natural next handoff doc back to me after you review.

---

## 7. Overall scoreboard

```
HANDOFF-WILLIAM-2026-05-03 §4:
  W1-W8 (Track 1+2)     ✅ DONE — 2 PRs
  W9-W11 (composite)    ⏸ DEFERRED — pushback per §3 above

FRONTEND-BACKEND-GAP-ANALYSIS-2026-05-02 §5:
  #1, #2 (PR #27, cleanup)  ✅ DONE
  #3 (W2 dark audit)        ✅ DONE
  #4 (W1 coercer)           ✅ DONE
  #5 (W3 follower=0)        ✅ DONE
  #6 (mount CIAlertFeed)    ✅ DONE
  #7 (mount Welcome)        ✅ DONE
  #8 (priority_rationale)   ✅ ALREADY DONE
  #9 (Why this score?)      ⏸ DEFERRED — ~1.5h
  #10 (brand chip on moves) ✅ DONE
  #11 (per-brand recency)   ⏸ DEFERRED — ~45min
  #12 (endpoint cleanup)    ❌ DISAGREED — keeping all 4
  #13 (W5 admin tool)       ✅ DONE
  #14 (Comparison Sets)     ⏸ NOT STARTED — ~5-6 days
  #15 (#21 snapshot table)  ⏸ NOT STARTED — recommended next
  #16 (CITrendChart)        ❌ DISAGREED — keep parked
  #17-22 (V2 / future)      ⏸ TRIAGED — see §3+§4 above
```

**Net: ~70% of HANDOFF-WILLIAM-2026-05-03 §4 done. The unfinished 30% is intentional — either deferred for time, deliberately disagreed, or sequenced behind something more important.**

Standing by for your review.
