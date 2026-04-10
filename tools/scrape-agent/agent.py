#!/usr/bin/env python3
"""
Rebase Local Scraping Agent
Run:    python3 agent.py
Login:  python3 agent.py --login
Test:   python3 agent.py --dry-run
Single: python3 agent.py --brand Songmont
"""
import argparse
import asyncio
import os
import random
import sys
from datetime import datetime, timezone

import httpx
from playwright.async_api import async_playwright

from config import (
    ECS_URL, API_SECRET, AGENT_ID, PLATFORMS,
    PROFILE_DIR, MIN_DELAY, MAX_DELAY, SKIP_HOURS, DRY_RUN,
)
from scrapers.xhs import XhsScraper
from scrapers.douyin import DouyinScraper

SCRAPERS = {
    'xhs': XhsScraper(),
    'douyin': DouyinScraper(),
}

os.makedirs(PROFILE_DIR, exist_ok=True)


# ── Target fetching ────────────────────────────────────────────────────────────

async def get_targets(platform: str, tier: str = 'watchlist') -> list:
    if not API_SECRET:
        print("[WARN] No REBASE_API_SECRET — using manual brand list")
        return []
    try:
        async with httpx.AsyncClient() as c:
            r = await c.get(
                f"{ECS_URL}/api/ci/scrape-targets",
                params={'platform': platform, 'tier': tier},
                headers={'x-rebase-secret': API_SECRET},
                timeout=10,
            )
            return r.json().get('targets', []) if r.status_code == 200 else []
    except Exception as e:
        print(f"[WARN] Cannot reach ECS: {e}")
        return []


# ── Push to ECS ────────────────────────────────────────────────────────────────

async def push(platform: str, brand_name: str, profile, products: list,
               raw_dims: dict, tier: str = 'watchlist') -> bool:
    if DRY_RUN or not API_SECRET:
        has_data = bool(profile.follower_count or profile.total_notes)
        label = 'DRY RUN' if DRY_RUN else 'NO KEY'
        print(f"  [{label}] {brand_name}: data={'yes' if has_data else 'no'}, products={len(products)}")
        return True
    try:
        payload = {
            'platform': platform,
            'brand_name': brand_name,
            'scrape_tier': tier,
            'agent_id': AGENT_ID,
            'brand_profile': {
                'follower_count': profile.follower_count,
                'total_products': profile.total_products,
                'avg_price': profile.avg_price,
                'engagement_metrics': profile.engagement_metrics,
                'content_metrics': profile.content_metrics,
            },
            'products': [
                {
                    'product_id': p.product_id,
                    'product_name': p.product_name,
                    'price': p.price,
                    'sales_volume': p.sales_volume,
                    'review_count': p.review_count,
                    'product_url': p.product_url,
                }
                for p in products
            ],
            'raw_dimensions': raw_dims,
        }
        async with httpx.AsyncClient() as c:
            r = await c.post(
                f"{ECS_URL}/api/ci/ingest",
                json=payload,
                headers={
                    'x-rebase-secret': API_SECRET,
                    'Content-Type': 'application/json',
                },
                timeout=30,
            )
            if r.status_code == 200:
                print(f"  [PUSH] {brand_name}: {r.json().get('products_saved', 0)} products")
                return True
            print(f"  [ERROR] Push {brand_name}: HTTP {r.status_code}")
            return False
    except Exception as e:
        print(f"  [ERROR] Push {brand_name}: {e}")
        return False


# ── Skip logic ────────────────────────────────────────────────────────────────

def should_skip(target: dict) -> bool:
    last = target.get('last_scraped')
    if not last:
        return False
    try:
        last_dt = datetime.fromisoformat(str(last).replace('Z', '+00:00'))
        hours = (datetime.now(timezone.utc) - last_dt).total_seconds() / 3600
        return hours < SKIP_HOURS
    except Exception:
        return False


# ── Login mode ────────────────────────────────────────────────────────────────

