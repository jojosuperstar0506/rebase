"""
Recovery tool: re-extract cookies from a saved browser profile and push to DB.

Use this only if setup_profiles ran but the DB push failed (e.g. SSH tunnel
wasn't open at the time). Normal flow is setup_profiles → cookies auto-pushed.

Usage:
  python -m services.competitor_intel.push_cookies --platform douyin
  python -m services.competitor_intel.push_cookies --platform xhs
"""

import asyncio
import argparse
import os
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

PROFILE_DIR = os.environ.get(
    "SCRAPER_PROFILE_DIR",
    str(Path.home() / "rebase-scraper-profile"),
)

PLATFORM_URLS = {
    "douyin": "https://www.douyin.com",
    "xhs": "https://www.xiaohongshu.com",
    "sycm": "https://sycm.taobao.com",
}


async def extract_cookies(platform: str) -> str:
    """Open the saved profile headlessly and read cookies for the platform."""
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("[ERROR] playwright not installed — run: pip install playwright")
        sys.exit(1)

    url = PLATFORM_URLS[platform]
    print(f"[INFO] Reading {platform} cookies from profile: {PROFILE_DIR}")

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=PROFILE_DIR,
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        try:
            cookies = await context.cookies([url])
        finally:
            await context.close()

    if not cookies:
        print(f"[WARN] No cookies for {url} — run setup_profiles first.")
        return ""

    cookie_str = "; ".join(f"{c['name']}={c['value']}" for c in cookies)
    print(f"[OK]   {len(cookies)} cookies extracted for {platform}")
    return cookie_str


async def main():
    parser = argparse.ArgumentParser(
        description="Re-push platform cookies from saved profile to DB (recovery tool)"
    )
    parser.add_argument(
        "--platform", choices=["douyin", "xhs", "sycm"], required=True
    )
    args = parser.parse_args()

    cookie_str = await extract_cookies(args.platform)
    if not cookie_str:
        sys.exit(1)

    from .db_bridge import save_platform_connection
    ok = save_platform_connection(args.platform, cookie_str)
    if not ok:
        sys.exit(1)

    print(f"\nDone. Now run:")
    print(f"  python -m services.competitor_intel.scrape_runner --platform {args.platform} --tier watchlist")


if __name__ == "__main__":
    asyncio.run(main())
