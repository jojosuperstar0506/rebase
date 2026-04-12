"""
Brand Scoring Model for OMI Competitive Intelligence.

Produces three outputs per brand:
  1. Brand Momentum Score (0-100) — how aggressively a brand is growing
  2. Threat Index (0-100) — competitive threat to OMI specifically
  3. GTM Signal Flags — boolean triggers for go-to-market moves

Consumes deltas and anomalies from temporal.py; persists results via storage.py.

Usage:
    python -m services.competitor-intel.scoring
"""

import json
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from .storage import (
    get_all_brands,
    get_latest_deltas,
    get_metric_history,
    get_product_rankings,
    get_ranking_history,
    init_db,
    save_scores,
)
from .temporal import (
    compute_deltas,
    compute_rolling_stats,
    detect_anomalies,
)


# ─── OMI Baseline ────────────────────────────────────────────────────────────
# Approximate current OMI metrics. Update these as OMI's own data is tracked.

OMI_BASELINE: Dict[str, Any] = {
    "xhs_followers": 50000,
    "douyin_followers": 30000,
    "tmall_rank": 75,  # midpoint of 50-100 range
    "price_range_low": 200,
    "price_range_high": 600,
    "xhs_kol_collab_count": 5,
    "douyin_mentions_count": 3,
    "avg_engagement": 1500,
    "xhs_likes": 80000,
}


# ─── Momentum Score Weights ──────────────────────────────────────────────────

_MOMENTUM_SIGNALS: List[Tuple[str, str, float]] = [
    # (signal_name, metric_source, weight)
    ("xhs_follower_growth", "xhs_followers", 0.20),
    ("douyin_follower_growth", "douyin_followers", 0.15),
    ("content_velocity", "xhs_notes", 0.15),
    ("engagement_trend", "xhs_likes", 0.20),
    ("new_products", "shop_product_count", 0.15),
    ("livestream_activity", "douyin_likes", 0.15),
]


# ─── Threat Index Weights ────────────────────────────────────────────────────

_THREAT_WEIGHTS: Dict[str, float] = {
    "price_overlap": 0.25,
    "closing_gap": 0.25,
    "channel_expansion": 0.20,
    "kol_investment": 0.15,
    "sentiment_momentum": 0.15,
}


# ─── Internal Helpers ────────────────────────────────────────────────────────


def _try_float(value: Any) -> Optional[float]:
    """Attempt to convert a value to float, returning None on failure."""
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def _get_brand_delta_dict(
    brand_name: str, all_deltas: List[dict]
) -> Dict[str, dict]:
    """Build a {metric_name: delta_dict} for a specific brand from the flat deltas list."""
    result: Dict[str, dict] = {}
    for d in all_deltas:
        if d["brand_name"] == brand_name:
            result[d["metric_name"]] = d
    return result


def _normalize_min_max(
    values: Dict[str, float],
) -> Dict[str, float]:
    """
    Normalize a dict of {key: raw_value} to 0-100 using min-max scaling.

    If all values are the same, everyone gets 50.
    Negative raw values are floored at 0 before normalization.
    """
    if not values:
        return {}

    # Floor negatives at 0 for growth-oriented signals
    floored = {k: max(v, 0) for k, v in values.items()}

    vals = list(floored.values())
    min_val = min(vals)
    max_val = max(vals)

    if max_val == min_val:
        return {k: 50.0 for k in floored}

    return {
        k: ((v - min_val) / (max_val - min_val)) * 100
        for k, v in floored.items()
    }