async def login_mode():
    print(f"[LOGIN] Opening browser. Log into your platforms, then close the browser window.")
    print(f"[LOGIN] Sessions saved to: {PROFILE_DIR}\n")
    async with async_playwright() as pw:
        ctx = await pw.chromium.launch_persistent_context(
            PROFILE_DIR,
            headless=False,
            args=['--disable-blink-features=AutomationControlled'],
            viewport={'width': 1440, 'height': 900},
            locale='zh-CN',
            timezone_id='Asia/Shanghai',
        )
        page = await ctx.new_page()
        await page.goto('https://www.xiaohongshu.com')
        print("[LOGIN] Browser is open. Log in, then close it when done.")
        try:
            await page.wait_for_event('close', timeout=600000)  # Wait up to 10 min
        except Exception:
            pass
        await ctx.close()
    print("[LOGIN] Sessions saved. Run 'python3 agent.py' to start scraping.")


# ── Scrape mode ───────────────────────────────────────────────────────────────

async def scrape_mode(single_brand: str = None, dry_run: bool = False):
    effective_dry_run = dry_run or DRY_RUN

    print(f"[AGENT] Rebase Scraping Agent")
    print(f"[AGENT] ID:        {AGENT_ID}")
    print(f"[AGENT] ECS:       {ECS_URL}")
    print(f"[AGENT] Platforms: {PLATFORMS}")
    print(f"[AGENT] Dry run:   {effective_dry_run}")
    print()

    async with async_playwright() as pw:
        ctx = await pw.chromium.launch_persistent_context(
            PROFILE_DIR,
            headless=False,
            args=['--disable-blink-features=AutomationControlled', '--no-first-run'],
            viewport={'width': 1440, 'height': 900},
            locale='zh-CN',
            timezone_id='Asia/Shanghai',
        )

        page = await ctx.new_page()
        total_scraped = 0
        total_pushed = 0

        for platform in PLATFORMS:
            platform = platform.strip()
            scraper = SCRAPERS.get(platform)
            if not scraper:
                print(f"[SKIP] No scraper for platform: {platform}")
                continue

            print(f"\n{'=' * 50}")
            print(f"[PLATFORM] {platform.upper()}")
            print(f"{'=' * 50}")

            # Get targets
            if single_brand:
                targets = [{'brand_name': single_brand, 'keyword': single_brand, 'last_scraped': None}]
            else:
                targets = await get_targets(platform)
                if not targets:
                    print(f"[INFO] No targets from ECS. Use --brand to scrape a specific brand.")
                    continue

            print(f"[TARGETS] {len(targets)} brand(s)")

            for i, target in enumerate(targets):
                brand = target['brand_name']
                keyword = target.get('keyword', brand)

                if not single_brand and should_skip(target):
                    print(f"  [SKIP] {brand}: scraped within {SKIP_HOURS:.0f}h")
                    continue

                print(f"\n  [SCRAPE] {brand} (keyword: {keyword})")

                try:
                    profile, products, raw_dims = await scraper.scrape_brand(page, brand, keyword)
                    total_scraped += 1

                    ok = await push(platform, brand, profile, products, raw_dims)
                    if ok:
                        total_pushed += 1
                except Exception as e:
                    print(f"  [ERROR] {brand}: {e}")

                # Human-like delay between brands (skip after last)
                if i < len(targets) - 1:
                    delay = random.uniform(MIN_DELAY, MAX_DELAY)
                    print(f"  [WAIT] {delay:.1f}s before next brand")
                    await asyncio.sleep(delay)

        await ctx.close()

    print(f"\n{'=' * 50}")
    print(f"[DONE] Scraped: {total_scraped}  |  Pushed: {total_pushed}")
    print(f"{'=' * 50}")


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Rebase Local Scraping Agent',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 agent.py --login               # First-time login on a new machine
  python3 agent.py --dry-run             # Test run (no push)
  python3 agent.py --dry-run --brand Songmont  # Test single brand
  python3 agent.py --brand Songmont      # Scrape + push one brand
  python3 agent.py                       # Full run (all targets)
        """,
    )
    parser.add_argument('--login', action='store_true',
                        help='Open browser for manual platform login')
    parser.add_argument('--dry-run', action='store_true',
                        help='Scrape but do not push to ECS')
    parser.add_argument('--brand', type=str, metavar='NAME',
                        help='Scrape a single brand by name')
    args = parser.parse_args()

    if args.login:
        asyncio.run(login_mode())
    else:
        asyncio.run(scrape_mode(single_brand=args.brand, dry_run=args.dry_run))


if __name__ == '__main__':
    main()
