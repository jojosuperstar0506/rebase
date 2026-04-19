"""
Scrape runner that reads targets from PostgreSQL and writes results back.

Two modes:
  --mode api     (default) httpx-based — fast but blocked by Douyin/XHS
  --mode browser Playwright-based — uses saved login profile on local machine
                 Run locally (residential IP). ECS browser mode won't work due
                 to datacenter IP detection by Douyin/XHS.

Usage:
  # Browser mode (recommended for Douyin/XHS — run on local machine)
  python -m services.competitor_intel.scrape_runner --platform douyin --tier watchlist --mode browser
  python -m services.competitor_intel.scrape_runner --platform xhs --tier watchlist --mode browser

  # API mode (for platforms that support it)
  python -m services.competitor_intel.scrape_runner --platform douyin --tier watchlist
  python -m services.competitor_intel.scrape_runner --platform xhs --brand "Songmont"
"""

import argparse
import asyncio
import os
import random
import sys
import traceback
from datetime import datetime
from pathlib import Path

from .db_bridge import (
    get_scrape_targets, get_brand_cookies, save_brand_profile,
    save_products, mark_connection_success, mark_connection_expired,
)
from .scrapers.xhs_scraper import XhsScraper
from .scrapers.douyin_scraper import DouyinScraper

PLATFORM_SCRAPERS = {
    'xhs': XhsScraper,
    'douyin': DouyinScraper,
}

PLATFORM_HOME_URLS = {
    'douyin': 'https://www.douyin.com',
    'xhs': 'https://www.xiaohongshu.com/explore',
}

SCRAPER_PROFILE_DIR = os.environ.get(
    'SCRAPER_PROFILE_DIR',
    str(Path.home() / 'rebase-scraper-profile'),
)


# ─── Shared result saver ──────────────────────────────────────────────────────