def _extract_raw_signal(
    brand_name: str,
    metric_name: str,
    signal_name: str,
    brand_deltas: Dict[str, dict],
    db_path: Optional[str] = None,
) -> Optional[float]:
    """
    Extract a raw signal value for momentum scoring.

    For most signals, uses pct_change from deltas.
    For content_velocity and new_products, uses absolute_change.
    For livestream_activity, uses douyin_likes growth + live_status boost.
    """
    delta = brand_deltas.get(metric_name)

    if signal_name in ("content_velocity", "new_products"):
        # Use absolute change (number of new posts/products)
        if delta and delta.get("absolute_change") is not None:
            return delta["absolute_change"]
        return None
    elif signal_name == "livestream_activity":
        # Combine douyin_likes growth with live_status boost
        raw = 0.0
        if delta and delta.get("pct_change") is not None:
            raw = delta["pct_change"]
        # Check if live_status is active (boost)
        live_delta = brand_deltas.get("live_status")
        if live_delta:
            cv = str(live_delta.get("current_value", ""))
            pv = str(live_delta.get("previous_value", ""))
            if cv and cv != pv:
                # New live status detected — boost
                raw += 20.0
        return raw if raw != 0.0 else None
    else:
        # Use pct_change
        if delta and delta.get("pct_change") is not None:
            return delta["pct_change"]
        return None


# ─── Public API ──────────────────────────────────────────────────────────────


def compute_momentum_score(
    brand_name: str,
    all_brand_raws: Optional[Dict[str, Dict[str, Optional[float]]]] = None,
    db_path: Optional[str] = None,
) -> dict:
    """
    Compute a 0-100 Brand Momentum Score measuring growth aggressiveness.

    Scores are RELATIVE — the hottest brand across the cohort scores near 100.
    Normalization requires all brands' raw values, passed via all_brand_raws.

    Args:
        brand_name: Brand to score.
        all_brand_raws: Dict of {brand_name: {signal_name: raw_value}} for
                        all brands in the cohort. Required for normalization.
        db_path: Path to SQLite database. None for default.

    Returns:
        Dict with brand_name, momentum_score, score_breakdown, data_completeness.
    """
    if all_brand_raws is None:
        all_brand_raws = {}

    brand_raws = all_brand_raws.get(brand_name, {})

    # Compute normalized scores per signal across all brands
    score_breakdown: Dict[str, dict] = {}
    weighted_sum = 0.0
    total_weight = 0.0

    for signal_name, metric_name, weight in _MOMENTUM_SIGNALS:
        raw = brand_raws.get(signal_name)

        # Collect all brands' raw values for this signal for normalization
        signal_values = {}
        for bn, raws in all_brand_raws.items():
            v = raws.get(signal_name)
            if v is not None:
                signal_values[bn] = v

        # Normalize
        normalized_scores = _normalize_min_max(signal_values)
        normalized = normalized_scores.get(brand_name)

        if raw is not None and normalized is not None:
            score_breakdown[signal_name] = {
                "raw": round(raw, 1),
                "normalized": round(normalized, 1),
                "weight": weight,
            }
            weighted_sum += normalized * weight
            total_weight += weight
        else:
            score_breakdown[signal_name] = {
                "raw": None,
                "normalized": 0,
                "weight": weight,
            }

    # Redistribute weight from missing signals
    if total_weight > 0 and total_weight < 1.0:
        momentum_score = weighted_sum / total_weight
    elif total_weight > 0:
        momentum_score = weighted_sum
    else:
        momentum_score = 0.0

    # Count signals with data
    signals_with_data = sum(
        1 for s in score_breakdown.values() if s["raw"] is not None
    )
    data_completeness = signals_with_data / len(_MOMENTUM_SIGNALS) if _MOMENTUM_SIGNALS else 0

    return {
        "brand_name": brand_name,
        "momentum_score": round(max(0, min(100, momentum_score)), 1),
        "score_breakdown": score_breakdown,
        "data_completeness": round(data_completeness, 2),
    }


