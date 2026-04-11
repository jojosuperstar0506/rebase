"""
生意参谋 (SYCM / Tmall Business Advisor) Scraper for OMI Competitive Intelligence.

Covers dimension:
  D7 Channel Authority (渠道权威度/品类占比)

IMPORTANT: 生意参谋 requires an authenticated Tmall seller session.
This scraper provides two approaches:
  1. Browser mode — user must be logged into sycm.taobao.com
  2. Cookie mode — provide session cookies from a logged-in browser

This is the hardest platform to automate because:
  - Requires active Tmall seller account with 生意参谋 subscription
  - Heavy anti-bot protection (UA checks, cookie signing, encrypted params)
  - Data is session-bound and expires quickly

For Aliyun deployment: Use a headless browser (Playwright) with
pre-authenticated session cookies, refreshed periodically via
manual login or browser extension.
"""

import json
import re
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field, asdict

logger = logging.getLogger(__name__)


@dataclass
class SycmBrandData:
    """Structured 生意参谋 data for a single brand."""
    brand_name: str
    scrape_date: str = ""
    scrape_status: str = "pending"

    # D7: Channel Authority
    d7_tmall_rank: str = ""  # e.g., "女包品类 Top 15"
    d7_category_share: str = ""  # e.g., "2.3%"
    d7_monthly_sales_index: str = ""  # Relative index (SYCM doesn't show absolute)
    d7_price_band: str = ""  # e.g., "200-500元"
    d7_top_products: List[Dict[str, str]] = field(default_factory=list)
    d7_traffic_sources: Dict[str, str] = field(default_factory=dict)
    d7_conversion_index: str = ""  # Relative conversion metric
    d7_repeat_purchase_rate: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