def _save_result(platform: str, brand_name: str, tier: str, result, cookies: str = None) -> bool:
    """
    Save a scrape result to the DB. Used by both API and browser modes.
    Returns True on success, False if result was empty or failed.
    """
    if not result or result.scrape_status not in ('success', 'partial'):
        return False

    def parse_int(val, default=0):
        if isinstance(val, int):
            return val
        try:
            s = str(val).strip().replace(',', '')
            if '万' in s or 'w' in s.lower():
                return int(float(s.replace('万', '').replace('w', '').replace('W', '')) * 10000)
            return int(s)
        except (ValueError, TypeError):
            return default

    data = {
        'follower_count': getattr(result, 'd2_official_followers', None),
        'total_products': None,
        'avg_price': None,
        'engagement_metrics': {
            'total_likes': getattr(result, 'd2_total_likes', None),
            'total_notes': getattr(result, 'd2_total_notes', None),
        },
        'content_metrics': {
            'content_types': getattr(result, 'd3_content_types', None),
        },
        'raw_dimensions': {
            'd1': {
                'search_suggestions': getattr(result, 'd1_search_suggestions', []),
                'search_volume_rank': getattr(result, 'd1_search_volume_rank', ''),
            },
            'd2': {
                'followers': getattr(result, 'd2_official_followers', None),
                'total_notes': getattr(result, 'd2_total_notes', None),
                'total_likes': getattr(result, 'd2_total_likes', None),
            },
            'd3': {
                'content_types': getattr(result, 'd3_content_types', None),
                'top_notes': [
                    {
                        'title': n.get('title', ''),
                        'body_text': n.get('body_text', ''),
                        'likes': n.get('likes', 0),
                        'comments_count': n.get('comments_count', 0),
                        'shares': n.get('shares', 0),
                        'hashtags': n.get('hashtags', []),
                        'tagged_products': n.get('tagged_products', []),
                        'is_sponsored': n.get('is_sponsored', False),
                        'brand_collab': n.get('brand_collab', ''),
                        'author_followers': n.get('author_followers', 0),
                        'image_count': n.get('image_count', 0),
                        'top_comments': n.get('top_comments', [])[:5],
                        'note_id': n.get('note_id', ''),
                        'type': n.get('type', ''),
                    }
                    for n in getattr(result, 'd3_top_notes', [])[:50]
                ],
                'catalog_size': len(getattr(result, 'full_note_catalog', [])),
            },
            'd4': {
                'kols': getattr(result, 'd4_top_kols', []),
                'note_authors': [
                    {
                        'name': n.get('author_name', n.get('author', '')),
                        'followers': n.get('author_followers', 0),
                        'is_sponsored': n.get('is_sponsored', False),
                    }
                    for n in getattr(result, 'full_note_catalog', [])
                    if n.get('author_followers', 0) > 10000
                ][:20],
            },
            'd6': {
                'sentiment_keywords': getattr(result, 'd6_sentiment_keywords', []),
                'positive_keywords': getattr(result, 'd6_positive_keywords', []),
                'negative_keywords': getattr(result, 'd6_negative_keywords', []),
                'consumer_comments': [
                    comment
                    for n in getattr(result, 'd3_top_notes', [])[:20]
                    for comment in (n.get('top_comments', []) or [])[:3]
                ][:30],
            },
        },
    }

    save_brand_profile(platform, brand_name, data, scrape_tier=tier)

    full_catalog = getattr(result, 'full_note_catalog', [])
    notes_to_save = full_catalog if full_catalog else getattr(result, 'd3_top_notes', [])
    if notes_to_save:
        products = [{
            'product_id': note.get('note_id', f'{brand_name}-{i}'),
            'product_name': note.get('title', ''),
            'sales_volume': parse_int(note.get('likes', 0)),
            'review_count': parse_int(note.get('comments', note.get('comments_count', 0))),
            'product_url': f"https://www.xiaohongshu.com/explore/{note.get('note_id', '')}" if note.get('note_id') else '',
            'image_urls': note.get('image_urls', [note['cover_url']] if note.get('cover_url') else []),
            'category': ', '.join(note.get('hashtags', [])[:5]) if note.get('hashtags') else None,
            'data_confidence': 'direct_scrape',
        } for i, note in enumerate(notes_to_save)]
        save_products(platform, brand_name, products, scrape_tier=tier)
        print(f"  Saved {len(products)} notes (source: {'full_catalog' if full_catalog else 'search_top'})")

    ugc_notes = getattr(result, 'd6_ugc_sample_notes', [])
    if ugc_notes:
        ugc_products = [{
            'product_id': f"ugc-{brand_name}-{i}",
            'product_name': note.get('title', ''),
            'sales_volume': parse_int(note.get('likes', 0)),
            'category': f"ugc:{note.get('variant', '')}",
            'data_confidence': 'direct_scrape',
        } for i, note in enumerate(ugc_notes)]
        save_products(platform, brand_name, ugc_products, scrape_tier=tier)
        print(f"  Saved {len(ugc_products)} UGC notes")

    if cookies:
        mark_connection_success(platform)

    return True


# ─── API mode ────────────────────────────────────────────────────────────────

async def scrape_brand(platform: str, brand_name: str, keyword: str, tier: str, cookies: str = None):
    """Scrape a single brand via httpx API mode."""
    ScraperClass = PLATFORM_SCRAPERS.get(platform)
    if not ScraperClass:
        print(f"[WARN] No scraper for platform: {platform}")
        return False

    print(f"[SCRAPE] {platform} / {brand_name} (keyword: {keyword}, tier: {tier})")

    try:
        scraper = ScraperClass(cookies=cookies)
        brand_dict = {"name": brand_name, f"{platform}_keyword": keyword}
        result = await scraper.scrape_brand_api(brand_dict)

        if _save_result(platform, brand_name, tier, result, cookies):
            print(f"[OK] {platform} / {brand_name}: {result.scrape_status}")
            return True
        else:
            status = result.scrape_status if result else 'no_result'
            print(f"[FAIL] {platform} / {brand_name}: {status}")
            _check_auth_failure(platform, status, '', cookies)
            return False

    except Exception as e:
        print(f"[ERROR] {platform} / {brand_name}: {e}")
        traceback.print_exc()
        _check_auth_failure(platform, 'exception', str(e), cookies)
        return False


