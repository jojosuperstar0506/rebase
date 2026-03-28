"""
Douyin (抖音) Scraper for OMI Competitive Intelligence.

Covers dimensions:
  D1 Brand Search Index — search suggestions and trending
  D2 Brand Voice Volume — follower count, video count, likes
  D4 Celebrity/KOL Ecosystem — top creator collaborations
  D5 Social Commerce Engine — live commerce data

Two execution modes:
  1. Browser mode (Cowork/Playwright) — uses read_page accessibility tree
  2. API mode (Aliyun) — uses httpx for Douyin web endpoints

Note: Douyin blocks javascript_tool execution. Always use
read_page / accessibility tree approach for browser mode.
"""

import json
import re
import time
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field, asdict

logger = logging.getLogger(__name__)


@dataclass
class DouyinBrandData:
    """Structured Douyin data for a single brand."""
    brand_name: str
    scrape_date: str = ""
    scrape_status: str = "pending"

    # D1: Search Index
    d1_search_suggestions: List[str] = field(default_factory=list)
    d1_trending_topics: List[str] = field(default_factory=list)

    # D2: Voice Volume
    d2_official_followers: int = 0
    d2_total_videos: int = 0
    d2_total_likes: int = 0
    d2_official_account_id: str = ""
    d2_official_account_name: str = ""
    d2_verified: bool = False

    # D4: KOL/Creator Ecosystem
    d4_top_creators: List[Dict[str, str]] = field(default_factory=list)
    d4_brand_mentions_count: int = 0
    d4_hashtag_views: Dict[str, str] = field(default_factory=dict)

    # D5: Social Commerce / Live
    d5_live_status: str = ""  # "live_now" | "scheduled" | "offline"
    d5_live_viewers: int = 0
    d5_shop_product_count: int = 0
    d5_live_frequency: str = ""
    d5_avg_live_viewers: str = ""
    d5_top_selling_products: List[Dict[str, str]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


class DouyinScraper:
    """
    Douyin scraper with browser and API backends.
    """

    def __init__(self, mode: str = "api", cookies: Optional[str] = None,
                 proxy: Optional[str] = None):
        self.mode = mode
        self.cookies = cookies
        self.proxy = proxy

    # ─── Browser Mode ──────────────────────────────────────────────────────

    async def scrape_brand_browser(self, brand: dict, page) -> DouyinBrandData:
        """
        Scrape brand data using Playwright browser page.
        Uses accessibility tree (read_page) — NOT javascript_tool.
        """
        data = DouyinBrandData(
            brand_name=brand["name"],
            scrape_date=datetime.now().strftime("%Y-%m-%d"),
        )

        try:
            # D1 + D2: Search for brand
            await self._scrape_douyin_search_browser(brand, page, data)
            time.sleep(3)  # Douyin needs longer delays

            # D2 + D5: Official profile
            if data.d2_official_account_id:
                await self._scrape_douyin_profile_browser(data.d2_official_account_id, page, data)
                time.sleep(3)

            # D4: Hashtag/topic search
            await self._scrape_douyin_hashtag_browser(brand, page, data)

            data.scrape_status = "success"
        except Exception as e:
            logger.error(f"Douyin browser scrape failed for {brand['name']}: {e}")
            data.scrape_status = "partial" if data.d2_official_followers > 0 else "failed"

        return data

    async def _scrape_douyin_search_browser(self, brand: dict, page, data: DouyinBrandData):
        """Search Douyin for brand and extract user results."""
        keyword = brand["douyin_keyword"]
        url = f"https://www.douyin.com/search/{keyword}?type=user"

        await page.goto(url)
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(4000)

        # Use accessibility tree — NOT javascript_tool (blocked by Douyin)
        content = await page.accessibility.snapshot()
        text = self._flatten_accessibility_tree(content)

        # D1: Search suggestions
        data.d1_search_suggestions = self._extract_search_suggestions(text)

        # D2: Find official account
        official = self._find_official_account(text, brand)
        if official:
            data.d2_official_account_id = official.get("id", "")
            data.d2_official_account_name = official.get("name", "")
            data.d2_official_followers = official.get("followers", 0)
            data.d2_verified = official.get("verified", False)

    async def _scrape_douyin_profile_browser(self, account_id: str, page, data: DouyinBrandData):
        """Scrape official profile for D2 metrics and D5 live commerce data."""
        url = f"https://www.douyin.com/user/{account_id}"
        await page.goto(url)
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(4000)

        content = await page.accessibility.snapshot()
        text = self._flatten_accessibility_tree(content)

        # D2: Profile metrics
        data.d2_official_followers = self._extract_number(text, r"(\d[\d,.]*[万w]?)\s*(?:粉丝|关注者)", data.d2_official_followers)
        data.d2_total_videos = self._extract_number(text, r"(\d[\d,.]*)\s*(?:作品|视频)", 0)
        data.d2_total_likes = self._extract_number(text, r"(\d[\d,.]*[万w]?)\s*(?:获赞|喜欢)", 0)

        # D5: Live status
        if "直播中" in text or "LIVE" in text:
            data.d5_live_status = "live_now"
            viewers_match = re.search(r"(\d[\d,.]*)\s*(?:观看|在线)", text)
            if viewers_match:
                data.d5_live_viewers = self._extract_number(text, r"(\d[\d,.]*)\s*(?:观看|在线)", 0)
        elif "预告" in text or "即将开播" in text:
            data.d5_live_status = "scheduled"
        else:
            data.d5_live_status = "offline"

        # D5: Shop products
        shop_match = re.search(r"(\d+)\s*(?:商品|件商品|橱窗)", text)
        if shop_match:
            data.d5_shop_product_count = int(shop_match.group(1))

    async def _scrape_douyin_hashtag_browser(self, brand: dict, page, data: DouyinBrandData):
        """Scrape hashtag/topic pages for D4 KOL data."""
        keyword = brand["douyin_keyword"]
        url = f"https://www.douyin.com/search/{keyword}?type=video"

        await page.goto(url)
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(3000)

        content = await page.accessibility.snapshot()
        text = self._flatten_accessibility_tree(content)

        # D4: Extract creator names from video results
        creators = self._extract_creators(text)
        data.d4_top_creators = creators[:10]
        data.d4_brand_mentions_count = len(creators)

        # Hashtag views
        hashtag = f"#{keyword}#"
        view_match = re.search(rf"{re.escape(hashtag)}\s*(\d[\d,.]*[万亿w]?)\s*(?:播放|次播放|views)", text)
        if view_match:
            data.d4_hashtag_views[hashtag] = view_match.group(1)

    # ─── API Mode (Aliyun Cloud) ───────────────────────────────────────────

    async def scrape_brand_api(self, brand: dict) -> DouyinBrandData:
        """
        Scrape brand using Douyin web API endpoints.
        For Aliyun deployment with cookie auth.
        """
        import httpx

        data = DouyinBrandData(
            brand_name=brand["name"],
            scrape_date=datetime.now().strftime("%Y-%m-%d"),
        )

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://www.douyin.com/",
            "Cookie": self.cookies or "",
        }
        proxy_config = {"https://": self.proxy} if self.proxy else None

        try:
            async with httpx.AsyncClient(headers=headers, proxies=proxy_config,
                                          timeout=30.0, follow_redirects=True) as client:
                # Search for brand
                await self._scrape_douyin_search_api(brand, client, data)
                await self._rate_limit_delay()

                # Profile if found
                if data.d2_official_account_id:
                    await self._scrape_douyin_profile_api(data.d2_official_account_id, client, data)
                    await self._rate_limit_delay()

                # Video search for KOL data
                await self._scrape_douyin_videos_api(brand, client, data)

                data.scrape_status = "success"
        except Exception as e:
            logger.error(f"Douyin API scrape failed for {brand['name']}: {e}")
            data.scrape_status = "partial" if data.d2_official_followers > 0 else "failed"

        return data

    async def _scrape_douyin_search_api(self, brand: dict, client, data: DouyinBrandData):
        """Search Douyin via web endpoint."""
        keyword = brand["douyin_keyword"]
        # Douyin web search endpoint (renders server-side)
        url = f"https://www.douyin.com/search/{keyword}?type=user"
        resp = await client.get(url)
        if resp.status_code == 200:
            html = resp.text
            # Extract from SSR HTML or embedded JSON
            self._parse_douyin_search_html(html, brand, data)

    async def _scrape_douyin_profile_api(self, account_id: str, client, data: DouyinBrandData):
        """Fetch profile page for metrics."""
        url = f"https://www.douyin.com/user/{account_id}"
        resp = await client.get(url)
        if resp.status_code == 200:
            html = resp.text
            self._parse_douyin_profile_html(html, data)

    async def _scrape_douyin_videos_api(self, brand: dict, client, data: DouyinBrandData):
        """Search videos for KOL collaboration data."""
        keyword = brand["douyin_keyword"]
        url = f"https://www.douyin.com/search/{keyword}?type=video"
        resp = await client.get(url)
        if resp.status_code == 200:
            creators = self._extract_creators(resp.text)
            data.d4_top_creators = creators[:10]
            data.d4_brand_mentions_count = len(creators)

    # ─── Parsing Helpers ───────────────────────────────────────────────────

    @staticmethod
    def _flatten_accessibility_tree(node: dict, depth: int = 0) -> str:
        """Flatten Playwright accessibility snapshot into text."""
        if not node:
            return ""
        parts = []
        name = node.get("name", "")
        role = node.get("role", "")
        if name:
            parts.append(f"[{role}] {name}")
        for child in node.get("children", []):
            parts.append(DouyinScraper._flatten_accessibility_tree(child, depth + 1))
        return "\n".join(parts)

    @staticmethod
    def _extract_search_suggestions(text: str) -> List[str]:
        """Extract search suggestions from page text."""
        suggestions = []
        for line in text.split("\n"):
            if "猜你想搜" in line or "相关搜索" in line or "热门搜索" in line:
                continue
            match = re.search(r"\[link\]\s*(.+)", line)
            if match and len(match.group(1)) < 30:
                suggestions.append(match.group(1).strip())
        return suggestions[:10]

    @staticmethod
    def _find_official_account(text: str, brand: dict) -> Optional[dict]:
        """Find official brand account in Douyin search results."""
        name = brand["name"]
        name_en = brand.get("name_en", "")

        lines = text.split("\n")
        for i, line in enumerate(lines):
            # Look for verified brand accounts
            if ("认证" in line or "蓝V" in line or "官方" in line) and \
               (name in line or name_en.lower() in line.lower()):
                # Try to extract follower count from nearby lines
                followers = 0
                for j in range(max(0, i - 3), min(len(lines), i + 5)):
                    f_match = re.search(r"(\d[\d,.]*[万w]?)\s*(?:粉丝|followers)", lines[j])
                    if f_match:
                        followers = DouyinScraper._extract_number(
                            lines[j], r"(\d[\d,.]*[万w]?)\s*(?:粉丝|followers)", 0
                        )
                        break

                # Try to extract user ID from link
                user_id = ""
                for j in range(max(0, i - 3), min(len(lines), i + 5)):
                    id_match = re.search(r"/user/([A-Za-z0-9_-]+)", lines[j])
                    if id_match:
                        user_id = id_match.group(1)
                        break

                return {
                    "name": name,
                    "id": user_id,
                    "followers": followers,
                    "verified": True,
                }
        return None

    @staticmethod
    def _parse_douyin_search_html(html: str, brand: dict, data: DouyinBrandData):
        """Parse Douyin SSR HTML for search results."""
        # Douyin embeds state in RENDER_DATA script
        render_match = re.search(r'<script id="RENDER_DATA"[^>]*>(.+?)</script>', html)
        if render_match:
            try:
                import urllib.parse
                raw = urllib.parse.unquote(render_match.group(1))
                state = json.loads(raw)
                # Navigate the nested state structure for user search results
                for key, val in state.items():
                    if isinstance(val, dict) and "userList" in val:
                        users = val["userList"]
                        for user in users:
                            nickname = user.get("nickname", "")
                            if brand["name"].lower() in nickname.lower() or \
                               brand.get("name_en", "").lower() in nickname.lower():
                                data.d2_official_account_id = user.get("uid", "")
                                data.d2_official_account_name = nickname
                                data.d2_official_followers = user.get("followerCount", 0)
                                data.d2_verified = user.get("customVerify", "") != ""
                                break
            except (json.JSONDecodeError, KeyError, TypeError):
                pass

    @staticmethod
    def _parse_douyin_profile_html(html: str, data: DouyinBrandData):
        """Parse profile page HTML for D2 + D5 metrics."""
        render_match = re.search(r'<script id="RENDER_DATA"[^>]*>(.+?)</script>', html)
        if render_match:
            try:
                import urllib.parse
                raw = urllib.parse.unquote(render_match.group(1))
                state = json.loads(raw)
                for key, val in state.items():
                    if isinstance(val, dict) and "user" in val:
                        user = val["user"]
                        data.d2_official_followers = user.get("followerCount", data.d2_official_followers)
                        data.d2_total_videos = user.get("awemeCount", 0)
                        data.d2_total_likes = user.get("totalFavorited", 0)
                        break
            except (json.JSONDecodeError, KeyError, TypeError):
                pass

    @staticmethod
    def _extract_creators(text: str) -> List[Dict[str, str]]:
        """Extract creator/KOL names from video search results."""
        creators = []
        seen = set()
        # Match patterns like "@username" or "[link] username"
        for match in re.finditer(r"@([^\s\[<]{2,20})", text):
            name = match.group(1).strip()
            if name not in seen:
                seen.add(name)
                creators.append({"name": name, "source": "douyin_video"})
        return creators

    @staticmethod
    def _extract_number(text: str, pattern: str, default: int = 0) -> int:
        """Extract a number from text using regex pattern."""
        match = re.search(pattern, text)
        if match:
            num_str = match.group(1).replace(",", "").replace(".", "")
            if "万" in match.group(0) or "w" in match.group(0).lower():
                try:
                    return int(float(num_str) * 10000)
                except ValueError:
                    return default
            if "亿" in match.group(0):
                try:
                    return int(float(num_str) * 100000000)
                except ValueError:
                    return default
            try:
                return int(num_str)
            except ValueError:
                return default
        return default

    @staticmethod
    async def _rate_limit_delay():
        """Respectful delay between API calls."""
        import asyncio
        await asyncio.sleep(3 + (time.time() % 4))  # 3-7 second random delay
