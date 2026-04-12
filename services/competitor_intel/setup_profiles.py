"""
One-time setup script: log into XHS, Douyin, and SYCM and save the browser session.

After running this, set SCRAPER_PROFILE_DIR in your .env and the orchestrator
will reuse the saved login — no cookie extraction ever needed again.

Usage:
  # Set up all three platforms (recommended first time)
  python -m services.competitor-intel.setup_profiles

  # Set up a single platform (e.g. after XHS session expires)
  python -m services.competitor-intel.setup_profiles --platform xhs
  python -m services.competitor-intel.setup_profiles --platform douyin
  python -m services.competitor-intel.setup_profiles --platform sycm

  # Use a custom profile directory
  python -m services.competitor-intel.setup_profiles --profile-dir D:/my-scraper-profile
"""

import asyncio
import argparse
import os
import sys
from pathlib import Path

# Default profile directory — can be overridden via --profile-dir or SCRAPER_PROFILE_DIR
DEFAULT_PROFILE_DIR = os.environ.get(
    "SCRAPER_PROFILE_DIR",
    str(Path.home() / "rebase-scraper-profile"),
)

PLATFORMS = {
    "xhs": {
        "name": "小红书 (XHS / RedNote)",
        "url": "https://www.xiaohongshu.com/explore",
        "instructions": [
            "Click the login button in the top-right corner",
            "Scan the QR code with your XHS mobile app",
            "Wait until the page reloads and shows your profile",
        ],
    },
    "douyin": {
        "name": "抖音 (Douyin)",
        "url": "https://www.douyin.com",
        "instructions": [
            "Click '登录' (Login) in the top-right corner",
            "Scan the QR code with your Douyin mobile app",
            "Wait until the page reloads and shows your profile",
        ],
    },
    "sycm": {
        "name": "生意参谋 (SYCM / Alibaba Business Advisor)",
        "url": "https://sycm.taobao.com",
        "instructions": [
            "Log in with your Tmall/Taobao seller account",
            "Complete any verification if prompted",
            "Wait until the 生意参谋 dashboard loads",
        ],
    },
}


def print_separator():
    print("=" * 60)


async def setup_platform(platform_key: str, profile_dir: str):
    """Open a browser window for the user to log into one platform."""
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("\nERROR: Playwright is not installed.")
        print("Run:  pip install playwright && playwright install chromium")
        sys.exit(1)

    platform = PLATFORMS[platform_key]

    print_separator()
    print(f"  Platform: {platform['name']}")
    print(f"  Profile:  {profile_dir}")
    print_separator()
    print("\nA Chrome window will open. Please:")
    for i, step in enumerate(platform["instructions"], 1):
        print(f"  {i}. {step}")
    print("\nOnce you are logged in, come back here and press Enter.")
    print()

    async with async_playwright() as p:
        context = await p.chromium.launch_persistent_context(
            user_data_dir=profile_dir,
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-first-run",
                "--no-default-browser-check",
            ],
            viewport={"width": 1280, "height": 800},
        )

        # Use existing tab or open a new one
        page = context.pages[0] if context.pages else await context.new_page()
        await page.goto(platform["url"])

        # Wait for user to log in
        input(f"Press Enter after logging into {platform['name']}... ")

        # Session is automatically saved to the profile directory on close
        await context.close()

    print(f"✓ {platform['name']} session saved.\n")


async def main():
    parser = argparse.ArgumentParser(
        description="Set up persistent browser profiles for the OMI competitor scraper.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m services.competitor-intel.setup_profiles
  python -m services.competitor-intel.setup_profiles --platform xhs
  python -m services.competitor-intel.setup_profiles --profile-dir D:/scraper-profile
        """,
    )
    parser.add_argument(
        "--platform",
        choices=["xhs", "douyin", "sycm", "all"],
        default="all",
        help="Which platform to set up (default: all)",
    )
    parser.add_argument(
        "--profile-dir",
        type=str,
        default=DEFAULT_PROFILE_DIR,
        help=f"Path to browser profile directory (default: {DEFAULT_PROFILE_DIR})",
    )
    args = parser.parse_args()

    profile_dir = args.profile_dir
    Path(profile_dir).mkdir(parents=True, exist_ok=True)

    platforms_to_setup = list(PLATFORMS.keys()) if args.platform == "all" else [args.platform]

    print()
    print_separator()
    print("  Rebase Competitor Intelligence — Profile Setup")
    print_separator()
    print(f"\nBrowser sessions will be saved to:")
    print(f"  {profile_dir}")
    print(f"\nPlatforms to set up: {', '.join(platforms_to_setup)}")
    print()

    for platform_key in platforms_to_setup:
        await setup_platform(platform_key, profile_dir)

    print_separator()
    print("  Setup complete!")
    print_separator()
    print(f"\nAdd this line to your .env file:")
    print(f"\n  SCRAPER_PROFILE_DIR={profile_dir}")
    print(f"\nThen run the scraper:")
    print(f"\n  python -m services.competitor-intel.orchestrator --full --push")
    print()


if __name__ == "__main__":
    asyncio.run(main())