async def run_tier_scrape(platform: str, tier: str):
    """Scrape all brands at a tier via API mode."""
    targets = get_scrape_targets(tier)
    if not targets:
        print(f"[INFO] No {tier} targets to scrape for {platform}")
        return

    cookies = get_brand_cookies(f'{platform}_analytics') or get_brand_cookies(platform)
    print(f"[START] Scraping {len(targets)} {tier} brands on {platform} (api mode)")
    success = 0
    for target in targets:
        brand_name = target['brand_name']
        platform_ids = target.get('platform_ids') or {}
        keyword = platform_ids.get(platform, brand_name)
        ok = await scrape_brand(platform, brand_name, keyword, tier, cookies)
        if ok:
            success += 1
        await asyncio.sleep(5)

    print(f"[DONE] {platform} {tier}: {success}/{len(targets)} brands scraped successfully")


# ─── Browser mode ─────────────────────────────────────────────────────────────

def _fmt_num(n) -> str:
    """Human-readable number: 32600000 -> '32.6M'."""
    try:
        n = int(n)
    except (TypeError, ValueError):
        return str(n)
    if n >= 1_000_000_000:
        return f"{n/1_000_000_000:.1f}B"
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n/1_000:.1f}K"
    return str(n)


def _print_brand_summary(platform: str, brand_name: str, result) -> None:
    """Print a rich, human-readable summary of what the scraper captured."""
    print(f"[OK] {platform} / {brand_name}: {result.scrape_status}")

    # D2 — account identity & size
    acct_name = getattr(result, 'd2_official_account_name', '') or '(not found)'
    followers = getattr(result, 'd2_official_followers', 0) or 0
    total_videos = getattr(result, 'd2_total_videos', 0) or 0
    total_likes = getattr(result, 'd2_total_likes', 0) or 0
    verified = getattr(result, 'd2_verified', False)
    verified_tag = ' ✓verified' if verified else ''
    print(f"  Account: {acct_name}{verified_tag}")
    print(f"  Size:    {_fmt_num(followers)} followers · "
          f"{_fmt_num(total_videos)} posts · {_fmt_num(total_likes)} total likes")

    # D5 — live commerce (Douyin only)
    live_status = getattr(result, 'd5_live_status', '')
    shop_count = getattr(result, 'd5_shop_product_count', 0) or 0
    if live_status or shop_count:
        parts = []
        if live_status:
            parts.append(f"live: {live_status}")
        if shop_count:
            parts.append(f"shop: {shop_count} products")
        print(f"  Commerce: {' · '.join(parts)}")

    # D4 — KOL / creator ecosystem
    creators = getattr(result, 'd4_top_creators', []) or []
    mentions = getattr(result, 'd4_brand_mentions_count', 0) or 0
    if creators:
        names = [c.get('name', '') for c in creators[:5] if c.get('name')]
        print(f"  Creators mentioning brand ({mentions} total): "
              f"{', '.join(names) or '(none)'}")

    # D4 — top videos by likes (sorted client-side in scraper)
    top_videos = getattr(result, 'd4_hashtag_views', {}) or {}
    if top_videos:
        print(f"  Top content by likes:")
        for i, (title, likes) in enumerate(list(top_videos.items())[:5], 1):
            print(f"    {i}. {title} — {likes}")

    # D1 — search signals
    suggestions = getattr(result, 'd1_search_suggestions', []) or []
    if suggestions:
        print(f"  Search hits: {', '.join(suggestions[:5])}"
              + (f" (+{len(suggestions)-5} more)" if len(suggestions) > 5 else ""))


