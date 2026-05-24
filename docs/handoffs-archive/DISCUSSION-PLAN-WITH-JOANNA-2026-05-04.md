# Discussion Plan with Joanna — Pushback Items from Last Session

**Prepared by:** Will (with Claude)
**Date:** 2026-05-04
**Context:** Will's last session shipped 5 PRs (W1-W8 + V1.5 polish + quick wins), completing ~70% of Joanna's handoff. The remaining 30% was deliberate — Will pushed back on scope, timing, and two spec design decisions. This document organizes those disagreements into a structured conversation.

---

## How to use this doc

There are **6 pushback items** and **1 path decision**. Each item has:
- **Joanna's position** (what she asked for / spec'd)
- **Will's position** (why he pushed back)
- **The stakes** (what happens if we go one way vs the other)
- **Suggested resolution path**

Read them in order. Items 1-2 are the big ones (they drive the next 1-2 weeks of work). Items 3-6 are smaller and can be resolved quickly.

---

## THE BIG DECISION: Option A / B / C

Before the individual items, Joanna needs to pick a path. This frames everything else.

| Option | What it means | Will's take |
|---|---|---|
| **A (Will's rec)** | Foundation-first: Will starts `will/snapshot-history` (#21 analysis_history table, ~2-3 days). Real WoW deltas + sparklines land. Customer outreach in parallel. Re-discuss composite indices after we have both historical data AND customer signal. | Recommended. Lower risk, and every index in the spec benefits from the foundation. |
| **B** | Same as A, but Joanna explicitly accepts Will's pushback — no re-discussion needed. Indices only happen after #21 + customer signal. | Fine by Will — just removes the re-discussion step. |
| **C** | Override Will's pushback. Start composite indices implementation now per `SPEC-COMPOSITE-INDICES-V1.md` §9. ~5-7 days focused work + ~2 weeks weight tuning + 3 new pipelines. | Will will do it if asked, but believes it's premature (see Item 1 below). |

**Joanna: which path?** Everything below assumes she's read this and has a lean.

---

## Item 1: Composite Indices Scope (W9-W11) — the main disagreement

### Joanna's position
The composite indices spec (`SPEC-COMPOSITE-INDICES-V1.md`) is locked. 12 proprietary indices across 3 pillars are the product moat — the thing that makes Rebase defensible vs commodity scraping. She wants implementation to start now. She scoped it at "4-5 days of focused implementation" and assigned it to Will.

### Will's position
The strategic argument is correct — composite scores ARE the moat. But the implementation timing is wrong:
- **It's V2-sized work labeled V1.5.** 12 indices, 4 need entirely new pipelines (trend_capture, innovation, deeper kol_strategy, loyalty repeat-author tracking). 6 of 12 are marked Medium/Low confidence in the spec itself.
- **No historical data foundation.** Without the snapshot table (#21), every index ships with `direction=null` and `delta=null` for 8+ weeks. The WoW arrows — arguably the most valuable part of the framework — would be empty.
- **1 customer.** Building 12 proprietary indices for Songmont alone is over-engineering before market signal. What if customers want 6 different indices? Or care more about a feature that isn't in the spec?
- **The spec has 5 unresolved design questions** (§10), two of which Will and Joanna disagree on (Q2 NPS scale, Q5 versioning). Implementation-while-debating produces rework.

### The stakes
- **If we go with Joanna:** indices ship sooner, but without historical deltas for weeks, and we may over-build before customer validation.
- **If we go with Will:** snapshot table lands first (~3 days), then indices get real WoW data from day one AND we have customer signal to validate the framework. Adds ~1-2 weeks to indices timeline.

### Suggested resolution
Will recommends talking through this one first because it drives the next 2 weeks. Two questions to ask Joanna:
1. "Are you comfortable shipping indices with `direction=null` for 8 weeks, or does the snapshot table foundation change your view?"
2. "Would starting with 6 high-confidence indices (the ones with existing pipeline inputs) instead of all 12 be an acceptable middle ground?"

---

## Item 2: NPS Scale — 0-100 vs -100 to +100 (Spec §10, Q2)

### Joanna's position
Use real NPS convention: -100 to +100. It's the recognized signal. UI shows explicit minus prefix. SMB owners may encounter NPS in other contexts and expect the standard scale.

### Will's position
Normalize to 0-100. Reasoning:
- All other 11 indices are 0-100. One "weird" scale creates UI inconsistency and confusion.
- Target users are Chinese SMB brand owners, not enterprise teams running NPS programs. They won't be cross-referencing against internal NPS surveys.
- Visual consistency (all bars/gauges on the same range) matters more than convention purity for this audience.

### The stakes
- Low stakes technically — it's one formula constant. High stakes for user experience consistency.
- If -100 to +100: the NPS card looks different from every other card. Might need different gauge/bar component.
- If 0-100: simpler UI, but we lose the "this is a real NPS" credibility signal.

### Suggested resolution
Consider a compromise: **compute as -100 to +100 internally** (preserving methodology credibility), but **display as 0-100 on the default view** with a toggle or footnote "NPS scale: -100 to +100" for users who want the raw convention. This gives Joanna the standard and Will the visual consistency.

---

## Item 3: Versioning Policy (Spec §10, Q5)

### Joanna's position
Weight tweaks don't bump version. Weights are tuning, not methodology. Only algorithm changes, new inputs, or dropped inputs trigger a version bump.

### Will's position
**Any output-affecting change bumps version**, including weight tweaks. Reasoning:
- Customers see scores move without explanation. Even if the methodology is "the same," a weight change from 0.40 → 0.35 can shift a score by 5+ points.
- Trust erosion: "My Brand Heat was 78 last week, now it's 73, nothing changed" — but actually we quietly reweighted.
- v1.0 → v1.0.1 cost is near-zero. Semantic versioning: patch for weight tweaks, minor for input changes, major for structural redesigns.

### The stakes
- If Joanna's way: faster iteration on weights, but silent score shifts that could confuse customers.
- If Will's way: every weight tweak leaves a paper trail. Slightly more overhead, but customer trust preserved.

### Suggested resolution
Will's proposal is the safer default for a trust-sensitive product. Suggest adopting semantic versioning (major.minor.patch) where weight-only tweaks are patches. This makes Joanna's "weight tweaks are tuning" point visible (it's a patch, not a minor bump) while preserving Will's "any change is tracked" principle.

---

## Item 4: Keep vs Delete CITrendChart (#14)

### Joanna's position
Delete it — it's an orphaned component today. Clean code, smaller surface area.

### Will's position
Keep it parked. Once the snapshot table (#21) ships, CITrendChart becomes free wiring for sparklines. The component already has `if (trends.length === 0) return null` so it renders nothing today — zero user impact. Code is cheap to keep, expensive to remove and re-add.

### The stakes
Minimal either way. ~200 lines of code. The question is really a philosophy one: clean-as-you-go vs keep-useful-scaffolding.

### Suggested resolution
If Joanna picks Option A or B (snapshot table first), keeping CITrendChart is clearly right — it'll be wired within weeks. If Option C (indices first, no snapshot soon), deleting is cleaner since there's no near-term use. **Let the path decision drive this one.**

---

## Item 5: Keep vs Delete 4 Unused Backend Endpoints (#19)

### Joanna's position
Delete `intelligence`, `connections/check`, `pipeline/status`, `trends/summary` — they're unused, dead code should be removed.

### Will's position
Keep all four. Reasoning:
- Code is cheap to keep (~80 lines total across 4 endpoints).
- Removing risks breaking an untested path (especially `pipeline/status` which could be called by monitoring scripts Will hasn't fully traced).
- Better cleanup target after V2 ships, when we know definitively which paths are dead.

### The stakes
Very low either way. This is a code hygiene preference, not a product decision.

### Suggested resolution
Suggest a middle ground: **grep for any references to these endpoints** across the codebase, cron scripts, and monitoring configs. If truly zero references found, delete. If any reference exists (even in comments or configs), keep. Evidence-based cleanup instead of opinion-based.

---

## Item 6: Trend Capture Algorithm (Spec §10, Q4)

### Joanna's position
Implement it as part of the 12-index framework. The spec describes a trend-emergence lag detection pipeline with 4 weighted inputs.

### Will's position
Defer to V2. Reasoning:
- It's "the most novel pipeline" (Joanna's own spec language).
- Needs a "what's a trend?" definition — e.g., hashtag with >100% WoW growth in usage rate within a category. This is an ML problem that deserves its own design discussion.
- Without weeks of historical data to validate against, the output would be untested guesses.
- The spec itself acknowledges this: "Medium — requires NEW trend-detection pipeline."

### The stakes
- If we build it now: ships a pipeline with no validation data. Could produce misleading trend scores.
- If we defer: loses one of the 12 indices for launch, but the remaining 11 still tell a compelling story. Can ship it properly once we have the data.

### Suggested resolution
Will's position seems strong here — even Joanna's spec marks this Medium confidence and calls it a "new pipeline." Suggest deferring Trend Capture to after the snapshot table has collected 4+ weeks of data, then revisiting with real validation. The spec already plans for this in §9 Step 4.

---

## Other open items (not pushback, just need Joanna's input)

These aren't disagreements — just items that need Joanna's acknowledgment or action:

| # | Item | What's needed |
|---|---|---|
| J1 | Burner XHS account | Blocks all fresh-data work, dark metrics, merchant scrapers, customer onboarding. Status? |
| J5 | Share platform with 3-5 SMB contacts | Gives real customer signal to inform the indices scope discussion. Timeline? |
| Narrative cleanup | Will added `--brands-only` to narrative_pipeline cron | Is this the right resolution, or does Joanna want workspace-level narratives surfaced somewhere? |
| WTP cap_hit UI | Backend `cap_hit` field ready, no frontend surface yet | Worth building in V1.5, or defer? |
| Cron timing | Daily pipeline probably grew to 50-70 min for 1 workspace | Worth a timing check on next ECS sync? |

---

## Suggested conversation flow

1. **Start with the path decision** (Option A/B/C). Everything else cascades from this.
2. **If A or B:** resolve Items 4-5 quickly (both become easy decisions), then move to Items 2-3 (NPS + versioning) since those shape the future indices spec.
3. **If C:** resolve Items 2-3-6 first (they're blocking for implementation), then Items 4-5.
4. **End with the non-pushback items** (J1 status, J5 timeline, narrative cleanup).

Total estimated discussion time: 20-30 minutes if Joanna has read both handoff docs.
