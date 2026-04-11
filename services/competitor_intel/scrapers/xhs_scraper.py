"""
XHS (小红书) Scraper for OMI Competitive Intelligence.

Covers dimensions:
  D1 Brand Search Index — search autocomplete suggestions
  D2 Brand Voice Volume — follower count, note count, likes
  D3 Content Strategy DNA — content type distribution
  D4 Celebrity/KOL Ecosystem — top KOL collaborations
  D6 Consumer Mindshare — UGC sentiment keywords

Two execution modes:
  1. Browser mode (Cowork/Playwright) — uses page automation
  2. API mode (Aliyun) — uses httpx with cookie auth

Note: XHS aggressively blocks automated access. Browser mode with
read_page (accessibility tree) is the most reliable approach.
For Aliyun deployment, rotate proxies and use signed cookie auth.
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
class XhsBrandData:
    """Structured XHS data for a single brand."""
    brand_name: str
    scrape_date: str = ""
    scrape_status: str = "pending"  # pending | success | partial | failed

    # D1: Search Index
    d1_search_suggestions: List[str] = field(default_factory=list)
    d1_search_volume_rank: str = ""
    d1_related_searches: List[str] = field(default_factory=list)

    # D2: Voice Volume
    d2_official_followers: int = 0
    d2_total_notes: int = 0
    d2_total_likes: int = 0
    d2_official_account_id: str = ""
    d2_official_account_name: str = ""

    # D3: Content Strategy
    d3_content_types: Dict[str, int] = field(default_factory=dict)
    d3_top_notes: List[Dict[str, Any]] = field(default_factory=list)
    d3_posting_frequency: str = ""
    d3_avg_engagement: str = ""

    # D4: KOL Ecosystem
    d4_top_kols: List[Dict[str, str]] = field(default_factory=list)
    d4_collab_count: int = 0
    d4_celebrity_mentions: List[str] = field(default_factory=list)

    # D6: Consumer Mindshare
    d6_sentiment_keywords: List[str] = field(default_factory=list)
    d6_positive_keywords: List[str] = field(default_factory=list)
    d6_negative_keywords: List[str] = field(default_factory=list)
    d6_ugc_sample_notes: List[Dict[str, str]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


class XhsScraper:
    """
    XHS scraper with two backends:
      - browser: For Cowork (uses Playwright or MCP browser tools)
      - api: For Aliyun cloud (uses httpx with cookie/proxy rotation)
    """

    def __init__(self, mode: str = "api", cookies: Optional[str] = None,
                 proxy: Optional[str] = None):
        """
        Args:
            mode: 'browser' for Playwright/MCP, 'api' for direct HTTP
            cookies: XHS cookie string for authenticated requests
            proxy: Proxy URL for IP rotation (api mode)
        """
        self.mode = mode
        self.cookies = cookies
        self.proxy = proxy
        self._session = None

    # ─── Browser Mode (Cowork / Playwright) ────────────────────────────────

    async def scrape_brand_browser(self, brand: dict, page) -> XhsBrandData:
        """
        Scrape a brand using Playwright browser page.

        This is the primary method when running inside Cowork or any
        environment with browser automation (Playwright).

        Args:
            brand: Brand config dict from config.py
            page: Playwright page object
        """
        data = XhsBrandData(
            brand_name=brand["name"],
            scrape_date=datetime.now().strftime("%Y-%m-%d"),
        )

        try:
            # D1 + D2 + D3: Search results page
            await self._scrape_xhs_search_browser(brand, page, data)
            time.sleep(2)  # Respectful delay

            # D2: Official profile (if account ID known)
            if data.d2_official_account_id:
                await self._scrape_xhs_profile_browser(data.d2_official_account_id, page, data)
                time.sleep(2)

            # D6: UGC sentiment from search results
            await self._scrape_xhs_ugc_browser(brand, page, data)

            data.scrape_status = "success"
        except Exception as e:
            logger.error(f"XHS browser scrape failed for {brand['name']}: {e}")
            data.scrape_status = "partial" if data.d2_total_notes > 0 else "failed"

        return data

    async def _scrape_xhs_search_browser(self, brand: dict, page, data: XhsBrandData):
        """Navigate to XHS search and extract results via accessibility tree."""
        keyword = brand["xhs_keyword"]
        search_url = f"https://www.xiaohongshu.com/search_result?keyword={keyword}&type=51"

        await page.goto(search_url)
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(3000)  # Extra wait for dynamic content

        # Get page content via accessibility tree (most reliable on XHS)
        content = await page.accessibility.snapshot()
        text = self._flatten_accessibility_tree(content)

        # Extract search suggestions (D1)
        data.d1_search_suggestions = self._extract_search_suggestions(text)

        # Extract note cards from search results (D3)
        cards = self._extract_note_cards_from_text(text)
        data.d3_top_notes = cards[:10]

        # Classify content types (D3)
        data.d3_content_types = self._classify_content_types(cards)

        # Look for official account in results
        official = self._find_official_account(text, brand)
        if official:
            data.d2_official_account_id = official.get("id", "")
            data.d2_official_account_name = official.get("name", "")

    async def _scrape_xhs_profile_browser(self, account_id: str, page, data: XhsBrandData):
        """Scrape official brand profile for D2 metrics."""
        profile_url = f"https://www.xiaohongshu.com/user/profile/{account_id}"
        await page.goto(profile_url)
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(3000)

        content = await page.accessibility.snapshot()
        text = self._flatten_accessibility_tree(content)

        # Extract follower/note/like counts
        data.d2_official_followers = self._extract_number(text, r"(\d[\d,.]*)\s*(?:粉丝|followers)", 0)
        data.d2_total_notes = self._extract_number(text, r"(\d[\d,.]*)\s*(?:笔记|notes)", 0)
        data.d2_total_likes = self._extract_number(text, r"(\d[\d,.]*)\s*(?:获赞|赞藏|likes)", 0)

    async def _scrape_xhs_ugc_browser(self, brand: dict, page, data: XhsBrandData):
        """Scrape UGC notes for D6 consumer mindshare keywords."""
        keyword = brand["xhs_keyword"] + " 测评"
        search_url = f"https://www.xiaohongshu.com/search_result?keyword={keyword}&type=51"

        await page.goto(search_url)
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(3000)

        content = await page.accessibility.snapshot()
        text = self._flatten_accessibility_tree(content)

        # Extract sentiment keywords from UGC titles/descriptions
        data.d6_sentiment_keywords = self._extract_sentiment_keywords(text)
        positive, negative = self._split_sentiment(data.d6_sentiment_keywords)
        data.d6_positive_keywords = positive
        data.d6_negative_keywords = negative

    # ─── API Mode (Aliyun Cloud) ───────────────────────────────────────────

    async def scrape_brand_api(self, brand: dict) -> XhsBrandData:
        """
        Scrape a brand using direct HTTP API calls.

        For Aliyun deployment. Requires valid XHS cookies and
        optional proxy rotation to avoid rate limits.
        """
        import httpx

        data = XhsBrandData(
            brand_name=brand["name"],
            scrape_date=datetime.now().strftime("%Y-%m-%d"),
        )

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://www.xiaohongshu.com/",
            "Cookie": self.cookies or "",
        }

        proxy_config = {"https://": self.proxy} if self.proxy else None

        try:
            async with httpx.AsyncClient(headers=headers, proxies=proxy_config,
                                          timeout=30.0, follow_redirects=True) as client:
                # D1 + D3: Search API
                await self._scrape_xhs_search_api(brand, client, data)
                await self._rate_limit_delay()

                # D2: Profile API
                if data.d2_official_account_id:
                    await self._scrape_xhs_profile_api(data.d2_official_account_id, client, data)
                    await self._rate_limit_delay()

                # D6: UGC search
                await self._scrape_xhs_ugc_api(brand, client, data)

                data.scrape_status = "success"
        except Exception as e:
            logger.error(f"XHS API scrape failed for {brand['name']}: {e}")
            data.scrape_status = "partial" if data.d2_total_notes > 0 else "failed"

        return data

    async def _scrape_xhs_search_api(self, brand: dict, client, data: XhsBrandData):
        """Call XHS web search endpoint and parse HTML response."""
        keyword = brand["xhs_keyword"]
        url = f"https://www.xiaohongshu.com/search_result?keyword={keyword}&type=51"

        resp = await client.get(url)
        resp.raise_for_status()
        html = resp.text

        # Extract from rendered HTML
        data.d1_search_suggestions = self._extract_search_suggestions_html(html)
        cards = self._extract_note_cards_from_html(html)
        data.d3_top_notes = cards[:10]
        data.d3_content_types = self._classify_content_types(cards)

        # Find official account
        official = self._find_official_account_html(html, brand)
        if official:
            data.d2_official_account_id = official.get("id", "")
            data.d2_official_account_name = official.get("name", "")

    async def _scrape_xhs_profile_api(self, account_id: str, client, data: XhsBrandData):
        """Fetch profile page and extract D2 metrics."""
        url = f"https://www.xiaohongshu.com/user/profile/{account_id}"
        resp = await client.get(url)
        resp.raise_for_status()
        html = resp.text

        data.d2_official_followers = self._extract_number(html, r'"fansCount":\s*"?(\d+)"?', 0)
        data.d2_total_notes = self._extract_number(html, r'"noteCount":\s*"?(\d+)"?', 0)
        data.d2_total_likes = self._extract_number(html, r'"likedCount":\s*"?(\d+)"?', 0)

    async def _scrape_xhs_ugc_api(self, brand: dict, client, data: XhsBrandData):
        """Search for UGC review notes."""
        keyword = brand["xhs_keyword"] + " 测评"
        url = f"https://www.xiaohongshu.com/search_result?keyword={keyword}&type=51"
        resp = await client.get(url)
        if resp.status_code == 200:
            data.d6_sentiment_keywords = self._extract_sentiment_keywords(resp.text)
            positive, negative = self._split_sentiment(data.d6_sentiment_keywords)
            data.d6_positive_keywords = positive
            data.d6_negative_keywords = negative

    # ─── Parsing Helpers ───────────────────────────────────────────────────

    @staticmethod
    def _flatten_accessibility_tree(node: dict, depth: int = 0) -> str:
        """Flatten Playwright accessibility snapshot into searchable text."""
        if not node:
            return ""
        parts = []
        name = node.get("name", "")
        role = node.get("role", "")
        if name:
            parts.append(f"[{role}] {name}")
        for child in node.get("children", []):
            parts.append(XhsScraper._flatten_accessibility_tree(child, depth + 1))
        return "\n".join(parts)

    @staticmethod
    def _extract_search_suggestions(text: str) -> List[str]:
        """Extract search autocomplete suggestions from page text."""
        suggestions = []
        for line in text.split("\n"):
            if "搜索发现" in line or "相关搜索" in line or "大家还在搜" in line:
                continue
            # Look for suggestion-like patterns
            match = re.search(r"\[link\]\s*(.+)", line)
            if match and len(match.group(1)) < 30:
                suggestions.append(match.group(1).strip())
        return suggestions[:10]

    @staticmethod
    def _extract_search_suggestions_html(html: str) -> List[str]:
        """Extract suggestions from raw HTML."""
        suggestions = []
        # XHS embeds suggestions in data attributes or script tags
        matches = re.findall(r'"keyword":\s*"([^"]+)"', html)
        for m in matches:
            if len(m) < 30 and m not in suggestions:
                suggestions.append(m)
        return suggestions[:10]

    @staticmethod
    def _extract_note_cards_from_text(text: str) -> List[Dict[str, Any]]:
        """Extract note card info from accessibility tree text."""
        cards = []
        lines = text.split("\n")
        current_card = {}

        for line in lines:
            # Note title
            if "[link]" in line and len(line) > 10:
                if current_card:
                    cards.append(current_card)
                title = re.sub(r"\[link\]\s*", "", line).strip()
                current_card = {"title": title, "type": "image_note"}
            # Engagement metrics
            like_match = re.search(r"(\d[\d.]*[万w]?)\s*(?:赞|❤|♡)", line)
            if like_match and current_card:
                current_card["likes"] = like_match.group(1)
            # Video indicator
            if "视频" in line or "播放" in line:
                if current_card:
                    current_card["type"] = "video_note"
            # Author
            author_match = re.search(r"\[link\]\s*@?([^\[]+)", line)
            if author_match and current_card and "author" not in current_card:
                current_card["author"] = author_match.group(1).strip()

        if current_card:
            cards.append(current_card)
        return cards

    @staticmethod
    def _extract_note_cards_from_html(html: str) -> List[Dict[str, Any]]:
        """Extract note cards from raw HTML."""
        cards = []
        # Parse embedded JSON data in script tags
        json_match = re.search(r'window\.__INITIAL_STATE__\s*=\s*({.+?})\s*;', html, re.DOTALL)
        if json_match:
            try:
                state = json.loads(json_match.group(1).replace("undefined", "null"))
                notes = state.get("search", {}).get("notes", [])
                for note in notes[:10]:
                    cards.append({
                        "title": note.get("title", ""),
                        "likes": str(note.get("likedCount", 0)),
                        "type": "video_note" if note.get("type") == "video" else "image_note",
                        "author": note.get("user", {}).get("nickname", ""),
                        "note_id": note.get("id", ""),
                    })
            except (json.JSONDecodeError, KeyError):
                pass
        return cards

    @staticmethod
    def _classify_content_types(cards: List[dict]) -> Dict[str, int]:
        """Classify content into type buckets."""
        types = {
            "穿搭OOTD": 0,
            "测评对比": 0,
            "开箱": 0,
            "日常搭配": 0,
            "好物推荐": 0,
            "视频": 0,
            "其他": 0,
        }
        keywords_map = {
            "穿搭OOTD": ["穿搭", "ootd", "搭配", "outfit"],
            "测评对比": ["测评", "对比", "评测", "review", "pk"],
            "开箱": ["开箱", "unbox", "到手"],
            "日常搭配": ["日常", "上班", "通勤", "daily"],
            "好物推荐": ["推荐", "安利", "好物", "种草"],
        }
        for card in cards:
            title = card.get("title", "").lower()
            if card.get("type") == "video_note":
                types["视频"] += 1
                continue
            matched = False
            for type_name, kws in keywords_map.items():
                if any(kw in title for kw in kws):
                    types[type_name] += 1
                    matched = True
                    break
            if not matched:
                types["其他"] += 1
        return {k: v for k, v in types.items() if v > 0}

    @staticmethod
    def _find_official_account(text: str, brand: dict) -> Optional[dict]:
        """Find official brand account in search results."""
        name = brand["name"]
        # Look for verified official account markers
        patterns = [
            rf"({name}.*?官方|官方.*?{name})",
            rf"({name}.*?旗舰店)",
            rf"({brand.get('name_en', '')}.*?official)",
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                # Try to find associated user ID
                id_match = re.search(r"/user/profile/([a-f0-9]+)", text)
                return {
                    "name": match.group(1),
                    "id": id_match.group(1) if id_match else "",
                }
        return None

    @staticmethod
    def _find_official_account_html(html: str, brand: dict) -> Optional[dict]:
        """Find official account in raw HTML."""
        name = brand["name"]
        # Look in __INITIAL_STATE__ for user data
        json_match = re.search(r'window\.__INITIAL_STATE__\s*=\s*({.+?})\s*;', html, re.DOTALL)
        if json_match:
            try:
                state = json.loads(json_match.group(1).replace("undefined", "null"))
                users = state.get("search", {}).get("users", [])
                for user in users:
                    nickname = user.get("nickname", "")
                    if name.lower() in nickname.lower() or brand.get("name_en", "").lower() in nickname.lower():
                        return {"name": nickname, "id": user.get("userId", "")}
            except (json.JSONDecodeError, KeyError):
                pass
        return None

    @staticmethod
    def _extract_sentiment_keywords(text: str) -> List[str]:
        """Extract sentiment keywords from UGC content."""
        # Common sentiment markers in Chinese bag reviews
        sentiment_words = [
            "好看", "质感", "高级", "百搭", "轻便", "大容量", "实用",
            "性价比", "颜值", "做工", "五金", "皮质", "耐用",
            "偏硬", "偏重", "容易刮", "掉色", "塌", "廉价",
            "惊艳", "精致", "大气", "小众", "独特", "气质",
        ]
        found = []
        text_lower = text.lower()
        for word in sentiment_words:
            if word in text_lower:
                found.append(word)
        return found

    @staticmethod
    def _split_sentiment(keywords: List[str]) -> tuple:
        """Split keywords into positive and negative buckets."""
        negative_words = {"偏硬", "偏重", "容易刮", "掉色", "塌", "廉价"}
        positive = [k for k in keywords if k not in negative_words]
        negative = [k for k in keywords if k in negative_words]
        return positive, negative

    @staticmethod
    def _extract_number(text: str, pattern: str, default: int = 0) -> int:
        """Extract a number from text using regex pattern."""
        match = re.search(pattern, text)
        if match:
            num_str = match.group(1).replace(",", "").replace(".", "")
            if "万" in match.group(0) or "w" in match.group(0).lower():
                return int(float(num_str) * 10000)
            try:
                return int(num_str)
            except ValueError:
                return default
        return default

    @staticmethod
    async def _rate_limit_delay():
        """Respectful delay between API calls."""
        import asyncio
        await asyncio.sleep(2 + (time.time() % 3))  # 2-5 second random delay
