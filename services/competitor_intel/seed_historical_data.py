"""
Generate 4 weeks of fake but realistic metric snapshots for testing temporal analysis.

Creates data for 5 brands with distinct patterns:
  - Songmont: steady growth (3-5% weekly across most metrics)
  - 裘真: sudden spike in week 4 (anomaly candidate)
  - 小CK: stable, flat metrics
  - CASSILE: declining engagement
  - La Festin: new to Douyin (no Douyin data weeks 1-2, appears week 3)

Usage:
    python -m services.competitor-intel.seed_historical_data
"""

import os
import random
import sqlite3
import tempfile
from datetime import datetime, timedelta
from typing import Optional

from .storage import init_db


# Base metrics for each brand (week 1 values)
_BRAND_PROFILES = {
    "Songmont": {
        "xhs_followers": 150000,
        "xhs_notes": 8500,
        "xhs_likes": 420000,
        "douyin_followers": 95000,
        "douyin_videos": 320,
        "douyin_likes": 180000,
        "content_posting_frequency": 45,
        "avg_engagement": 3200,
        "xhs_kol_collab_count": 28,
        "douyin_mentions_count": 15,
        "shop_product_count": 86,
        "tmall_rank": 12,
    },
    "裘真": {
        "xhs_followers": 42000,
        "xhs_notes": 3200,
        "xhs_likes": 95000,
        "douyin_followers": 28000,
        "douyin_videos": 150,
        "douyin_likes": 45000,
        "content_posting_frequency": 20,
        "avg_engagement": 1800,
        "xhs_kol_collab_count": 8,
        "douyin_mentions_count": 5,
        "shop_product_count": 45,
        "tmall_rank": 38,
    },
    "小CK": {
        "xhs_followers": 280000,
        "xhs_notes": 15000,
        "xhs_likes": 680000,
        "douyin_followers": 520000,
        "douyin_videos": 890,
        "douyin_likes": 1200000,
        "content_posting_frequency": 60,
        "avg_engagement": 5500,
        "xhs_kol_collab_count": 45,
        "douyin_mentions_count": 32,
        "shop_product_count": 120,
        "tmall_rank": 5,
    },
    "CASSILE": {
        "xhs_followers": 35000,
        "xhs_notes": 2800,
        "xhs_likes": 78000,
        "douyin_followers": 18000,
        "douyin_videos": 95,
        "douyin_likes": 32000,
        "content_posting_frequency": 25,
        "avg_engagement": 2400,
        "xhs_kol_collab_count": 12,
        "douyin_mentions_count": 6,
        "shop_product_count": 52,
        "tmall_rank": 42,
    },
    "La Festin": {
        "xhs_followers": 88000,
        "xhs_notes": 5200,
        "xhs_likes": 210000,
        # No Douyin data in weeks 1-2 — appears week 3
        "content_posting_frequency": 35,
        "avg_engagement": 2800,
        "xhs_kol_collab_count": 18,
        "shop_product_count": 68,
        "tmall_rank": 22,
    },
}

# Douyin metrics that La Festin gets starting week 3
_LA_FESTIN_DOUYIN_BASE = {
    "douyin_followers": 5000,
    "douyin_videos": 12,
    "douyin_likes": 8000,
    "douyin_mentions_count": 2,
}


def _jitter(value: float, pct: float = 0.01) -> float:
    """Add small random noise to a value."""
    return value * (1 + random.uniform(-pct, pct))


def _generate_weekly_values(
    brand: str, base_metrics: dict, week: int
) -> dict:
    """
    Generate metric values for a given brand and week number (1-4).

    Each brand has a different growth/change pattern.
    """
    values = {}

    if brand == "Songmont":
        # Steady 3-5% weekly growth
        for metric, base in base_metrics.items():
            if metric == "tmall_rank":
                # Rank improves (lower number) slightly
                values[metric] = max(1, int(base - (week - 1) * 0.5 + random.uniform(-0.5, 0.5)))
            else:
                growth_rate = 1 + (0.03 + random.uniform(0, 0.02)) * (week - 1)
                values[metric] = _jitter(base * growth_rate)

    elif brand == "裘真":
        # Normal weeks 1-3, sudden spike in week 4
        for metric, base in base_metrics.items():
            if week <= 3:
                # Small steady growth (1-2% weekly)
                growth_rate = 1 + 0.015 * (week - 1)
                values[metric] = _jitter(base * growth_rate)
            else:
                # Week 4: MASSIVE SPIKE — 400-500% jump on social metrics
                # Needs to be extreme to exceed 2σ with 8 data points
                # (2 of 8 are outliers, so spike must overwhelm the std)
                if metric in ("xhs_followers", "douyin_followers", "xhs_likes",
                              "douyin_likes", "avg_engagement"):
                    spike = 1 + 0.015 * 2 + random.uniform(4.00, 5.00)
                    values[metric] = _jitter(base * spike)
                elif metric == "shop_product_count":
                    # Big product expansion
                    values[metric] = _jitter(base * (1 + 0.015 * 2 + 2.50))
                elif metric == "tmall_rank":
                    values[metric] = max(1, int(base - 8))  # Jump up in rank
                else:
                    growth_rate = 1 + 0.015 * 3
                    values[metric] = _jitter(base * growth_rate)

    elif brand == "小CK":
        # Stable, flat — within 1% week to week
        for metric, base in base_metrics.items():
            if metric == "tmall_rank":
                values[metric] = base + random.choice([-1, 0, 0, 0, 1])
            else:
                values[metric] = _jitter(base, pct=0.008)

    elif brand == "CASSILE":
        # Declining engagement metrics, others stable
        declining = {"avg_engagement", "xhs_likes", "douyin_likes",
                     "content_posting_frequency", "xhs_kol_collab_count"}
        for metric, base in base_metrics.items():
            if metric in declining:
                # 8-12% weekly decline (steep enough to detect with 4 data points)
                decline_rate = 1 - (0.08 + random.uniform(0, 0.04)) * (week - 1)
                values[metric] = _jitter(base * max(decline_rate, 0.3))
            elif metric == "tmall_rank":
                # Rank worsens (higher number)
                values[metric] = int(base + (week - 1) * 2 + random.uniform(-0.5, 0.5))
            else:
                values[metric] = _jitter(base, pct=0.01)

    elif brand == "La Festin":
        # XHS metrics stable, Douyin appears in week 3
        for metric, base in base_metrics.items():
            if metric == "tmall_rank":
                values[metric] = base + random.choice([-1, 0, 0, 1])
            else:
                values[metric] = _jitter(base, pct=0.01)

        # Add Douyin metrics starting week 3
        if week >= 3:
            for metric, base in _LA_FESTIN_DOUYIN_BASE.items():
                if week == 3:
                    values[metric] = _jitter(base)
                else:
                    # Week 4: growth from week 3 base
                    values[metric] = _jitter(base * 1.15)

    return values