def compute_threat_index(
    brand_name: str,
    db_path: Optional[str] = None,
) -> dict:
    """
    Compute a 0-100 Threat Index measuring competitive threat to OMI.

    Args:
        brand_name: Brand to evaluate.
        db_path: Path to SQLite database. None for default.

    Returns:
        Dict with brand_name, threat_index, threat_breakdown.
    """
    conn = init_db(db_path)

    # Get OMI's own metrics if available, else use baseline
    omi_metrics = {}
    omi_exists = conn.execute(
        "SELECT name FROM brands WHERE name IN ('OMI', '欧米', '欧米箱包')"
    ).fetchone()
    if omi_exists:
        omi_name = omi_exists["name"]
        for metric_name in ("xhs_followers", "douyin_followers", "avg_engagement",
                            "xhs_likes", "xhs_kol_collab_count", "douyin_mentions_count"):
            history = get_metric_history(conn, omi_name, metric_name, days=90)
            if history:
                val = _try_float(history[-1][1])
                if val is not None:
                    omi_metrics[metric_name] = val
    # Fill from baseline
    for k, v in OMI_BASELINE.items():
        if k not in omi_metrics:
            omi_metrics[k] = v

    # ─── Signal 1: Price band overlap ───
    price_overlap_score = 0.0
    price_detail = "No ranking data"
    price_low = omi_metrics.get("price_range_low", 200)
    price_high = omi_metrics.get("price_range_high", 600)

    # Check SYCM rankings for this brand
    for source in ("sycm", "douyin_shop"):
        rankings = get_product_rankings(conn, source)
        overlap_count = 0
        for r in rankings:
            if r.get("brand", "").strip() == brand_name:
                price_str = str(r.get("price", "")).replace("¥", "").replace("￥", "").strip()
                # Handle price ranges like "299-599"
                price_str = price_str.split("-")[0].split("~")[0]
                price_val = _try_float(price_str)
                if price_val is not None and price_low <= price_val <= price_high:
                    overlap_count += 1
        if overlap_count > 0:
            price_overlap_score = min(100, overlap_count * 12.5)  # 8 products = 100
            price_detail = f"{overlap_count} products in ¥{price_low}-{price_high} range"
            break

    # If no ranking data, estimate from metric size (larger brands = more likely overlap)
    if price_overlap_score == 0 and price_detail == "No ranking data":
        # Use follower count as proxy for brand scale in OMI's segment
        history = get_metric_history(conn, brand_name, "xhs_followers", days=90)
        if history:
            followers = _try_float(history[-1][1]) or 0
            omi_followers = omi_metrics.get("xhs_followers", 50000)
            if omi_followers > 0:
                ratio = followers / omi_followers
                price_overlap_score = min(100, ratio * 30)
                price_detail = f"Estimated from brand scale ({followers:.0f} vs OMI {omi_followers:.0f})"

    # ─── Signal 2: Closing gap on OMI ───
    closing_gap_score = 0.0
    closing_gap_detail = "Insufficient data"

    deltas_list = get_latest_deltas(conn, brand_name)
    brand_deltas = _get_brand_delta_dict(brand_name, deltas_list)

    growth_metrics = ["xhs_followers", "douyin_followers", "xhs_likes", "avg_engagement"]
    gap_signals = []
    for metric in growth_metrics:
        delta = brand_deltas.get(metric)
        if delta and delta.get("pct_change") is not None:
            comp_growth = delta["pct_change"]
            # OMI baseline growth assumed ~2% (small brand, steady)
            omi_growth = 2.0
            if comp_growth > omi_growth:
                gap_signals.append((metric, comp_growth / max(omi_growth, 0.1)))

    if gap_signals:
        # Average the gap ratios, cap at 100
        avg_ratio = sum(r for _, r in gap_signals) / len(gap_signals)
        closing_gap_score = min(100, avg_ratio * 15)
        best_metric, best_ratio = max(gap_signals, key=lambda x: x[1])
        closing_gap_detail = f"Growing {best_ratio:.1f}x faster than OMI on {best_metric}"

    # ─── Signal 3: Channel expansion ───
    channel_expansion_score = 0.0
    channel_detail = "No new channels detected"

    # Check if Douyin data appeared recently (wasn't there before)
    douyin_history = get_metric_history(conn, brand_name, "douyin_followers", days=90)
    if douyin_history:
        all_vals = [_try_float(v) for _, v in douyin_history]
        non_none = [v for v in all_vals if v is not None and v > 0]
        if non_none and len(non_none) < len(all_vals):
            # Some data appeared where there was none
            channel_expansion_score = 80.0
            channel_detail = "New Douyin presence detected"
        elif len(non_none) == len(all_vals) and len(all_vals) <= 2:
            channel_expansion_score = 60.0
            channel_detail = "Recently appeared on Douyin"

    # Check live_status changes
    live_history = get_metric_history(conn, brand_name, "live_status", days=90)
    if len(live_history) >= 2:
        prev_status = str(live_history[-2][1]).lower()
        curr_status = str(live_history[-1][1]).lower()
        if prev_status in ("unknown", "not_live", "0", "") and curr_status not in ("unknown", "not_live", "0", ""):
            channel_expansion_score = 100.0
            channel_detail = "Launched Douyin livestream"

    # ─── Signal 4: KOL investment ───
    kol_investment_score = 0.0
    kol_detail = "No KOL data"

    kol_delta = brand_deltas.get("xhs_kol_collab_count")
    douyin_mentions_delta = brand_deltas.get("douyin_mentions_count")

    kol_growth_pct = None
    if kol_delta and kol_delta.get("pct_change") is not None:
        kol_growth_pct = kol_delta["pct_change"]
    elif douyin_mentions_delta and douyin_mentions_delta.get("pct_change") is not None:
        kol_growth_pct = douyin_mentions_delta["pct_change"]

    if kol_growth_pct is not None:
        kol_investment_score = min(100, max(0, kol_growth_pct * 2))
        kol_detail = f"KOL collabs {'up' if kol_growth_pct > 0 else 'down'} {abs(kol_growth_pct):.0f}%"

    # ─── Signal 5: Sentiment momentum ───
    sentiment_score = 0.0
    sentiment_detail = "No engagement trend data"

    engagement_delta = brand_deltas.get("avg_engagement")
    likes_delta = brand_deltas.get("xhs_likes")

    engagement_growth = None
    if engagement_delta and engagement_delta.get("pct_change") is not None:
        engagement_growth = engagement_delta["pct_change"]
    elif likes_delta and likes_delta.get("pct_change") is not None:
        engagement_growth = likes_delta["pct_change"]

    if engagement_growth is not None:
        sentiment_score = min(100, max(0, 50 + engagement_growth * 2))
        direction = "positive" if engagement_growth > 0 else "negative"
        sentiment_detail = f"Engagement trend {direction} ({engagement_growth:+.1f}%)"

    conn.close()

    # ─── Compute weighted total ───
    threat_breakdown = {
        "price_overlap": {"score": round(price_overlap_score, 1), "detail": price_detail},
        "closing_gap": {"score": round(closing_gap_score, 1), "detail": closing_gap_detail},
        "channel_expansion": {"score": round(channel_expansion_score, 1), "detail": channel_detail},
        "kol_investment": {"score": round(kol_investment_score, 1), "detail": kol_detail},
        "sentiment_momentum": {"score": round(sentiment_score, 1), "detail": sentiment_detail},
    }

    threat_index = sum(
        threat_breakdown[signal]["score"] * weight
        for signal, weight in _THREAT_WEIGHTS.items()
    )

    return {
        "brand_name": brand_name,
        "threat_index": round(max(0, min(100, threat_index)), 1),
        "threat_breakdown": threat_breakdown,
    }


