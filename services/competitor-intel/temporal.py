"""
Temporal analysis engine for OMI Competitive Intelligence.

Computes changes between data snapshots, identifies trends, and flags anomalies.
Sits between raw data (storage) and the scoring engine (TASK-05).

Answers: "What changed since last time, and is any of it unusual?"

Usage:
    python -m services.competitor-intel.temporal
"""

import statistics
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from .storage import (
    DEFAULT_DB_PATH,
    METRIC_EXTRACTION_MAP,
    get_all_brands,
    get_metric_history,
    init_db,
    save_deltas,
)


# Metrics that are numeric and can be compared meaningfully
_NUMERIC_METRICS = [
    name for name, _, _ in METRIC_EXTRACTION_MAP
    if name not in ("live_status", "category_share")
]


def _try_float(value: Any) -> Optional[float]:
    """Attempt to convert a value to float, returning None on failure."""
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def compute_deltas(
    db_path: Optional[str] = None,
) -> Dict[str, Dict[str, dict]]:
    """
    Compute metric deltas between the two most recent snapshots for each brand.

    For each brand+metric, computes absolute_change and pct_change between the
    latest and previous data points. Results are written to the deltas table.

    Args:
        db_path: Path to SQLite database. None for default.

    Returns:
        Dict: {brand_name: {metric_name: {previous, current, abs_change, pct_change}}}
        Only includes brands that have 2+ data points for at least one metric.
    """
    conn = init_db(db_path)
    brands = get_all_brands(conn)
    all_deltas: Dict[str, Dict[str, dict]] = {}

    for brand in brands:
        brand_name = brand["name"]
        brand_deltas: Dict[str, dict] = {}

        for metric_name in _NUMERIC_METRICS:
            # Get the two most recent values (within 90 days)
            history = get_metric_history(conn, brand_name, metric_name, days=90)
            if len(history) < 2:
                continue

            prev_date, prev_val_str = history[-2]
            curr_date, curr_val_str = history[-1]

            prev_val = _try_float(prev_val_str)
            curr_val = _try_float(curr_val_str)

            if prev_val is None or curr_val is None:
                continue

            abs_change = curr_val - prev_val

            if prev_val != 0:
                pct_change = ((curr_val - prev_val) / prev_val) * 100
            else:
                pct_change = None  # New metric or was zero

            brand_deltas[metric_name] = {
                "previous_value": prev_val,
                "current_value": curr_val,
                "absolute_change": abs_change,
                "pct_change": pct_change,
            }

        if brand_deltas:
            # Determine the most recent date across all metrics
            latest_date = datetime.now().strftime("%Y-%m-%d")
            for metric_name in _NUMERIC_METRICS:
                h = get_metric_history(conn, brand_name, metric_name, days=90)
                if h:
                    latest_date = max(latest_date, h[-1][0])

            save_deltas(conn, brand_name, latest_date, brand_deltas)
            all_deltas[brand_name] = brand_deltas

    conn.close()
    return all_deltas


def compute_rolling_stats(
    brand_name: str,
    metric_name: str,
    window_weeks: int = 4,
    db_path: Optional[str] = None,
) -> Optional[dict]:
    """
    Compute rolling statistics for a brand's metric over a time window.

    Args:
        brand_name: Brand to analyze.
        metric_name: Metric to compute stats for.
        window_weeks: Number of weeks of history to consider (default 4).
        db_path: Path to SQLite database. None for default.

    Returns:
        Dict with rolling_mean, rolling_std, current_value, z_score, data_points.
        Returns None if insufficient data (< 2 data points).
    """
    conn = init_db(db_path)
    history = get_metric_history(
        conn, brand_name, metric_name, days=window_weeks * 7
    )
    conn.close()

    if not history:
        return None

    values = []
    for _, val_str in history:
        v = _try_float(val_str)
        if v is not None:
            values.append(v)

    if not values:
        return None

    current_value = values[-1]

    if len(values) < 2:
        return {
            "rolling_mean": current_value,
            "rolling_std": None,
            "current_value": current_value,
            "z_score": None,
            "data_points": 1,
        }

    rolling_mean = statistics.mean(values)
    rolling_std = statistics.stdev(values)

    if rolling_std == 0:
        z_score = 0.0
    else:
        z_score = (current_value - rolling_mean) / rolling_std

    return {
        "rolling_mean": rolling_mean,
        "rolling_std": rolling_std,
        "current_value": current_value,
        "z_score": z_score,
        "data_points": len(values),
    }


def detect_anomalies(
    threshold_sigma: float = 2.0,
    db_path: Optional[str] = None,
) -> List[dict]:
    """
    Detect anomalous metric changes across all brands.

    For each brand and numeric metric, computes rolling stats and flags
    any metric where abs(z_score) exceeds the threshold.

    Args:
        threshold_sigma: Z-score threshold for flagging anomalies (default 2.0).
        db_path: Path to SQLite database. None for default.

    Returns:
        List of anomaly dicts with brand_name, metric_name, z_score, severity, etc.
    """
    conn = init_db(db_path)
    brands = get_all_brands(conn)
    conn.close()

    anomalies: List[dict] = []

    for brand in brands:
        brand_name = brand["name"]

        for metric_name in _NUMERIC_METRICS:
            stats = compute_rolling_stats(
                brand_name, metric_name, window_weeks=4, db_path=db_path
            )
            if stats is None or stats["z_score"] is None:
                continue
            if stats["data_points"] < 2:
                continue

            z = stats["z_score"]
            if abs(z) > threshold_sigma:
                # Compute pct_change from rolling mean
                if stats["rolling_mean"] != 0:
                    pct_change = (
                        (stats["current_value"] - stats["rolling_mean"])
                        / stats["rolling_mean"]
                    ) * 100
                else:
                    pct_change = None

                severity = "high" if abs(z) > 3.0 else "medium"

                anomalies.append({
                    "brand_name": brand_name,
                    "metric_name": metric_name,
                    "current_value": stats["current_value"],
                    "rolling_mean": stats["rolling_mean"],
                    "rolling_std": stats["rolling_std"],
                    "z_score": round(z, 1),
                    "pct_change": round(pct_change, 1) if pct_change is not None else None,
                    "direction": "up" if z > 0 else "down",
                    "severity": severity,
                })

    return anomalies


