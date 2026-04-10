"""
Orchestrator for OMI Competitive Intelligence scraping pipeline.

Coordinates all scrapers, merges data into unified 7-dimension JSON,
and optionally pushes to GitHub for Vercel auto-deploy.

Usage:
  # Full scrape (all 20 brands, all platforms)
  python -m services.competitor-intel.orchestrator --full

  # Single brand
  python -m services.competitor-intel.orchestrator --brand "CASSILE"

  # Specific platform only
  python -m services.competitor-intel.orchestrator --platform xhs

  # Dry run (no file writes)
  python -m services.competitor-intel.orchestrator --dry-run
"""

import asyncio
import json
import logging
import os
import sys
import argparse
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from .config import (
    BRAND_GROUPS, SCRAPE_PRIORITY, DATA_DIR, HTML_OUTPUT_DIR,
    GITHUB_REPO, GITHUB_TOKEN, GIT_BRANCH, get_all_brands, get_brand_by_name,
)
from .scrapers.xhs_scraper import XhsScraper, XhsBrandData
from .scrapers.douyin_scraper import DouyinScraper, DouyinBrandData
from .scrapers.sycm_scraper import SycmScraper, SycmBrandData

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


class CompetitorIntelOrchestrator:
    """
    Main orchestrator that runs all scrapers and produces unified output.
    """

    def __init__(
        self,
        mode: str = "api",
        xhs_cookies: Optional[str] = None,
        douyin_cookies: Optional[str] = None,
        sycm_cookies: Optional[str] = None,
        proxy: Optional[str] = None,
        playwright_browser=None,
        profile_dir: Optional[str] = None,
    ):
        """
        Args:
            mode: 'browser' (Cowork/Playwright) or 'api' (Aliyun)
            xhs_cookies: XHS session cookies (optional if profile_dir is set)
            douyin_cookies: Douyin session cookies (optional if profile_dir is set)
            sycm_cookies: 生意参谋 session cookies (optional if profile_dir is set)
            proxy: Proxy URL for API mode
            playwright_browser: Playwright Browser instance (browser mode, e.g. Cowork)
            profile_dir: Path to persistent Chrome profile directory. When set,
                         the scraper reuses an existing logged-in Chrome session —
                         no cookie extraction needed. Run setup_profiles.py once to
                         log in and save the profile.
        """
        self.mode = mode
        self.xhs_scraper = XhsScraper(mode=mode, cookies=xhs_cookies, proxy=proxy)
        self.douyin_scraper = DouyinScraper(mode=mode, cookies=douyin_cookies, proxy=proxy)
        self.sycm_scraper = SycmScraper(mode=mode, cookies=sycm_cookies)
        self.browser = playwright_browser
        self.profile_dir = profile_dir
        self._playwright = None  # held open for cleanup when using profile_dir
        self.results: Dict[str, dict] = {}

    async def _launch_persistent_browser(self):
        """
        Launch Chrome using a saved profile directory.

        The profile retains login sessions for XHS, Douyin, and SYCM so no
        cookie strings are needed. The browser window is visible (headless=False)
        to appear more human-like and avoid bot detection.

        Call setup_profiles.py once to create and populate the profile.
        """
        from playwright.async_api import async_playwright

        logger.info(f"Launching persistent browser from profile: {self.profile_dir}")
        self._playwright = await async_playwright().start()
        context = await self._playwright.chromium.launch_persistent_context(
            user_data_dir=self.profile_dir,
            headless=False,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-first-run",
                "--no-default-browser-check",
            ],
            viewport={"width": 1280, "height": 800},
        )
        return context

    async def run_full_scrape(
        self,
        brands: Optional[List[str]] = None,
        platforms: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Run complete scraping pipeline for all (or specified) brands.

        Args:
            brands: List of brand names to scrape. None = all 20.
            platforms: List of platforms ['xhs', 'douyin', 'sycm']. None = all.

        Returns:
            Complete JSON data structure with all 7 dimensions per brand.
        """
        all_brands = get_all_brands()
        if brands:
            all_brands = [b for b in all_brands if b["name"] in brands]

        # Sort by strategic priority
        priority_map = {name: i for i, name in enumerate(SCRAPE_PRIORITY)}
        all_brands.sort(key=lambda b: priority_map.get(b["name"], 999))

        platforms = platforms or ["xhs", "douyin", "sycm"]

        logger.info(f"Starting scrape: {len(all_brands)} brands, platforms: {platforms}")

        page = None
        context = None
        if self.mode == "browser":
            if self.browser:
                # Externally provided browser (Cowork / Claude for Chrome)
                page = await self.browser.new_page()
            elif self.profile_dir:
                # Persistent profile mode (Joanna's laptop — no cookies needed)
                context = await self._launch_persistent_browser()
                page = context.pages[0] if context.pages else await context.new_page()

        for i, brand in enumerate(all_brands):
            logger.info(f"[{i+1}/{len(all_brands)}] Scraping {brand['name']}...")
            brand_data = await self._scrape_single_brand(brand, platforms, page)
            self.results[brand["name"]] = brand_data

        if page:
            await page.close()
        if context:
            await context.close()
        if self._playwright:
            await self._playwright.stop()
            self._playwright = None

        # Assemble final output
        output = self._assemble_output()
        logger.info(f"Scrape complete. {len(self.results)} brands processed.")
        return output

    async def run_single_brand(self, brand_name: str,
                                platforms: Optional[List[str]] = None) -> dict:
        """Scrape a single brand."""
        brand = get_brand_by_name(brand_name)
        if not brand:
            raise ValueError(f"Unknown brand: {brand_name}")

        platforms = platforms or ["xhs", "douyin", "sycm"]

        page = None
        context = None
        if self.mode == "browser":
            if self.browser:
                page = await self.browser.new_page()
            elif self.profile_dir:
                context = await self._launch_persistent_browser()
                page = context.pages[0] if context.pages else await context.new_page()

        brand_data = await self._scrape_single_brand(brand, platforms, page)
        self.results[brand_name] = brand_data

        if page:
            await page.close()
        if context:
            await context.close()
        if self._playwright:
            await self._playwright.stop()
            self._playwright = None

        return brand_data

    async def _scrape_single_brand(
        self, brand: dict, platforms: List[str], page=None
    ) -> dict:
        """Scrape all platforms for one brand and merge into 7-dim structure."""

        xhs_data = None
        douyin_data = None
        sycm_data = None

        # XHS: D1, D2, D3, D4 (partial), D6
        if "xhs" in platforms:
            try:
                if self.mode == "browser" and page:
                    xhs_data = await self.xhs_scraper.scrape_brand_browser(brand, page)
                else:
                    xhs_data = await self.xhs_scraper.scrape_brand_api(brand)
                logger.info(f"  XHS: {xhs_data.scrape_status}")
            except Exception as e:
                logger.error(f"  XHS failed: {e}")

        # Douyin: D1 (supplement), D2 (supplement), D4, D5
        if "douyin" in platforms:
            try:
                if self.mode == "browser" and page:
                    douyin_data = await self.douyin_scraper.scrape_brand_browser(brand, page)
                else:
                    douyin_data = await self.douyin_scraper.scrape_brand_api(brand)
                logger.info(f"  Douyin: {douyin_data.scrape_status}")
            except Exception as e:
                logger.error(f"  Douyin failed: {e}")

        # SYCM: D7
        if "sycm" in platforms:
            try:
                if self.mode == "browser" and page:
                    sycm_data = await self.sycm_scraper.scrape_brand_browser(brand, page)
                else:
                    sycm_data = await self.sycm_scraper.scrape_brand_api(brand)
                logger.info(f"  SYCM: {sycm_data.scrape_status}")
            except Exception as e:
                logger.error(f"  SYCM failed: {e}")

        # Merge into unified 7-dimension structure
        return self._merge_brand_data(brand, xhs_data, douyin_data, sycm_data)

    def _merge_brand_data(
        self,
        brand: dict,
        xhs: Optional[XhsBrandData],
        douyin: Optional[DouyinBrandData],
        sycm: Optional[SycmBrandData],
    ) -> dict:
        """
        Merge data from all platforms into a unified 7-dimension structure.
        """
        now = datetime.now().strftime("%Y-%m-%d")

        merged = {
            "brand_name": brand["name"],
            "brand_name_en": brand.get("name_en", ""),
            "group": brand.get("group", ""),
            "group_name": brand.get("group_name", ""),
            "badge": brand.get("badge", ""),
            "scrape_date": now,
            "scrape_status": {
                "xhs": xhs.scrape_status if xhs else "skipped",
                "douyin": douyin.scrape_status if douyin else "skipped",
                "sycm": sycm.scrape_status if sycm else "skipped",
            },

            # ─── D1: Brand Search Index ───────────────────────────────
            "d1_brand_search_index": {
                "xhs_suggestions": xhs.d1_search_suggestions if xhs else [],
                "xhs_related": xhs.d1_related_searches if xhs else [],
                "douyin_suggestions": douyin.d1_search_suggestions if douyin else [],
                "douyin_trending": douyin.d1_trending_topics if douyin else [],
            },

            # ─── D2: Brand Voice Volume ───────────────────────────────
            "d2_brand_voice_volume": {
                "xhs": {
                    "followers": xhs.d2_official_followers if xhs else 0,
                    "notes": xhs.d2_total_notes if xhs else 0,
                    "likes": xhs.d2_total_likes if xhs else 0,
                    "account_name": xhs.d2_official_account_name if xhs else "",
                    "account_id": xhs.d2_official_account_id if xhs else "",
                },
                "douyin": {
                    "followers": douyin.d2_official_followers if douyin else 0,
                    "videos": douyin.d2_total_videos if douyin else 0,
                    "likes": douyin.d2_total_likes if douyin else 0,
                    "account_name": douyin.d2_official_account_name if douyin else "",
                    "account_id": douyin.d2_official_account_id if douyin else "",
                    "verified": douyin.d2_verified if douyin else False,
                },
            },

            # ─── D3: Content Strategy DNA ─────────────────────────────
            "d3_content_strategy": {
                "content_types": xhs.d3_content_types if xhs else {},
                "top_notes": xhs.d3_top_notes if xhs else [],
                "posting_frequency": xhs.d3_posting_frequency if xhs else "",
                "avg_engagement": xhs.d3_avg_engagement if xhs else "",
            },

            # ─── D4: Celebrity/KOL Ecosystem ──────────────────────────
            "d4_kol_ecosystem": {
                "xhs_kols": xhs.d4_top_kols if xhs else [],
                "xhs_collab_count": xhs.d4_collab_count if xhs else 0,
                "xhs_celebrity_mentions": xhs.d4_celebrity_mentions if xhs else [],
                "douyin_creators": douyin.d4_top_creators if douyin else [],
                "douyin_mentions_count": douyin.d4_brand_mentions_count if douyin else 0,
                "douyin_hashtag_views": douyin.d4_hashtag_views if douyin else {},
            },

            # ─── D5: Social Commerce Engine ───────────────────────────
            "d5_social_commerce": {
                "live_status": douyin.d5_live_status if douyin else "unknown",
                "live_viewers": douyin.d5_live_viewers if douyin else 0,
                "shop_product_count": douyin.d5_shop_product_count if douyin else 0,
                "live_frequency": douyin.d5_live_frequency if douyin else "",
                "avg_live_viewers": douyin.d5_avg_live_viewers if douyin else "",
                "top_selling_products": douyin.d5_top_selling_products if douyin else [],
            },

            # ─── D6: Consumer Mindshare ───────────────────────────────
            "d6_consumer_mindshare": {
                "sentiment_keywords": xhs.d6_sentiment_keywords if xhs else [],
                "positive_keywords": xhs.d6_positive_keywords if xhs else [],
                "negative_keywords": xhs.d6_negative_keywords if xhs else [],
                "ugc_samples": xhs.d6_ugc_sample_notes if xhs else [],
            },

            # ─── D7: Channel Authority ────────────────────────────────
            "d7_channel_authority": {
                "tmall_rank": sycm.d7_tmall_rank if sycm else "",
                "category_share": sycm.d7_category_share if sycm else "",
                "monthly_sales_index": sycm.d7_monthly_sales_index if sycm else "",
                "price_band": sycm.d7_price_band if sycm else "",
                "top_products": sycm.d7_top_products if sycm else [],
                "traffic_sources": sycm.d7_traffic_sources if sycm else {},
                "conversion_index": sycm.d7_conversion_index if sycm else "",
            },
        }

        return merged

    def _assemble_output(self) -> Dict[str, Any]:
        """Assemble all brand results into the final JSON output structure."""
        output = {
            "scrape_date": datetime.now().strftime("%Y-%m-%d"),
            "scrape_version": "7dim-v1",
            "dashboard_html": "/competitor-intel.html",
            "brands_count": len(self.results),
            "groups": {},
            "brands": {},
        }

        # Build group structure
        for group_key, group in BRAND_GROUPS.items():
            output["groups"][group_key] = {
                "name": group["name"],
                "subtitle": group["subtitle"],
                "brands": [b["name"] for b in group["brands"]],
            }

        # Add brand data
        for brand_name, brand_data in self.results.items():
            output["brands"][brand_name] = brand_data

        return output

    def save_json(self, output: dict, output_dir: Optional[str] = None):
        """Save output to JSON files (dated + latest)."""
        output_dir = output_dir or DATA_DIR
        os.makedirs(output_dir, exist_ok=True)

        date_str = datetime.now().strftime("%Y-%m-%d")
        dated_path = os.path.join(output_dir, f"competitors_{date_str}.json")
        latest_path = os.path.join(output_dir, "competitors_latest.json")

        for path in [dated_path, latest_path]:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(output, f, ensure_ascii=False, indent=2)
            logger.info(f"Saved: {path}")

    async def push_to_github(self, output: dict):
        """Push updated JSON to GitHub repo for Vercel auto-deploy."""
        if not GITHUB_TOKEN:
            logger.warning("No GITHUB_TOKEN set. Skipping GitHub push.")
            return

        try:
            import subprocess

            # Save files first
            self.save_json(output)

            # Also export enriched JSON (with scores + narratives) for Vercel static fallback
            try:
                from .storage import init_db, export_dashboard_json
                conn = init_db()
                vercel_json_path = os.path.join(
                    os.path.dirname(__file__), "..", "..",
                    "frontend", "public", "data", "competitors",
                    "competitors_latest.json",
                )
                export_dashboard_json(conn, vercel_json_path)
                conn.close()
                logger.info(f"Exported enriched Vercel JSON: {vercel_json_path}")
            except Exception as e:
                logger.warning(f"Failed to export enriched JSON: {e}")

            date_str = datetime.now().strftime("%Y-%m-%d")
            files_to_add = [
                f"{DATA_DIR}/competitors_{date_str}.json",
                f"{DATA_DIR}/competitors_latest.json",
                "frontend/public/data/competitors/competitors_latest.json",
            ]

            # Git operations
            subprocess.run(["git", "add"] + files_to_add, check=True)
            subprocess.run(
                ["git", "commit", "-m",
                 f"chore: update competitor intelligence data ({date_str})"],
                check=True,
            )
            subprocess.run(
                ["git", "push", "origin", GIT_BRANCH],
                check=True,
            )
            logger.info(f"Pushed to GitHub: {GITHUB_REPO}/{GIT_BRANCH}")
        except subprocess.CalledProcessError as e:
            logger.error(f"Git push failed: {e}")
        except ImportError:
            logger.error("subprocess not available")


# ─── CLI Entry Point ──────────────────────────────────────────────────────────

async def main():
    parser = argparse.ArgumentParser(description="OMI Competitive Intelligence Scraper")
    parser.add_argument("--full", action="store_true", help="Full scrape of all 20 brands")
    parser.add_argument("--brand", type=str, help="Scrape a single brand by name")
    parser.add_argument("--platform", type=str, help="Comma-separated platforms: xhs,douyin,sycm")
    parser.add_argument("--mode", type=str, default="api", choices=["api", "browser"],
                        help="Scraping mode")
    parser.add_argument("--dry-run", action="store_true", help="Don't write files")
    parser.add_argument("--output-dir", type=str, help="Custom output directory")
    parser.add_argument("--xhs-cookies", type=str, help="XHS cookie string")
    parser.add_argument("--douyin-cookies", type=str, help="Douyin cookie string")
    parser.add_argument("--sycm-cookies", type=str, help="SYCM cookie string")
    parser.add_argument("--proxy", type=str, help="Proxy URL for API mode")
    parser.add_argument("--push", action="store_true", help="Push to GitHub after scrape")
    parser.add_argument(
        "--profile-dir", type=str,
        help="Path to persistent Chrome profile directory (no cookies needed). "
             "Run setup_profiles.py once to create it. Also reads SCRAPER_PROFILE_DIR from .env.",
    )

    args = parser.parse_args()

    platforms = args.platform.split(",") if args.platform else None

    # Resolve profile dir — CLI flag takes precedence over .env
    profile_dir = args.profile_dir or os.environ.get("SCRAPER_PROFILE_DIR", "")

    # Auto-switch to browser mode when a profile dir is configured
    mode = args.mode
    if profile_dir and mode == "api":
        mode = "browser"
        logger.info(f"SCRAPER_PROFILE_DIR detected — switching to browser mode automatically")

    orchestrator = CompetitorIntelOrchestrator(
        mode=mode,
        xhs_cookies=args.xhs_cookies or os.environ.get("XHS_COOKIES", ""),
        douyin_cookies=args.douyin_cookies or os.environ.get("DOUYIN_COOKIES", ""),
        sycm_cookies=args.sycm_cookies or os.environ.get("SYCM_COOKIES", ""),
        proxy=args.proxy or os.environ.get("SCRAPER_PROXY", ""),
        profile_dir=profile_dir or None,
    )

    if args.brand:
        result = await orchestrator.run_single_brand(args.brand, platforms)
        output = orchestrator._assemble_output()
    elif args.full:
        output = await orchestrator.run_full_scrape(platforms=platforms)
    else:
        # Default: scrape priority brands
        priority = SCRAPE_PRIORITY[:5]  # Top 5 priorities
        output = await orchestrator.run_full_scrape(brands=priority, platforms=platforms)

    if not args.dry_run:
        orchestrator.save_json(output, args.output_dir)
        if args.push:
            await orchestrator.push_to_github(output)

        # Push to PostgreSQL for the live SaaS dashboard
        # Non-fatal: if DB push fails, JSON files are still written
        try:
            from .db_push import push_scrape_results_sync
            # Load scores and narratives from the enriched Vercel JSON if available
            import json as _json
            from pathlib import Path
            vercel_json = Path(__file__).parent.parent.parent / "frontend" / "public" / "data" / "competitors" / "competitors_latest.json"
            scores = None
            narratives = None
            if vercel_json.exists():
                with open(vercel_json, encoding="utf-8") as f:
                    enriched = _json.load(f)
                scores = enriched.get("scores")
                narratives = enriched.get("narratives")
            push_scrape_results_sync(output, scores=scores, narratives=narratives)
        except Exception as e:
            logger.warning(f"PostgreSQL push skipped: {e}")
    else:
        print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