def detect_gtm_signals(
    brand_name: str,
    db_path: Optional[str] = None,
) -> List[dict]:
    """
    Detect active GTM (go-to-market) signal flags for a brand.

    Checks for: AGGRESSIVE_PRICING, CHANNEL_EXPANSION, PRODUCT_BLITZ,
    AWARENESS_PLAY, VIRAL_MOMENT, RANKING_SURGE.

    Args:
        brand_name: Brand to check.
        db_path: Path to SQLite database. None for default.

    Returns:
        List of active signal dicts with signal, detail, severity.
        Empty list if no signals are active.
    """
    signals: List[dict] = []
    conn = init_db(db_path)

    deltas_list = get_latest_deltas(conn, brand_name)
    brand_deltas = _get_brand_delta_dict(brand_name, deltas_list)

    # ─── PRODUCT_BLITZ: shop_product_count increased by 3+ ───
    product_delta = brand_deltas.get("shop_product_count")
    if product_delta and product_delta.get("absolute_change") is not None:
        abs_change = product_delta["absolute_change"]
        if abs_change >= 3:
            signals.append({
                "signal": "PRODUCT_BLITZ",
                "detail": f"{int(abs_change)} new SKUs added",
                "severity": "high" if abs_change >= 8 else "medium",
            })

    # ─── AWARENESS_PLAY: KOL/mentions growth > 50% ───
    for metric in ("xhs_kol_collab_count", "douyin_mentions_count"):
        delta = brand_deltas.get(metric)
        if delta and delta.get("pct_change") is not None:
            if delta["pct_change"] > 50:
                signals.append({
                    "signal": "AWARENESS_PLAY",
                    "detail": f"{metric} up {delta['pct_change']:.0f}%",
                    "severity": "high" if delta["pct_change"] > 100 else "medium",
                })
                break  # Only flag once

    # ─── CHANNEL_EXPANSION: new platform data ───
    douyin_history = get_metric_history(conn, brand_name, "douyin_followers", days=90)
    if douyin_history:
        all_vals = [_try_float(v) for _, v in douyin_history]
        non_none = [v for v in all_vals if v is not None and v > 0]
        if non_none and len(non_none) < len(all_vals):
            signals.append({
                "signal": "CHANNEL_EXPANSION",
                "detail": "First Douyin data detected",
                "severity": "high",
            })

    # Check live_status change
    live_history = get_metric_history(conn, brand_name, "live_status", days=90)
    if len(live_history) >= 2:
        prev = str(live_history[-2][1]).lower()
        curr = str(live_history[-1][1]).lower()
        if prev in ("unknown", "not_live", "0", "") and curr not in ("unknown", "not_live", "0", ""):
            # Don't duplicate if already flagged from douyin_followers
            existing = [s for s in signals if s["signal"] == "CHANNEL_EXPANSION"]
            if not existing:
                signals.append({
                    "signal": "CHANNEL_EXPANSION",
                    "detail": "First Douyin livestream detected",
                    "severity": "high",
                })

    # ─── VIRAL_MOMENT: any social metric z-score > 3 ───
    anomalies = detect_anomalies(threshold_sigma=3.0, db_path=db_path)
    brand_anomalies = [a for a in anomalies if a["brand_name"] == brand_name]
    if brand_anomalies:
        worst = max(brand_anomalies, key=lambda a: abs(a["z_score"]))
        signals.append({
            "signal": "VIRAL_MOMENT",
            "detail": f"{worst['metric_name']} z={worst['z_score']:.1f} ({worst['direction']})",
            "severity": "high",
        })

    # ─── AGGRESSIVE_PRICING: product price drop > 10% ───
    for source in ("sycm", "douyin_shop"):
        ranking_hist = get_ranking_history(conn, brand_name, source, days=30)
        if len(ranking_hist) >= 2:
            # Group by product_name, compare earliest vs latest
            products: Dict[str, list] = {}
            for date, rank, product_name, metric_val in ranking_hist:
                products.setdefault(product_name, []).append((date, rank, metric_val))

            for prod_name, entries in products.items():
                if len(entries) >= 2:
                    entries.sort(key=lambda x: x[0])
                    first_val = entries[0][2]
                    last_val = entries[-1][2]
                    if first_val and last_val and first_val > 0:
                        pct = ((last_val - first_val) / first_val) * 100
                        if pct < -10:
                            signals.append({
                                "signal": "AGGRESSIVE_PRICING",
                                "detail": f"{prod_name} dropped {abs(pct):.0f}%",
                                "severity": "high" if pct < -20 else "medium",
                            })
                            break  # One is enough
        if any(s["signal"] == "AGGRESSIVE_PRICING" for s in signals):
            break

    # ─── RANKING_SURGE: moved up 20+ positions in rankings ───
    for source in ("sycm", "douyin_shop"):
        ranking_hist = get_ranking_history(conn, brand_name, source, days=30)
        if len(ranking_hist) >= 2:
            # Group by date, find best rank per date
            date_ranks: Dict[str, int] = {}
            for date, rank, _, _ in ranking_hist:
                if date not in date_ranks or rank < date_ranks[date]:
                    date_ranks[date] = rank

            dates = sorted(date_ranks.keys())
            if len(dates) >= 2:
                old_rank = date_ranks[dates[0]]
                new_rank = date_ranks[dates[-1]]
                improvement = old_rank - new_rank
                if improvement >= 20:
                    signals.append({
                        "signal": "RANKING_SURGE",
                        "detail": f"Moved up {improvement} positions in {source} (#{old_rank} → #{new_rank})",
                        "severity": "high" if improvement >= 40 else "medium",
                    })
                    break

    conn.close()
    return signals