async def scrape_brand_with_page(platform: str, brand_name: str, keyword: str, tier: str, page):
    """Scrape a single brand using an open Playwright page (browser mode)."""
    ScraperClass = PLATFORM_SCRAPERS.get(platform)
    if not ScraperClass:
        print(f"[WARN] No scraper for platform: {platform}")
        return False

    print(f"[SCRAPE] {platform} / {brand_name} (keyword: {keyword}, tier: {tier}, browser)")

    try:
        scraper = ScraperClass()
        brand_dict = {"name": brand_name, f"{platform}_keyword": keyword}
        result = await scraper.scrape_brand_browser(brand_dict, page)

        if _save_result(platform, brand_name, tier, result):
            _print_brand_summary(platform, brand_name, result)
            return True
        else:
            status = result.scrape_status if result else 'no_result'
            print(f"[FAIL] {platform} / {brand_name}: {status}")
            return False

    except Exception as e:
        print(f"[ERROR] {platform} / {brand_name}: {e}")
        traceback.print_exc()
        return False


async def run_tier_scrape_browser(platform: str, tier: str, limit: int = 0):
    """
    Scrape all brands at a tier using Playwright browser mode.

    MUST run on a local machine (residential IP). Douyin/XHS actively block
    datacenter IPs. Uses the saved Playwright profile from setup_profiles so
    the browser is already logged in — no QR scan needed.

    Rate-limit defense:
      * Inter-brand delay is 45–90s with jitter (Douyin) / 30–60s (XHS)
      * Abort entire tier if the scraper hits a rate_limited status
      * Use --limit N to cap brands per run while testing
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("[ERROR] playwright not installed — run: pip install playwright && playwright install chromium")
        sys.exit(1)

    targets = get_scrape_targets(tier)
    if not targets:
        print(f"[INFO] No {tier} targets to scrape for {platform}")
        return
    if limit and limit > 0:
        targets = targets[:limit]
        print(f"[INFO] --limit {limit}: scraping only first {limit} brand(s)")

    home_url = PLATFORM_HOME_URLS.get(platform, f'https://www.{platform}.com')
    print(f"[START] Scraping {len(targets)} {tier} brands on {platform} (browser mode)")
    print(f"[INFO]  Profile: {SCRAPER_PROFILE_DIR}")
    print(f"[INFO]  A Chrome window will open. Do not close it while scraping.\n")

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=SCRAPER_PROFILE_DIR,
            headless=False,  # Visible window — less detectable, allows manual intervention
            args=[
                '--disable-blink-features=AutomationControlled',
                '--no-first-run',
                '--no-default-browser-check',
            ],
            viewport={'width': 1280, 'height': 800},
        )

        page = context.pages[0] if context.pages else await context.new_page()

        # Warm up the session — navigate to the platform home first
        print(f"[INFO] Warming up session at {home_url}...")
        try:
            await page.goto(home_url, wait_until='domcontentloaded', timeout=30000)
        except Exception as e:
            print(f"[WARN] Home page navigation issue: {e}")
            print("[INFO] This is often normal for Douyin — continuing with brand searches...")
        await page.wait_for_timeout(random.randint(4000, 7000))

        # Quick check: are we logged in?
        try:
            page_text = await page.evaluate("document.body ? document.body.innerText : ''")
            if '登录' in page_text and '个人主页' not in page_text and '我' not in page_text:
                print('[WARN] Session may have expired — log in manually in the Chrome window.')
                input('Press Enter when ready... ')
        except Exception:
            pass  # page.evaluate can fail on some pages — not critical

        success = 0
        rate_limited = False
        for i, target in enumerate(targets):
            brand_name = target['brand_name']
            platform_ids = target.get('platform_ids') or {}
            keyword = platform_ids.get(platform, brand_name)

            ok = await scrape_brand_with_page(platform, brand_name, keyword, tier, page)
            if ok:
                success += 1

            # Check if the scraper hit a rate-limit page — if so, stop immediately
            # to avoid getting the account / IP flagged for longer.
            try:
                pt = await page.evaluate("document.body ? document.body.innerText : ''")
                if any(m in pt for m in ('滑块验证', '验证码', '访问过于频繁', '操作太频繁', '人机验证')):
                    print(f"\n[ABORT] Rate-limit page detected after {brand_name}. Stopping tier scrape.")
                    print("[INFO]  Wait 1-2 hours before re-running to let Douyin cool off.")
                    rate_limited = True
                    break
            except Exception:
                pass

            # Respectful inter-brand delay — jittered to look human
            if i < len(targets) - 1:
                if platform == 'douyin':
                    delay = random.randint(45, 90)
                else:
                    delay = random.randint(30, 60)
                print(f"  [WAIT] {delay}s before next brand (human-like pacing)...")
                await asyncio.sleep(delay)

        await context.close()

    final_status = "ABORTED (rate-limited)" if rate_limited else "DONE"
    print(f"\n[{final_status}] {platform} {tier} browser: {success}/{len(targets)} brands scraped")


def _flatten_snapshot(node: dict, depth: int = 0) -> str:
    """Flatten Playwright accessibility snapshot into plain text."""
    if not node:
        return ''
    parts = []
    if node.get('name'):
        parts.append(node['name'])
    for child in node.get('children', []):
        parts.append(_flatten_snapshot(child, depth + 1))
    return '\n'.join(parts)


async def run_single_brand(platform: str, brand_name: str, mode: str = 'api'):
    """Scrape a single brand on demand."""
    if mode == 'browser':
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            print("[ERROR] playwright not installed")
            sys.exit(1)

        async with async_playwright() as p:
            context = await p.chromium.launch_persistent_context(
                user_data_dir=SCRAPER_PROFILE_DIR,
                headless=False,
                args=['--disable-blink-features=AutomationControlled'],
                viewport={'width': 1280, 'height': 800},
            )
            page = context.pages[0] if context.pages else await context.new_page()
            await page.goto(PLATFORM_HOME_URLS.get(platform, f'https://www.{platform}.com'))
            await page.wait_for_timeout(3000)
            await scrape_brand_with_page(platform, brand_name, brand_name, 'deep_dive', page)
            await context.close()
    else:
        cookies = get_brand_cookies(f'{platform}_analytics') or get_brand_cookies(platform)
        await scrape_brand(platform, brand_name, brand_name, 'deep_dive', cookies)


def _check_auth_failure(platform: str, status: str, error_msg: str, cookies: str):
    """Mark cookies as expired if we detect an auth failure signal."""
    if not cookies:
        return
    signals = ['login', '登录', '401', '403', 'unauthorized', 'redirect', 'expired', '过期']
    combined = (status + ' ' + error_msg).lower()
    if any(s in combined for s in signals):
        print(f"[AUTH] Cookie expired for {platform}, marking as expired")
        mark_connection_expired(platform)


def main():
    parser = argparse.ArgumentParser(description='Run CI scraper with DB integration')
    parser.add_argument('--platform', required=True, choices=['xhs', 'douyin', 'sycm'])
    parser.add_argument('--tier', choices=['watchlist', 'landscape'],
                        help='Scrape all brands at this tier')
    parser.add_argument('--brand', help='Scrape a single brand (deep dive)')
    parser.add_argument('--mode', choices=['api', 'browser'], default='api',
                        help='api=httpx (default), browser=Playwright (local machine only)')
    parser.add_argument('--limit', type=int, default=0,
                        help='Browser mode only: scrape at most N brands per run (0 = all). '
                             'Useful for testing without burning rate budget.')
    args = parser.parse_args()

    if args.brand:
        asyncio.run(run_single_brand(args.platform, args.brand, mode=args.mode))
    elif args.tier:
        if args.mode == 'browser':
            asyncio.run(run_tier_scrape_browser(args.platform, args.tier, limit=args.limit))
        else:
            asyncio.run(run_tier_scrape(args.platform, args.tier))
    else:
        print("Error: specify --tier or --brand")
        sys.exit(1)


if __name__ == '__main__':
    main()
