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


# ─── Profile-quality filter ──────────────────────────────────────────────
# A SQL WHERE-clause snippet that excludes "buggy" scrape rows where the
# scraper hit an auth-wall / network failure / silent-zero outcome. These
# rows have follower_count=0 AND no engagement signal anywhere — clearly
# not a legitimate snapshot. Treating them as real data poisons growth /
# voice-volume math (see DATA-FLOW-AND-METRICS-ANALYSIS-2026-05-02.md
# Issue 1: Joanna's case where Songmont's voice_volume scored 15 instead
# of ~85 because a row of zeros pulled the trend down).
#
# Usage:
#     from .db_bridge import VALID_PROFILE_FILTER
#     cur.execute(f"""
#         SELECT * FROM scraped_brand_profiles
#         WHERE brand_name = %s AND {VALID_PROFILE_FILTER}
#         ORDER BY scraped_at DESC LIMIT 2
#     """, (brand,))
#
# Always combined with `AND` — caller is responsible for putting it after
# their primary brand_name filter.
VALID_PROFILE_FILTER = """(
    follower_count > 0
    OR COALESCE(NULLIF(engagement_metrics->>'total_likes', '')::numeric, 0) > 0
    OR COALESCE(NULLIF(engagement_metrics->>'total_notes', '')::numeric, 0) > 0
    OR COALESCE(NULLIF(content_metrics->>'total_notes', '')::numeric, 0) > 0
)"""


def get_conn():
    """Get a PostgreSQL connection. Caller must close it."""
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def get_scrape_targets(tier='watchlist'):
    """Get all unique brands that need scraping at the given tier level.

    Returns rows with: brand_name, platform_ids (JSONB), xhs_profile_url.
    xhs_profile_url is populated when admin has configured the URL for the
    Apify path (USE_APIFY=true). For the existing Playwright path it can
    be ignored.

    Includes BOTH:
      1. workspace_competitors rows at the requested tier (competitors)
      2. workspaces with xhs_profile_url set (own brands — migration 016).
         Own brands are always scraped regardless of tier — there's no
         "tier" concept on the workspace itself.

    Note: DISTINCT spans (brand_name, platform_ids, xhs_profile_url).
    Same brand across multiple workspaces/contexts with the same config
    is returned once; differing configs return multiple rows. The
    scraper handles per-row independently — same brand scraped twice
    isn't catastrophic (freshness guard would skip the second call), it
    just costs a tiny bit more on the rare config-divergence case.
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT DISTINCT brand_name, platform_ids, xhs_profile_url
                FROM workspace_competitors
                WHERE tier = %s

                UNION

                -- Own brands: workspace.brand_name as a target, with the
                -- workspace's own xhs_profile_url. NULL platform_ids since
                -- the workspace table doesn't carry the platform-keyword
                -- structure. The scraper's apify_client.scrape_xhs_brand
                -- only needs xhs_profile_url, so this works as-is.
                SELECT DISTINCT brand_name, NULL::jsonb AS platform_ids, xhs_profile_url
                FROM workspaces
                WHERE xhs_profile_url IS NOT NULL
            """, (tier,))
            return cur.fetchall()
    finally:
        conn.close()


