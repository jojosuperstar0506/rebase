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

import asyncio
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
            await asyncio.sleep(3)  # Douyin needs longer delays

            # D2 + D5: Official profile
            if data.d2_official_account_id:
                await self._scrape_douyin_profile_browser(data.d2_official_account_id, page, data)
                await asyncio.sleep(3)

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

        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
        except Exception as e:
            logger.warning(f"Navigation to {url} had an issue: {e} — trying to continue")
        # Fixed wait: Douyin is a SPA — networkidle never fires, use fixed delay instead
        await page.wait_for_timeout(5000)

        text = await page.evaluate("document.body ? document.body.innerText : ''")

        # D1: Search suggestions — collect short lines from search results
        data.d1_search_suggestions = self._extract_search_suggestions(text)

        # D2: Find official account in user search results
        official = self._find_official_account(text, brand)
        if official:
            data.d2_official_account_id = official.get("id", "")
            data.d2_official_account_name = official.get("name", "")
            data.d2_official_followers = official.get("followers", 0)
            data.d2_verified = official.get("verified", False)

    async def _scrape_douyin_profile_browser(self, account_id: str, page, data: DouyinBrandData):
        """Scrape official profile for D2 metrics and D5 live commerce data."""
        url = f"https://www.douyin.com/user/{account_id}"
        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
        except Exception as e:
            logger.warning(f"Profile navigation issue: {e} — trying to continue")
        # Fixed wait: do NOT use networkidle — Douyin fires network requests indefinitely
        await page.wait_for_timeout(5000)

        text = await page.evaluate("document.body ? document.body.innerText : ''")

        # D2: Profile metrics
        data.d2_official_followers = self._extract_number(
            text, r"(\d[\d,.]*[万w]?)\s*(?:粉丝|关注者)", data.d2_official_followers)
        data.d2_total_videos = self._extract_number(text, r"(\d[\d,.]*)\s*(?:作品|视频)", 0)
        data.d2_total_likes = self._extract_number(
            text, r"(\d[\d,.]*[万w]?)\s*(?:获赞|喜欢)", 0)

        # D5: Live status
        if "直播中" in text or "LIVE" in text:
            data.d5_live_status = "live_now"
            data.d5_live_viewers = self._extract_number(text, r"(\d[\d,.]*)\s*(?:观看|在线)", 0)
        elif "预告" in text or "即将开播" in text:
            data.d5_live_status = "scheduled"
        else:
            data.d5_live_status = "offline"

        shop_match = re.search(r"(\d+)\s*(?:商品|件商品|橱窗)", text)
        if shop_match:
            data.d5_shop_product_count = int(shop_match.group(1))

    async def _scrape_douyin_hashtag_browser(self, brand: dict, page, data: DouyinBrandData):
        """
        Scrape video search sorted by popularity for D4 KOL/creator data.
        sort_type=1 = comprehensive popular sort (综合排序) on Douyin web search.
        """
        keyword = brand["douyin_keyword"]
        # sort_type=1 sorts by popularity/engagement, not just recency
        url = f"https://www.douyin.com/search/{keyword}?type=video&sort_type=1"

        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
        except Exception as e:
            logger.warning(f"Video search navigation issue: {e} — trying to continue")
        # Fixed wait: do NOT use networkidle on Douyin
        await page.wait_for_timeout(5000)

        # Scroll to trigger lazy-loaded video cards
        await page.evaluate("window.scrollTo(0, 1200)")
        await page.wait_for_timeout(2000)

        text = await page.evaluate("document.body ? document.body.innerText : ''")

        # D4: Extract creator names + engagement from top videos
        creators = self._extract_creators(text)
        data.d4_top_creators = creators[:10]
        data.d4_brand_mentions_count = len(creators)

        # D4: Extract top video titles and like counts
        top_videos = self._extract_top_videos(text)
        if top_videos:
            # Store as hashtag_views keyed by title snippet for backwards compat
            for v in top_videos[:5]:
                data.d4_hashtag_views[v["title"][:40]] = v["likes"]

        # D4: Hashtag total play count (shown as "X万播放" on topic pages)
        hashtag = f"#{keyword}#"
        view_match = re.search(
            rf"{re.escape(keyword)}\s*(\d[\d,.]*[万亿w]?)\s*(?:播放|次播放|views)", text)
        if view_match:
            data.d4_hashtag_views[f"#{keyword}# total"] = view_match.group(1)

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
        # httpx 0.20+ removed the `proxies` kwarg; use `proxy` (singular) instead
        client_kwargs = {"headers": headers, "timeout": 30.0, "follow_redirects": True}
        if self.proxy:
            client_kwargs["proxy"] = self.proxy

        try:
            async with httpx.AsyncClient(**client_kwargs) as client:
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
        """
        Extract search suggestions from Douyin user search innerText.
        innerText format: each user card is a block of plain-text lines.
        We collect account names that look like brand/creator handles.
        """
        suggestions = []
        seen = set()
        skip_prefixes = ("猜你想搜", "相关搜索", "热门搜索", "综合", "视频", "用户", "直播",
                         "商品", "筛选", "全部", "最新", "最热")
        for line in text.split("\n"):
            line = line.strip()
            if not line or len(line) > 40 or len(line) < 2:
                continue
            if any(line.startswith(p) for p in skip_prefixes):
                continue
            # Skip lines that are just numbers or contain follower/video counts
            if re.match(r"^[\d,.万亿w]+\s*(粉丝|作品|关注|获赞|视频)?$", line):
                continue
            if line not in seen:
                seen.add(line)
                suggestions.append(line)
        return suggestions[:10]

    @staticmethod
    def _find_official_account(text: str, brand: dict) -> Optional[dict]:
        """
        Find official brand account in Douyin user search innerText.

        innerText from a user-search page looks like:
            adidas阿迪达斯
            @adidasofficial_cn
            3264.2万粉丝  208作品
            品牌认证: 阿迪达斯官方账号
            ...

        Strategy: find a line containing the brand name, then scan the ±8
        surrounding lines for follower count and verification markers.
        """
        name = brand["name"]
        name_en = brand.get("name_en", name)
        lines = text.split("\n")

        for i, line in enumerate(lines):
            line_lower = line.lower()
            # Line must contain the brand name (Chinese or English)
            if name.lower() not in line_lower and name_en.lower() not in line_lower:
                continue

            window = lines[max(0, i - 3): min(len(lines), i + 8)]
            window_text = "\n".join(window)

            # Must have a verification signal nearby
            is_verified = any(marker in window_text
                              for marker in ("认证", "蓝V", "官方账号", "official"))

            # Extract follower count from the window
            followers = DouyinScraper._extract_number(
                window_text, r"(\d[\d,.]*[万w]?)\s*(?:粉丝|followers)", 0)

            # Extract @handle for user ID lookup (best proxy we have in innerText)
            handle = ""
            for wline in window:
                m = re.search(r"@([A-Za-z0-9_.\u4e00-\u9fff]{2,30})", wline)
                if m:
                    handle = m.group(1)
                    break

            if followers > 0 or is_verified:
                return {
                    "name": name,
                    "id": handle,          # handle used as surrogate ID in browser mode
                    "followers": followers,
                    "verified": is_verified,
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
    def _extract_top_videos(text: str) -> List[Dict[str, str]]:
        """
        Extract top video titles and like counts from Douyin video search innerText.

        innerText of a video card typically looks like:
            这双adidas超好看！
            @creator_name
            1.2万
            评论 345
            ...

        We scan for lines that look like video titles (Chinese text, not
        pure numbers/handles) and pair them with the next like-count line.
        """
        videos = []
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        i = 0
        while i < len(lines) and len(videos) < 20:
            line = lines[i]
            # Video title heuristic: Chinese text, not too short, not a pure number
            if (len(line) >= 5 and
                    re.search(r"[\u4e00-\u9fff]", line) and
                    not re.match(r"^[\d,.万亿w]+$", line) and
                    not line.startswith("@")):
                # Look ahead for like count (e.g. "1.2万" or "3456")
                likes = ""
                for j in range(i + 1, min(i + 5, len(lines))):
                    lm = re.match(r"^([\d,.]+[万亿w]?)$", lines[j])
                    if lm:
                        likes = lm.group(1)
                        break
                # Look ahead for creator @handle
                creator = ""
                for j in range(i + 1, min(i + 4, len(lines))):
                    cm = re.match(r"^@(.+)", lines[j])
                    if cm:
                        creator = cm.group(1)
                        break
                videos.append({"title": line, "likes": likes, "creator": creator})
            i += 1
        return videos

    @staticmethod
    def _extract_creators(text: str) -> List[Dict[str, str]]:
        """Extract creator/KOL names from video search results."""
        creators = []
        seen = set()
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
