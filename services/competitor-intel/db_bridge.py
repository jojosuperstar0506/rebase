"""
Database bridge for Python scrapers.
Reads targets from and writes results to the PostgreSQL CI tables
created in TASK-01/02.

Usage:
    from .db_bridge import get_scrape_targets, save_brand_profile, save_products
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor, Json
from datetime import datetime, timezone

DATABASE_URL = os.environ.get('DATABASE_URL')


def get_conn():
    """Get a PostgreSQL connection. Caller must close it."""
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def get_scrape_targets(tier='watchlist'):
    """Get all unique brands that need scraping at the given tier level."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT brand_name, platform_ids
                FROM workspace_competitors
                WHERE tier = %s
            """, (tier,))
            return cur.fetchall()
    finally:
        conn.close()


def get_brand_cookies(platform):
    """Get active cookies for a platform from any workspace that has them."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT cookies_encrypted, workspace_id
                FROM platform_connections
                WHERE platform = %s AND status = 'active'
                ORDER BY last_successful_scrape DESC NULLS LAST
                LIMIT 1
            """, (platform,))
            row = cur.fetchone()
            return row['cookies_encrypted'] if row else None
    finally:
        conn.close()


def save_brand_profile(platform, brand_name, data, scrape_tier='watchlist'):
    """Save a scraped brand profile to PostgreSQL."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO scraped_brand_profiles
                    (platform, brand_name, follower_count, total_products, avg_price,
                     price_range, engagement_metrics, content_metrics, scrape_tier, raw_dimensions)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                platform,
                brand_name,
                data.get('follower_count'),
                data.get('total_products'),
                data.get('avg_price'),
                Json(data.get('price_range')),
                Json(data.get('engagement_metrics')),
                Json(data.get('content_metrics')),
                scrape_tier,
                Json(data.get('raw_dimensions')),
            ))
        conn.commit()
    finally:
        conn.close()


def save_products(platform, brand_name, products, scrape_tier='watchlist'):
    """Save scraped products to PostgreSQL (upsert by platform+product_id+date)."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            for p in products:
                cur.execute("""
                    INSERT INTO scraped_products
                        (platform, brand_name, product_id, product_name, price, original_price,
                         sales_volume, review_count, rating, category, material_tags,
                         image_urls, product_url, scrape_tier, data_confidence)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (platform, product_id, scraped_date)
                    DO UPDATE SET
                        price = EXCLUDED.price,
                        sales_volume = EXCLUDED.sales_volume,
                        review_count = EXCLUDED.review_count,
                        scraped_at = NOW()
                """, (
                    platform, brand_name, p.get('product_id', ''), p.get('product_name', ''),
                    p.get('price'), p.get('original_price'),
                    p.get('sales_volume'), p.get('review_count'), p.get('rating'),
                    p.get('category'), p.get('material_tags', []),
                    p.get('image_urls', []), p.get('product_url', ''),
                    scrape_tier, p.get('data_confidence', 'direct_scrape'),
                ))
        conn.commit()
    finally:
        conn.close()


def mark_connection_success(platform):
    """Update last_successful_scrape for a platform connection."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE platform_connections
                SET last_successful_scrape = NOW(), status = 'active'
                WHERE platform = %s AND status IN ('active', 'expiring')
            """, (platform,))
        conn.commit()
    finally:
        conn.close()


def mark_connection_expired(platform, workspace_id=None):
    """Mark a platform connection as expired (auth failed)."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            if workspace_id:
                cur.execute("""
                    UPDATE platform_connections SET status = 'expired', updated_at = NOW()
                    WHERE platform = %s AND workspace_id = %s
                """, (platform, workspace_id))
            else:
                cur.execute("""
                    UPDATE platform_connections SET status = 'expired', updated_at = NOW()
                    WHERE platform = %s AND status = 'active'
                """, (platform,))
        conn.commit()
    finally:
        conn.close()