class SycmScraper:
    """
    生意参谋 scraper — requires authenticated session.

    Two modes:
      - browser: Navigate sycm.taobao.com in a logged-in browser
      - cookie: Use pre-extracted session cookies for direct HTTP access
    """

    SYCM_BASE = "https://sycm.taobao.com"

    # SYCM competitor analysis endpoints
    ENDPOINTS = {
        "brand_rank": "/custom/ranking/brand",
        "category_share": "/custom/market/overview",
        "product_rank": "/custom/ranking/item",
        "traffic_source": "/custom/market/traffic",
    }

    def __init__(self, mode: str = "browser", cookies: Optional[str] = None):
        """
        Args:
            mode: 'browser' (Playwright with logged-in session) or 'cookie'
            cookies: SYCM session cookie string (for cookie mode)
        """
        self.mode = mode
        self.cookies = cookies

    # ─── Browser Mode ──────────────────────────────────────────────────────

    async def scrape_brand_browser(self, brand: dict, page) -> SycmBrandData:
        """
        Scrape D7 data from 生意参谋 using an authenticated browser session.

        PREREQUISITE: User must already be logged into sycm.taobao.com
        in the browser context provided.
        """
        data = SycmBrandData(
            brand_name=brand["name"],
            scrape_date=datetime.now().strftime("%Y-%m-%d"),
        )

        try:
            # Check if logged in
            await page.goto(self.SYCM_BASE)
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(3000)

            content = await page.accessibility.snapshot()
            text = self._flatten_accessibility_tree(content)

            if "登录" in text and "欢迎" not in text:
                logger.warning("SYCM: Not logged in. Skipping.")
                data.scrape_status = "failed"
                data.d7_tmall_rank = "需要登录生意参谋"
                return data

            # Navigate to market / competitor analysis
            await self._scrape_brand_ranking(brand, page, data)
            await page.wait_for_timeout(2000)

            await self._scrape_category_data(brand, page, data)

            data.scrape_status = "success"
        except Exception as e:
            logger.error(f"SYCM browser scrape failed for {brand['name']}: {e}")
            data.scrape_status = "partial" if data.d7_tmall_rank else "failed"

        return data

    async def _scrape_brand_ranking(self, brand: dict, page, data: SycmBrandData):
        """Navigate to brand ranking page and extract position."""
        # Navigate to competitive analysis section
        url = f"{self.SYCM_BASE}/custom/ranking/brand?brandName={brand['name']}"
        await page.goto(url)
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(3000)

        content = await page.accessibility.snapshot()
        text = self._flatten_accessibility_tree(content)

        # Extract ranking info
        rank_match = re.search(r"(?:排名|排行).*?(\d+)", text)
        if rank_match:
            data.d7_tmall_rank = f"女包品类 Top {rank_match.group(1)}"

        # Extract category share
        share_match = re.search(r"(?:市场份额|占比).*?([\d.]+%)", text)
        if share_match:
            data.d7_category_share = share_match.group(1)

        # Extract sales index
        sales_match = re.search(r"(?:销售指数|交易指数).*?([\d,.]+)", text)
        if sales_match:
            data.d7_monthly_sales_index = sales_match.group(1)

    async def _scrape_category_data(self, brand: dict, page, data: SycmBrandData):
        """Extract category and product-level data."""
        store_name = brand.get("tmall_store", brand["name"])
        url = f"{self.SYCM_BASE}/custom/ranking/item?searchText={store_name}"
        await page.goto(url)
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(3000)

        content = await page.accessibility.snapshot()
        text = self._flatten_accessibility_tree(content)

        # Extract top products
        products = self._extract_top_products(text)
        data.d7_top_products = products[:5]

        # Extract price band
        price_match = re.search(r"(\d{2,4})\s*[-~]\s*(\d{2,4})\s*元", text)
        if price_match:
            data.d7_price_band = f"{price_match.group(1)}-{price_match.group(2)}元"

    # ─── Cookie/API Mode ───────────────────────────────────────────────────

    async def scrape_brand_api(self, brand: dict) -> SycmBrandData:
        """
        Scrape using SYCM session cookies via HTTP.

        This requires fresh session cookies from a logged-in browser.
        Cookies expire quickly, so this is best used with a cookie
        refresh mechanism (e.g., browser extension or scheduled login).
        """
        import httpx

        data = SycmBrandData(
            brand_name=brand["name"],
            scrape_date=datetime.now().strftime("%Y-%m-%d"),
        )

        if not self.cookies:
            logger.warning("SYCM: No cookies provided. Cannot scrape via API.")
            data.scrape_status = "failed"
            data.d7_tmall_rank = "需要提供生意参谋cookies"
            return data

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://sycm.taobao.com/",
            "Cookie": self.cookies,
        }

        try:
            async with httpx.AsyncClient(headers=headers, timeout=30.0,
                                          follow_redirects=True) as client:
                # Brand ranking
                resp = await client.get(
                    f"{self.SYCM_BASE}/custom/ranking/brand",
                    params={"brandName": brand["name"]}
                )
                if resp.status_code == 200:
                    self._parse_ranking_response(resp.text, data)

                # Product ranking
                resp = await client.get(
                    f"{self.SYCM_BASE}/custom/ranking/item",
                    params={"searchText": brand.get("tmall_store", brand["name"])}
                )
                if resp.status_code == 200:
                    self._parse_product_response(resp.text, data)

                data.scrape_status = "success" if data.d7_tmall_rank else "partial"
        except Exception as e:
            logger.error(f"SYCM API scrape failed for {brand['name']}: {e}")
            data.scrape_status = "failed"

        return data

    # ─── Parsing Helpers ───────────────────────────────────────────────────

    @staticmethod
    def _flatten_accessibility_tree(node: dict, depth: int = 0) -> str:
        if not node:
            return ""
        parts = []
        name = node.get("name", "")
        role = node.get("role", "")
        if name:
            parts.append(f"[{role}] {name}")
        for child in node.get("children", []):
            parts.append(SycmScraper._flatten_accessibility_tree(child, depth + 1))
        return "\n".join(parts)

    @staticmethod
    def _extract_top_products(text: str) -> List[Dict[str, str]]:
        """Extract top-selling products from ranking text."""
        products = []
        # Look for product entries with sales data
        for match in re.finditer(
            r"(?:商品|产品).*?[：:]\s*(.+?)(?:\n|$).*?(?:销量|销售).*?([\d,.]+)", text
        ):
            products.append({
                "name": match.group(1).strip()[:50],
                "sales_index": match.group(2),
            })
        return products

    @staticmethod
    def _parse_ranking_response(html: str, data: SycmBrandData):
        """Parse brand ranking page response."""
        rank_match = re.search(r"(?:排名|排行).*?(\d+)", html)
        if rank_match:
            data.d7_tmall_rank = f"女包品类 Top {rank_match.group(1)}"

        share_match = re.search(r"(?:市场份额|占比).*?([\d.]+%)", html)
        if share_match:
            data.d7_category_share = share_match.group(1)

        sales_match = re.search(r"(?:销售指数|交易指数).*?([\d,.]+)", html)
        if sales_match:
            data.d7_monthly_sales_index = sales_match.group(1)

    @staticmethod
    def _parse_product_response(html: str, data: SycmBrandData):
        """Parse product ranking page response."""
        products = []
        for match in re.finditer(r'"itemTitle":\s*"([^"]+)".*?"tradeIndex":\s*"?([\d,.]+)"?', html):
            products.append({
                "name": match.group(1)[:50],
                "sales_index": match.group(2),
            })
        data.d7_top_products = products[:5]

        price_match = re.search(r'"priceRange":\s*"(\d+-\d+)"', html)
        if price_match:
            data.d7_price_band = price_match.group(1) + "元"