def get_brand_trend_summary(
    brand_name: str,
    db_path: Optional[str] = None,
) -> dict:
    """
    Generate a human-readable trend summary for a brand.

    Categorizes each metric as trending up, down, or stable based on
    the most recent delta. Includes any anomalies.

    Args:
        brand_name: Brand to summarize.
        db_path: Path to SQLite database. None for default.

    Returns:
        Dict with brand_name, data_points, period, trending_up, trending_down,
        stable, and anomalies.
    """
    conn = init_db(db_path)

    # Gather data points count and date range
    rows = conn.execute(
        "SELECT DISTINCT date FROM metrics WHERE brand_name = ? ORDER BY date",
        (brand_name,),
    ).fetchall()

    dates = [r["date"] for r in rows]
    data_points = len(dates)
    period = f"{dates[0]} to {dates[-1]}" if len(dates) >= 2 else (dates[0] if dates else "no data")

    conn.close()

    trending_up: List[str] = []
    trending_down: List[str] = []
    stable: List[str] = []

    for metric_name in _NUMERIC_METRICS:
        stats = compute_rolling_stats(
            brand_name, metric_name, window_weeks=4, db_path=db_path
        )
        if stats is None or stats["data_points"] < 2:
            continue

        z = stats["z_score"]
        if z is None:
            stable.append(metric_name)
        elif z > 0.5:
            trending_up.append(metric_name)
        elif z < -0.5:
            trending_down.append(metric_name)
        else:
            stable.append(metric_name)

    # Get anomalies for this brand
    all_anomalies = detect_anomalies(db_path=db_path)
    brand_anomalies = [a for a in all_anomalies if a["brand_name"] == brand_name]

    return {
        "brand_name": brand_name,
        "data_points": data_points,
        "period": period,
        "trending_up": trending_up,
        "trending_down": trending_down,
        "stable": stable,
        "anomalies": brand_anomalies,
    }


def run_full_analysis(
    db_path: Optional[str] = None,
) -> dict:
    """
    Run the complete temporal analysis pipeline.

    1. Computes deltas for all brands
    2. Detects anomalies across all brands
    3. Returns a combined summary

    This is the main entry point for the scoring engine (TASK-05) and
    orchestrator (TASK-11).

    Args:
        db_path: Path to SQLite database. None for default.

    Returns:
        Dict with deltas, anomalies, and summary statistics.
    """
    deltas = compute_deltas(db_path=db_path)
    anomalies = detect_anomalies(db_path=db_path)

    return {
        "analysis_date": datetime.now().strftime("%Y-%m-%d"),
        "brands_with_deltas": len(deltas),
        "total_anomalies": len(anomalies),
        "deltas": deltas,
        "anomalies": anomalies,
    }


def main():
    """CLI entry point — prints formatted temporal analysis results."""
    print(f"Temporal Analysis — {datetime.now().strftime('%Y-%m-%d')}")
    print("=" * 40)
    print()

    result = run_full_analysis()

    # Deltas summary
    conn = init_db()
    all_brands = get_all_brands(conn)
    conn.close()

    brands_with_data = result["brands_with_deltas"]
    brands_skipped = len(all_brands) - brands_with_data

    print(f"Computing deltas for {len(all_brands)} brands...")
    print(f"✓ {brands_with_data} brands with sufficient data (2+ snapshots)")
    print(f"✗ {brands_skipped} brands with insufficient data (skipped)")
    print()

    # Anomalies
    anomalies = result["anomalies"]
    print(f"Anomaly Detection (threshold: 2.0σ)")
    print("─" * 40)

    if anomalies:
        # Group by brand
        anomaly_brands = set()
        for a in anomalies:
            anomaly_brands.add(a["brand_name"])
            sev = a["severity"].upper()
            direction = "+" if a["direction"] == "up" else "-"
            pct = f"{direction}{abs(a['pct_change']):.1f}%" if a["pct_change"] is not None else "N/A"
            mean_pct = ""
            if a["rolling_mean"] and a["rolling_std"]:
                mean_pct = f" (4wk avg: {a['rolling_mean']:.0f}, z={a['z_score']:.1f})"
            print(f"⚠️  {a['brand_name']}: {a['metric_name']} {pct}{mean_pct} — {sev}")

        # Print normal brands
        for brand in all_brands:
            name = brand["name"]
            if name in result["deltas"] and name not in anomaly_brands:
                print(f"✓  {name}: all metrics within normal range")
    else:
        for brand_name in result["deltas"]:
            print(f"✓  {brand_name}: all metrics within normal range")

    if not result["deltas"]:
        print("  No brands with sufficient data for analysis.")

    print()
    print(f"Summary: {len(anomalies)} anomalies detected across {brands_with_data} brands")


if __name__ == "__main__":
    main()