def score_all_brands(
    db_path: Optional[str] = None,
) -> dict:
    """
    Master function that scores all brands.

    1. Ensures deltas are computed (calls compute_deltas if needed)
    2. Computes raw signal values for all brands
    3. Normalizes momentum scores across the cohort
    4. Computes threat indices
    5. Detects GTM signals
    6. Saves all scores to SQLite

    Args:
        db_path: Path to SQLite database. None for default.

    Returns:
        Dict with scoring_date, brands scored, and full results.
    """
    conn = init_db(db_path)
    brands = get_all_brands(conn)

    # Step 1: Ensure deltas are computed
    compute_deltas(db_path=db_path)

    # Step 2: Gather raw signal values for all brands (needed for normalization)
    all_brand_raws: Dict[str, Dict[str, Optional[float]]] = {}
    all_deltas_list = get_latest_deltas(conn)

    for brand in brands:
        brand_name = brand["name"]
        brand_deltas = _get_brand_delta_dict(brand_name, all_deltas_list)
        raws: Dict[str, Optional[float]] = {}

        for signal_name, metric_name, weight in _MOMENTUM_SIGNALS:
            raws[signal_name] = _extract_raw_signal(
                brand_name, metric_name, signal_name, brand_deltas, db_path
            )

        all_brand_raws[brand_name] = raws

    # Step 3-5: Compute all scores
    today = datetime.now().strftime("%Y-%m-%d")
    results: List[dict] = []

    for brand in brands:
        brand_name = brand["name"]

        # Momentum score (uses all brands' raws for normalization)
        momentum = compute_momentum_score(
            brand_name, all_brand_raws=all_brand_raws, db_path=db_path
        )

        # Threat index
        threat = compute_threat_index(brand_name, db_path=db_path)

        # GTM signals
        gtm = detect_gtm_signals(brand_name, db_path=db_path)

        # Save to DB
        save_scores(
            conn,
            brand_name,
            today,
            momentum["momentum_score"],
            threat["threat_index"],
            gtm,
            momentum["score_breakdown"],
            threat["threat_breakdown"],
            momentum["data_completeness"],
        )

        results.append({
            "brand_name": brand_name,
            "momentum_score": momentum["momentum_score"],
            "threat_index": threat["threat_index"],
            "gtm_signals": gtm,
            "score_breakdown": momentum["score_breakdown"],
            "threat_breakdown": threat["threat_breakdown"],
            "data_completeness": momentum["data_completeness"],
        })

    conn.close()

    # Sort by momentum score descending
    results.sort(key=lambda x: x["momentum_score"], reverse=True)

    return {
        "scoring_date": today,
        "brands_scored": len(results),
        "results": results,
    }