def seed_historical_data(db_path: Optional[str] = None) -> dict:
    """
    Generate and insert 4 weeks of historical metric data for 5 test brands.

    Generates 8 data points per brand (every ~3.5 days over 4 weeks) to provide
    enough statistical power for z-score anomaly detection.

    Args:
        db_path: Path to SQLite database. None for default.

    Returns:
        Dict with counts of brands and data points inserted.
    """
    random.seed(42)  # Reproducible data

    conn = init_db(db_path)

    # Generate 8 data points over 4 weeks (every ~3.5 days)
    # This gives enough normal points so a spike produces z > 2σ
    num_points = 8
    base_date = datetime.now() - timedelta(days=28)
    dates = []
    for p in range(num_points):
        point_date = base_date + timedelta(days=p * 3.5)
        date_str = point_date.strftime("%Y-%m-%d")
        dates.append(date_str)

    # Create scrape_runs for the 4 "weeks"
    for w in range(4):
        week_date = base_date + timedelta(weeks=w)
        conn.execute(
            """INSERT INTO scrape_runs (timestamp, status, brands_attempted, brands_succeeded)
               VALUES (?, 'completed', 5, 5)""",
            (week_date.strftime("%Y-%m-%d"),),
        )
    conn.commit()

    total_points = 0

    for brand_name, base_metrics in _BRAND_PROFILES.items():
        # Ensure brand exists (it should from init_db sync, but some test brands
        # may not be in config.py — insert if missing)
        existing = conn.execute(
            "SELECT name FROM brands WHERE name = ?", (brand_name,)
        ).fetchone()
        if not existing:
            conn.execute(
                """INSERT OR IGNORE INTO brands
                   (name, name_en, "group", group_name, badge)
                   VALUES (?, ?, 'test', 'Test Brands', '')""",
                (brand_name, brand_name),
            )
            conn.commit()

        for point_idx, date_str in enumerate(dates):
            # Map 8 points to weeks: points 0-1 = week 1, 2-3 = week 2,
            # 4-5 = week 3, 6 = week 3 (pre-spike), 7 = week 4 (spike)
            # Only the LAST point gets the spike, so z-score math works
            if point_idx <= 5:
                week_num = (point_idx // 2) + 1
            elif point_idx == 6:
                week_num = 3  # One more normal point before spike
            else:
                week_num = 4  # Only this point gets the spike
            values = _generate_weekly_values(brand_name, base_metrics, week_num)

            # Insert each metric
            for metric_name, value in values.items():
                # Determine platform
                platform = "xhs"
                if "douyin" in metric_name:
                    platform = "douyin"
                elif metric_name in ("tmall_rank", "category_share"):
                    platform = "sycm"

                stored_value = str(int(round(value)))

                conn.execute(
                    """INSERT INTO metrics
                       (brand_name, date, metric_name, metric_value, platform)
                       VALUES (?, ?, ?, ?, ?)""",
                    (brand_name, date_str, metric_name, stored_value, platform),
                )
                total_points += 1

    conn.commit()
    conn.close()

    return {
        "brands": len(_BRAND_PROFILES),
        "weeks": 4,
        "dates": dates,
        "total_data_points": total_points,
    }


def main():
    """CLI entry point — seeds the database with historical test data."""
    print("Seeding historical data for temporal analysis testing...")
    print()

    result = seed_historical_data()

    print(f"Created {result['total_data_points']} data points:")
    print(f"  {result['brands']} brands × {result['weeks']} weeks")
    print(f"  Dates: {result['dates'][0]} to {result['dates'][-1]}")
    print()
    print("Brands seeded:")
    print("  Songmont      — steady 3-5% weekly growth")
    print("  裘真           — normal growth, spike in week 4 (anomaly)")
    print("  小CK           — stable, flat metrics")
    print("  CASSILE        — declining engagement")
    print("  La Festin      — new Douyin data appears week 3")
    print()
    print("Done! Run `python -m services.competitor-intel.temporal` to analyze.")


if __name__ == "__main__":
    main()
