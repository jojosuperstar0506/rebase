"""
Scrape runner that reads targets from PostgreSQL and writes results back.
This replaces the orchestrator for database-integrated scraping.

Usage:
  python -m services.competitor-intel.scrape_runner --platform xhs --tier watchlist
  python -m services.competitor-intel.scrape_runner --platform xhs --tier landscape
  python -m services.competitor-intel.scrape_runner --platform xhs --brand "Songmont"
"""

import argparse
import asyncio
import sys
import traceback
from datetime import datetime

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


async def scrape_brand(platform: str, brand_name: str, keyword: str, tier: str, cookies: str = None):
    """Scrape a single brand on a single platform and save to DB."""
    ScraperClass = PLATFORM_SCRAPERS.get(platform)
    if not ScraperClass:
        print(f"[WARN] No scraper for platform: {platform}")
        return False

    print(f"[SCRAPE] {platform} / {brand_name} (keyword: {keyword}, tier: {tier})")

    try:
        scraper = ScraperClass(cookies=cookies)
        # Build brand dict matching what scrape_brand_api expects
        brand_dict = {"name": brand_name, f"{platform}_keyword": keyword}
        result = await scraper.scrape_brand_api(brand_dict)

        if result and result.scrape_status in ('success', 'partial'):
            # Convert dataclass to dict for DB storage
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
                        # Extract KOL-like authors from enriched notes (followers > 10k)
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
                        # Real consumer comments from enriched notes
                        'consumer_comments': [
                            comment
                            for n in getattr(result, 'd3_top_notes', [])[:20]
                            for comment in (n.get('top_comments', []) or [])[:3]
                        ][:30],
                    },
                },
            }

            save_brand_profile(platform, brand_name, data, scrape_tier=tier)

            # Save full note catalog as products (if available), fallback to top notes
            full_catalog = getattr(result, 'full_note_catalog', [])
            notes_to_save = full_catalog if full_catalog else getattr(result, 'd3_top_notes', [])

            if notes_to_save:
                def parse_int(val, default=0):
                    """Safely parse string/int like counts."""
                    if isinstance(val, int):
                        return val
                    try:
                        s = str(val).strip().replace(',', '')
                        if '万' in s or 'w' in s.lower():
                            return int(float(s.replace('万', '').replace('w', '').replace('W', '')) * 10000)
                        return int(s)
                    except (ValueError, TypeError):
                        return default

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
                print(f"  Saved {len(products)} brand notes (source: {'full_catalog' if full_catalog else 'search_top'})")

            # Also save UGC notes (consumer posts ABOUT the brand)
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
                print(f"  Saved {len(ugc_products)} UGC notes about {brand_name}")

            if cookies:
                mark_connection_success(platform)

            print(f"[OK] {platform} / {brand_name}: {result.scrape_status}")
            return True
        else:
            status = result.scrape_status if result else 'no_result'
            error_msg = getattr(result, 'error_message', '') or str(result) if result else ''
            print(f"[FAIL] {platform} / {brand_name}: {status}")

            # Detect auth failures — signals that cookies have expired
            if cookies and status == 'failed':
                auth_failure_signals = ['login', '登录', '401', '403', 'unauthorized', 'redirect', 'expired', '过期']
                if any(signal in error_msg.lower() for signal in auth_failure_signals):
                    print(f"[AUTH] Cookie expired for {platform}, marking connection as expired")
                mark_connection_expired(platform)

            return False
    except Exception as e:
        error_str = str(e).lower()
        print(f"[ERROR] {platform} / {brand_name}: {e}")
        traceback.print_exc()

        # Also check exceptions for auth failure signals
        if cookies:
            auth_failure_signals = ['login', '登录', '401', '403', 'unauthorized', 'redirect', 'expired', '过期']
            if any(signal in error_str for signal in auth_failure_signals):
                print(f"[AUTH] Cookie expired for {platform} (exception), marking connection as expired")
                mark_connection_expired(platform)

        return False


async def run_tier_scrape(platform: str, tier: str):
    """Scrape all brands at a given tier for a platform."""
    targets = get_scrape_targets(tier)
    if not targets:
        print(f"[INFO] No {tier} targets to scrape for {platform}")
        return

    cookies = get_brand_cookies(f'{platform}_analytics') or get_brand_cookies(platform)

    print(f"[START] Scraping {len(targets)} {tier} brands on {platform}")
    success = 0
    for target in targets:
        brand_name = target['brand_name']
        platform_ids = target.get('platform_ids') or {}
        keyword = platform_ids.get(platform, brand_name)

        ok = await scrape_brand(platform, brand_name, keyword, tier, cookies)
        if ok:
            success += 1

        # Rate limit between brands
        await asyncio.sleep(5)

    print(f"[DONE] {platform} {tier}: {success}/{len(targets)} brands scraped successfully")


async def run_single_brand(platform: str, brand_name: str):
    """Scrape a single brand (for on-demand deep dive)."""
    cookies = get_brand_cookies(f'{platform}_analytics') or get_brand_cookies(platform)
    await scrape_brand(platform, brand_name, brand_name, 'deep_dive', cookies)


def main():
    parser = argparse.ArgumentParser(description='Run CI scraper with DB integration')
    parser.add_argument('--platform', required=True, choices=['xhs', 'douyin', 'sycm'])
    parser.add_argument('--tier', choices=['watchlist', 'landscape'], help='Scrape all brands at this tier')
    parser.add_argument('--brand', help='Scrape a single brand (deep dive)')
    args = parser.parse_args()

    if args.brand:
        asyncio.run(run_single_brand(args.platform, args.brand))
    elif args.tier:
        asyncio.run(run_tier_scrape(args.platform, args.tier))
    else:
        print("Error: specify --tier or --brand")
        sys.exit(1)


if __name__ == '__main__':
    main()
