"""
Database bridge for Python scrapers.
Reads targets from and writes results to the PostgreSQL CI tables
created in TASK-01/02.

Usage:
    from .db_bridge import get_scrape_targets, save_brand_profile, save_products
"""

import os
from pathlib import Path
import psycopg2
from psycopg2.extras import RealDictCursor, Json
from datetime import datetime, timezone

# Auto-load .env so scripts work without manually sourcing it.
# Checks the backend/.env (ECS layout) and project root .env (local layout).
try:
    from dotenv import load_dotenv
    for _candidate in [
        Path(__file__).parent.parent.parent / 'backend' / '.env',  # ECS: ~/rebase/backend/.env
        Path(__file__).parent.parent.parent / '.env',               # local: project root .env
    ]:
        if _candidate.exists():
            load_dotenv(_candidate, override=False)  # override=False: shell env takes priority
            break
except ImportError:
    pass  # python-dotenv not installed; rely on env vars being set externally

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
    """Get decrypted active cookies for a platform."""
    from .crypto_utils import decrypt_cookies

    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT cookies_encrypted, workspace_id
                FROM platform_connections
                WHERE platform = %s AND status = 'active'
                AND (expires_at IS NULL OR expires_at > NOW())
                ORDER BY last_successful_scrape DESC NULLS LAST
                LIMIT 1
            """, (platform,))
            row = cur.fetchone()
            if not row or not row['cookies_encrypted']:
                return None
            try:
                decrypted = decrypt_cookies(row['cookies_encrypted'])
                print(f"[DB] Cookies loaded for platform {platform}")
                return decrypted
            except Exception as e:
                print(f"[WARN] Failed to decrypt cookies for {platform}: {e}")
                return None
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


def save_platform_connection(platform: str, cookie_str: str) -> bool:
    """
    Encrypt and upsert platform cookies into platform_connections.

    Called automatically by setup_profiles after a successful login, and by
    push_cookies as a recovery tool. This is the single place where cookies
    are encrypted and written to the DB — do not duplicate this logic.

    Returns True on success, False if the DB is unreachable (e.g. SSH tunnel
    not open) so callers can decide whether to abort or continue.
    """
    from .crypto_utils import encrypt_cookies

    if not DATABASE_URL:
        print('[WARN] DATABASE_URL not set — cannot save cookies to DB')
        return False

    try:
        conn = get_conn()
    except Exception as e:
        print(f'[WARN] DB unreachable, cookies not saved: {e}')
        print('       Open SSH tunnel:  ssh -L 5432:localhost:5432 joanna@8.217.242.191 -N')
        return False

    try:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT id, brand_name FROM workspaces ORDER BY created_at LIMIT 1'
            )
            row = cur.fetchone()
            if not row:
                print('[WARN] No workspaces in DB — cannot save cookies')
                return False
            workspace_id = str(row['id'])

            encrypted = encrypt_cookies(cookie_str)
            cur.execute(
                """
                INSERT INTO platform_connections
                    (workspace_id, platform, cookies_encrypted, status, expires_at)
                VALUES (%s, %s, %s, 'active', NOW() + INTERVAL '7 days')
                ON CONFLICT (workspace_id, platform) DO UPDATE
                    SET cookies_encrypted = EXCLUDED.cookies_encrypted,
                        status            = 'active',
                        updated_at        = NOW(),
                        expires_at        = NOW() + INTERVAL '7 days'
                RETURNING id
                """,
                (workspace_id, platform, encrypted),
            )
            result = cur.fetchone()
            conn.commit()
            print(
                f'[DB] {platform} cookies stored '
                f'(workspace: {row["brand_name"]}, connection: {result["id"]})'
            )
            return True
    except Exception as e:
        print(f'[WARN] Failed to save cookies: {e}')
        return False
    finally:
        conn.close()