def get_competitors_with_own_brand(workspace_id):
    """Return workspace_competitors rows PLUS a synthetic row for the
    workspace's own brand. Used by every scoring pipeline so the
    customer's own brand gets scored alongside competitors.

    Without this, scoring pipelines that iterate workspace_competitors
    only would skip the own brand — analysis_results would have no rows
    for the workspace's brand_name, so the 3-domain chart and 12 metric
    cards would render '你的品牌' as 0 even when scrape data exists.

    The synthetic row uses 'added_via': 'self' so callers can distinguish
    it if needed. It carries the workspace's xhs_profile_url (migration 016)
    so per-brand data lookups work the same as for real competitors.

    De-dup: if a competitor row with the same brand_name (case-insensitive)
    already exists in workspace_competitors, we don't add a duplicate
    synthetic row. This shouldn't normally happen but the guard prevents
    double-scoring weirdness.

    Same pattern composite_indices.py uses inline (lines 1139-1141);
    extracted here so every pipeline can share one implementation.

    Args:
        workspace_id: UUID of the workspace

    Returns:
        list[dict] — competitor rows. Always includes own brand at index 0
        unless it was already in workspace_competitors.
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM workspace_competitors WHERE workspace_id = %s",
                (workspace_id,),
            )
            competitors = list(cur.fetchall())

            cur.execute(
                "SELECT id, brand_name, brand_category, created_at, xhs_profile_url "
                "FROM workspaces WHERE id = %s",
                (workspace_id,),
            )
            workspace = cur.fetchone()

            if workspace and (workspace.get("brand_name") or "").strip():
                own = workspace["brand_name"].strip()
                already_present = any(
                    (c.get("brand_name") or "").strip().lower() == own.lower()
                    for c in competitors
                )
                if not already_present:
                    # Synthetic row — shape matches workspace_competitors
                    # well enough that downstream pipelines don't need to
                    # know it's synthetic. id=None signals 'no DB row';
                    # most pipelines only read brand_name + platform_ids
                    # + tier, so the missing id is fine.
                    own_row = {
                        "id": None,
                        "workspace_id": workspace_id,
                        "brand_name": own,
                        "tier": "watchlist",
                        "added_via": "self",
                        "platform_ids": {},
                        "created_at": workspace.get("created_at"),
                        "xhs_profile_url": workspace.get("xhs_profile_url"),
                    }
                    # Put own brand first so it leads in any iteration logs.
                    competitors.insert(0, own_row)
            return competitors
    finally:
        conn.close()


def set_workspace_xhs_url(workspace_id, xhs_profile_url):
    """Set the workspace's own-brand XHS profile URL. Used by admin endpoint
    PATCH /api/admin/workspaces/:id/xhs-url (server.js).

    After this, scrape_runner picks up the workspace's own brand on the
    next tier scrape. Scoring computes own-brand score the same way it
    does for competitors.

    Args:
        workspace_id: UUID of the workspace
        xhs_profile_url: full rednote.com URL, or None to clear

    Returns: dict with updated workspace row (id, brand_name, xhs_profile_url)
             or None if not found.
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE workspaces
                   SET xhs_profile_url = %s, updated_at = NOW()
                 WHERE id = %s
                 RETURNING id, brand_name, xhs_profile_url
            """, (xhs_profile_url, workspace_id))
            row = cur.fetchone()
            conn.commit()
            return row
    finally:
        conn.close()


def set_competitor_xhs_url(competitor_id, xhs_profile_url):
    """Set the XHS profile URL for a competitor row. Used by the admin endpoint.

    Args:
        competitor_id: UUID of the workspace_competitors row
        xhs_profile_url: full URL (e.g., https://www.rednote.com/user/profile/...),
                         or None to clear

    Returns: dict with updated row (id, brand_name, xhs_profile_url) or None if not found.
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE workspace_competitors
                SET xhs_profile_url = %s
                WHERE id = %s
                RETURNING id, workspace_id, brand_name, xhs_profile_url
            """, (xhs_profile_url, competitor_id))
            row = cur.fetchone()
            conn.commit()
            return row
    finally:
        conn.close()


def set_competitor_xhs_url_by_brand(workspace_id, brand_name, xhs_profile_url):
    """Convenience: set URL by (workspace_id, brand_name) instead of competitor_id.

    Useful for the first-prospects-manual-config workflow where admin
    knows the workspace + brand name but not the UUID.
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE workspace_competitors
                SET xhs_profile_url = %s
                WHERE workspace_id = %s AND brand_name = %s
                RETURNING id, brand_name, xhs_profile_url
            """, (xhs_profile_url, workspace_id, brand_name))
            row = cur.fetchone()
            conn.commit()
            return row
    finally:
        conn.close()


def log_apify_run(payload):
    """Persist one Apify actor invocation to apify_run_log (migration 012).

    Used as the default cost_logger callback for ApifyScraperClient.
    Best-effort: failure to write the log row must NEVER break the scrape,
    so we swallow any exception and just print a warning.

    Args:
        payload: dict from apify_client._log_cost. Expected keys:
            brand, platform, actor, label (mode), items_returned,
            estimated_cost_usd, timestamp (ISO str, optional), run_id (optional)
    """
    try:
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO apify_run_log (
                        brand_name, platform, actor_id, mode,
                        items_returned, cost_estimate_usd, run_id, invoked_at
                    ) VALUES (
                        %s, %s, %s, %s,
                        %s, %s, %s, COALESCE(%s::timestamptz, NOW())
                    )
                """, (
                    payload.get('brand') or '',
                    payload.get('platform') or 'xhs',
                    payload.get('actor') or '',
                    payload.get('label') or payload.get('mode') or 'unknown',
                    int(payload.get('items_returned') or 0),
                    float(payload.get('estimated_cost_usd') or 0),
                    payload.get('run_id') or None,
                    payload.get('timestamp') or None,
                ))
            conn.commit()
        finally:
            conn.close()
    except Exception as exc:
        # Cost logging is best-effort; never propagate.
        print(f"[WARN] apify_run_log insert failed: {exc}")


def get_brand_last_scraped_at(platform, brand_name):
    """Return the most recent scraped_at TIMESTAMPTZ for a (platform, brand) tuple.

    Used by the freshness guard in scrape_runner.py to skip brands that were
    scraped recently. Returns None if the brand has never been scraped on this
    platform, or if any DB error occurs (best-effort — never block a scrape on
    this check).

    Args:
        platform: 'xhs' | 'douyin' | 'sycm'
        brand_name: exact brand_name as stored in scraped_brand_profiles

    Returns: datetime or None
    """
    try:
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT MAX(scraped_at) AS last_scraped
                      FROM scraped_brand_profiles
                     WHERE platform = %s AND brand_name = %s
                """, (platform, brand_name))
                row = cur.fetchone()
                return row['last_scraped'] if row else None
        finally:
            conn.close()
    except Exception as exc:
        # Best-effort. If freshness lookup fails, don't block the scrape.
        print(f"[WARN] get_brand_last_scraped_at({platform}, {brand_name}) failed: {exc}")
        return None


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
