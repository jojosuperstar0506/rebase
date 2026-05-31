# Brief Signals — Canonical Set

> The audited, post-prune signal set that powers the per-brand competitive
> brief. This is the **single source of truth** for "what signals does a beta
> user see, and what does each one mean?"
>
> Produced by [issue #152](https://github.com/jojosuperstar0506/rebase/issues/152)
> (Epic #136 — Intelligence/Agent layer). Read this before adding, renaming, or
> dropping a signal in `scoring.py`.

## Scope

This documents the signals computed in **`scoring.py`** — the three outputs that
land in every brand's brief:

1. **Brand Momentum Score** (0–100) — how aggressively a brand is growing, scored
   *relative to the cohort* (the hottest brand is near 100).
2. **Threat Index** (0–100) — competitive threat to OMI specifically, scored
   *absolute* against OMI's baseline.
3. **GTM Signal Flags** — boolean event triggers ("this brand just did X").

> **Not in scope:** the `*_index` composite metrics in `composite_indices.py`
> (e.g. `content_velocity_index`, `pricing_power_index`) are a separate system
> with its own methodology — see `SCORING_METHODOLOGY.md`. Don't confuse
> `scoring.py`'s `content_velocity` *momentum signal* with the composite
> `content_velocity_index`; they are unrelated despite the similar name.

## Audit verdict (2026-05-31)

17 signals audited across the three families. Verdict: **all carry decision
value and are kept**, with **one reframe** (a mislabeled signal renamed so the
brief stops implying analysis we don't perform). No outright drops — but two
signals carry caveats founders should review in the next sync (flagged 🟡).

| Family | Signal | Verdict | Notes |
|---|---|---|---|
| Momentum | `xhs_follower_growth` | ✅ Keep | XHS follower growth %, weight 0.20 |
| Momentum | `douyin_follower_growth` | ✅ Keep | Douyin follower growth %, weight 0.15 |
| Momentum | `content_velocity` | ✅ Keep | New XHS posts (absolute), weight 0.15 |
| Momentum | `engagement_trend` | ✅ Keep | XHS likes growth %, weight 0.20 |
| Momentum | `new_products` | ✅ Keep | New SKUs (absolute), weight 0.15 |
| Momentum | `livestream_activity` | 🟡 Keep (caveat) | Douyin-likes growth + live-status boost, weight 0.15 |
| Threat | `price_overlap` | 🟡 Keep (caveat) | Products in OMI's price band, weight 0.25 |
| Threat | `closing_gap` | ✅ Keep | Growing faster than OMI, weight 0.25 |
| Threat | `channel_expansion` | ✅ Keep | New platform/livestream presence, weight 0.20 |
| Threat | `kol_investment` | ✅ Keep | KOL-collab growth, weight 0.15 |
| Threat | `sentiment_momentum` → `engagement_momentum` | ♻️ Reframe | Renamed — see below, weight 0.15 |
| GTM flag | `PRODUCT_BLITZ` | ✅ Keep | +3 SKUs |
| GTM flag | `AWARENESS_PLAY` | ✅ Keep | KOL/mentions up >50% |
| GTM flag | `CHANNEL_EXPANSION` | ✅ Keep | First Douyin data / first livestream |
| GTM flag | `VIRAL_MOMENT` | ✅ Keep | Any social metric z-score > 3 |
| GTM flag | `AGGRESSIVE_PRICING` | ✅ Keep | Product price drop > 10% |
| GTM flag | `RANKING_SURGE` | ✅ Keep | Up 20+ ranking positions |

---

## 1. Brand Momentum Score

Six signals, normalized min-max across the cohort then weighted. Weights sum to
1.0; missing signals redistribute their weight to the present ones.

| Signal | Source metric | Basis | Weight | "So what" |
|---|---|---|---|---|
| `xhs_follower_growth` | `xhs_followers` | % change | 0.20 | Audience is growing on the dominant discovery platform. |
| `douyin_follower_growth` | `douyin_followers` | % change | 0.15 | Audience growing on the video/livestream platform. |
| `content_velocity` | `xhs_notes` | absolute change | 0.15 | They're publishing more — a precursor to reach gains. |
| `engagement_trend` | `xhs_likes` | % change | 0.20 | Their content is landing harder, not just more of it. |
| `new_products` | `shop_product_count` | absolute change | 0.15 | They're expanding the catalog — supply-side aggression. |
| `livestream_activity` | `douyin_likes` (+ live-status boost) | % change + boost | 0.15 | Video-channel engagement is accelerating. 🟡 |

**🟡 `livestream_activity` caveat.** The name implies livestream tracking, but
the signal is mostly Douyin-likes growth with a flat `+20` nudge when
`live_status` flips. It conflates two things and over-promises. **Kept** because
both inputs are growth-relevant and renaming churns the LLM prompt + DB keys for
marginal gain. **Decide in next sync:** rename to `douyin_momentum` for honesty,
or split the live-status boost into its own GTM flag.

---

## 2. Threat Index

Five signals, fixed weights (sum to 1.0), scored absolute against OMI's baseline
(`OMI_BASELINE` in `scoring.py`).

| Signal | Basis | Weight | "So what" |
|---|---|---|---|
| `price_overlap` | Products in OMI's ¥200–600 band | 0.25 | Direct head-to-head on price. 🟡 |
| `closing_gap` | Growth rate vs OMI's assumed ~2% | 0.25 | They're catching up to us. |
| `channel_expansion` | New Douyin presence / first livestream | 0.20 | They're entering a channel where we compete. |
| `kol_investment` | KOL-collab / mentions growth | 0.15 | They're buying awareness aggressively. |
| `engagement_momentum` | Engagement growth (`avg_engagement` / `xhs_likes`) | 0.15 | Their audience is heating up. |

### ♻️ Reframe: `sentiment_momentum` → `engagement_momentum`

**The problem:** the signal was named `sentiment_momentum`, which tells a beta
user we read *sentiment* (positive/negative tone of comments). **We don't** —
there is no NLP or sentiment analysis anywhere in this pipeline. The signal is
purely the growth rate of engagement (`avg_engagement`, falling back to
`xhs_likes`). The old label promised an analysis we never perform, which is
exactly the kind of confusing-without-decision-value signal this audit targets.

**The fix:** renamed to `engagement_momentum` in `scoring.py`
(`_THREAT_WEIGHTS` key, `threat_breakdown` key, internal vars) and the detail
string changed from "Engagement trend positive/negative" to "Engagement
rising/falling". Behavior and weight are unchanged — only the label is now
honest. Locked by `test_threat_breakdown_structure`.

**🟡 Known overlap (decide in next sync):** `engagement_momentum` (threat) and
`engagement_trend` (momentum) both derive from engagement % change, so
engagement growth is counted in *both* composite scores. Defensible (engagement
growth genuinely signals both momentum and threat), but worth a conscious
founder call.

**🟡 `price_overlap` caveat.** When SYCM/Douyin ranking data is missing, the
signal falls back to *estimating* overlap from follower count ("bigger brand →
probably overlaps"). That's a weak proxy. The `detail` string is honest about it
("Estimated from brand scale…"), so it's **kept**, but treat the estimated
variant as low-confidence.

---

## 3. GTM Signal Flags

Boolean event triggers — each fires on a specific threshold and shows up as a
flag on the brief. All six are kept: they map to a clear competitive event and a
clear OMI response, with no overlap between them.

| Flag | Trigger | Severity rule | "So what" |
|---|---|---|---|
| `PRODUCT_BLITZ` | `shop_product_count` +3 | high if ≥8 | They're flooding the catalog — watch pricing/positioning. |
| `AWARENESS_PLAY` | KOL or mentions up >50% | high if >100% | They're spending on awareness — expect reach gains. |
| `CHANNEL_EXPANSION` | First Douyin data, or first livestream | high | New front opens — decide whether to contest it. |
| `VIRAL_MOMENT` | Any social metric z-score > 3 | high | Something broke out — find out what and why. |
| `AGGRESSIVE_PRICING` | Product price drop >10% | high if >20% | Price war signal — protect margin / respond. |
| `RANKING_SURGE` | Up 20+ ranking positions | high if ≥40 | They're winning the shelf — investigate the driver. |

---

## Canonical set, in one line

**Momentum (6):** `xhs_follower_growth`, `douyin_follower_growth`,
`content_velocity`, `engagement_trend`, `new_products`, `livestream_activity`
🟡

**Threat (5):** `price_overlap` 🟡, `closing_gap`, `channel_expansion`,
`kol_investment`, `engagement_momentum`

**GTM flags (6):** `PRODUCT_BLITZ`, `AWARENESS_PLAY`, `CHANNEL_EXPANSION`,
`VIRAL_MOMENT`, `AGGRESSIVE_PRICING`, `RANKING_SURGE`

The momentum and threat sets are pinned by `test_canonical_momentum_signal_set`
and `test_threat_breakdown_structure` in `test_scoring.py` — changing the set
without updating those tests (and this doc) will fail CI.

## Open items for the next founder sync

1. **`livestream_activity`** — rename to `douyin_momentum`, or split off the
   live-status boost as a GTM flag?
2. **Engagement double-count** — `engagement_momentum` (threat) vs
   `engagement_trend` (momentum) both ride engagement growth. Intentional?
3. **`price_overlap` follower-scale fallback** — keep the low-confidence
   estimate, or suppress `price_overlap` entirely when ranking data is absent?