# ─── CLI ─────────────────────────────────────────────────────────────────────


def main():
    """CLI entry point — prints formatted scoring results."""
    today = datetime.now().strftime("%Y-%m-%d")
    print(f"Brand Scoring \u2014 {today}")
    print("=" * 28)
    print()

    conn = init_db()
    brands = get_all_brands(conn)
    conn.close()

    # Count brands with data
    conn2 = init_db()
    brands_with_data = set()
    for brand in brands:
        deltas = get_latest_deltas(conn2, brand["name"])
        if deltas:
            brands_with_data.add(brand["name"])
    conn2.close()

    print(f"Computing momentum scores for {len(brands_with_data)} brands...")
    print("Computing threat indices...")
    print("Detecting GTM signals...")
    print()

    result = score_all_brands()
    all_results = result["results"]

    # Get previous scores for change tracking
    conn3 = init_db()

    # ─── Momentum Leaderboard ───
    print("\U0001f4c8 Brand Momentum Leaderboard")
    print("\u2500" * 57)
    print(f" {'#':>2}  {'Brand':<18} {'Score':>5}   {'Change':>6}   Signals")

    scored_brands = [r for r in all_results if r["data_completeness"] > 0]
    for i, r in enumerate(scored_brands, 1):
        brand_name = r["brand_name"]
        score = r["momentum_score"]

        # Calculate change from previous scoring
        change_str = "\u27a1\ufe0f  0"
        history = []
        try:
            from .storage import get_score_history
            history = get_score_history(conn3, brand_name, days=30)
        except Exception:
            pass
        if len(history) >= 2:
            prev_score = history[-2][1]
            if prev_score is not None:
                change = score - prev_score
                if change > 0:
                    change_str = f"\U0001f4c8 +{change:.0f}"
                elif change < 0:
                    change_str = f"\U0001f4c9 {change:.0f}"

        signal_str = ""
        if r["gtm_signals"]:
            signal_str = " ".join(f"\u26a1 {s['signal']}" for s in r["gtm_signals"])

        print(f" {i:>2}  {brand_name:<18} {score:>5.0f}   {change_str:>8}   {signal_str}")

    print()

    # ─── Threat Index ───
    threat_sorted = sorted(all_results, key=lambda x: x["threat_index"], reverse=True)
    threat_with_data = [r for r in threat_sorted if r["data_completeness"] > 0][:5]

    print("\U0001f3af Threat to OMI \u2014 Top 5")
    print("\u2500" * 57)
    print(f" {'#':>2}  {'Brand':<18} {'Threat':>6}  Key Factor")

    for i, r in enumerate(threat_with_data, 1):
        brand_name = r["brand_name"]
        threat = r["threat_index"]

        # Find the highest-scoring threat factor
        breakdown = r.get("threat_breakdown", {})
        if breakdown:
            top_factor = max(breakdown.items(), key=lambda x: x[1].get("score", 0))
            key_factor = top_factor[1].get("detail", "")
        else:
            key_factor = ""

        print(f" {i:>2}  {brand_name:<18} {threat:>6.0f}  {key_factor}")

    print()

    # ─── GTM Signals ───
    active_signals = [(r["brand_name"], s) for r in all_results for s in r["gtm_signals"]]
    if active_signals:
        print("\u26a1 Active GTM Signals")
        print("\u2500" * 57)
        for brand_name, signal in active_signals:
            print(f"  {brand_name}:  {signal['signal']} \u2014 {signal['detail']}")
    else:
        print("\u26a1 No active GTM signals detected")

    conn3.close()

    print()
    print("Scores saved to database. Run `python -m services.competitor-intel.temporal` first if data seems stale.")


if __name__ == "__main__":
    main()
