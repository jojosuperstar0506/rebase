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
import os
import random
import re
import time
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field, asdict

logger = logging.getLogger(__name__)

# Rate-limit / anti-bot markers Douyin surfaces when it wants us to slow down.
_RATE_LIMIT_MARKERS = (
    '滑块验证', '验证码', '请稍后再试', '访问过于频繁', '操作太频繁',
    '系统繁忙', '人机验证', '安全验证',
)


async def _human_pause(min_s: float = 3.0, max_s: float = 7.0):
    """Sleep for a random interval in [min_s, max_s]."""
    await asyncio.sleep(random.uniform(min_s, max_s))


def _dump_debug(page_text: str, brand: str, step: str):
    """Save the raw page text when extraction returns empty, so we can see why."""
    try:
        debug_dir = Path(os.environ.get('SCRAPER_DEBUG_DIR', '.debug'))
        debug_dir.mkdir(parents=True, exist_ok=True)
        safe_brand = re.sub(r'[^A-Za-z0-9_-]', '_', brand)
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        path = debug_dir / f'douyin_{safe_brand}_{step}_{ts}.txt'
        path.write_text(page_text or '', encoding='utf-8')
        logger.warning(f"[DEBUG] Saved raw page text to {path}")
    except Exception as e:
        logger.warning(f"[DEBUG] Could not save debug file: {e}")


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
            await _human_pause(5, 9)  # Random pause before next nav

            # D2 + D5: Official profile
            if data.d2_official_account_id:
                await self._scrape_douyin_profile_browser(
                    data.d2_official_account_id, page, data)
                await _human_pause(5, 9)

            # D4: Video search (sorted by likes)
            await self._scrape_douyin_hashtag_browser(brand, page, data)

            data.scrape_status = "success"
        except Exception as e:
            msg = str(e)
            logger.error(f"Douyin browser scrape failed for {brand['name']}: {msg}")
            if "rate-limit" in msg.lower() or "rate_limit" in msg.lower():
                data.scrape_status = "rate_limited"
            else:
                data.scrape_status = "partial" if data.d2_official_followers > 0 else "failed"

        return data

    async def _scrape_douyin_search_browser(self, brand: dict, page, data: DouyinBrandData):
        """
        Search Douyin (user search) and extract D1 suggestions + D2 official account.

        Uses DOM-selector-based extraction instead of positional innerText parsing —
        each user card is anchored by an <a href="/user/..."> element, which is
        stable across Douyin redesigns.
        """
        keyword = brand["douyin_keyword"]
        url = f"https://www.douyin.com/search/{keyword}?type=user"

        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
        except Exception as e:
            logger.warning(f"Navigation to {url} had an issue: {e} — trying to continue")
        # Jitter wait — Douyin is a SPA, networkidle never fires
        await page.wait_for_timeout(random.randint(5000, 8000))

        # Rate-limit check — bail early if Douyin is showing a captcha
        page_text = await page.evaluate("document.body ? document.body.innerText : ''")
        if any(m in page_text for m in _RATE_LIMIT_MARKERS):
            data.scrape_status = "rate_limited"
            raise RuntimeError(f"Douyin rate-limit page detected for {brand['name']}")

        # Selector-based user card extraction
        user_cards = await page.evaluate("""
            Array.from(document.querySelectorAll('a[href*="/user/"]'))
                .slice(0, 15)
                .map(a => {
                    const card = a.closest('li, div[class*="card"], div[class*="user"]') || a.parentElement;
                    return {
                        href: a.href,
                        text: (card ? card.innerText : a.innerText).trim().slice(0, 600)
                    };
                })
                .filter(x => x.text.length > 0);
        """)

        if not user_cards:
            _dump_debug(page_text, brand['name'], 'user_search')
            logger.warning(f"No user cards found for {brand['name']} — page may have been blocked")
            return

        # D2: Find official account among user cards
        official = self._find_official_account_from_cards(user_cards, brand)
        if official:
            data.d2_official_account_id = official["id"]
            data.d2_official_account_name = official["name"]
            data.d2_official_followers = official["followers"]
            data.d2_verified = official["verified"]

            # Safety net: if top candidate had suspiciously low followers for
            # a brand we expect to be large, dump card texts so we can see why.
            if official["followers"] < 10_000:
                dump_text = "\n\n---\n\n".join(
                    f"CARD {i}: {c['href']}\n{c['text']}"
                    for i, c in enumerate(user_cards)
                )
                _dump_debug(dump_text, brand['name'], 'user_cards')
                logger.warning(
                    f"[MATCH] Brand '{brand['name']}' top account has only "
                    f"{official['followers']} followers — all {len(user_cards)} "
                    f"user cards dumped to .debug/ for inspection"
                )

        # D1: Suggestions — pull visible account names from top cards
        data.d1_search_suggestions = [
            self._first_line(c["text"]) for c in user_cards[:8]
            if self._first_line(c["text"])
        ]

    async def _scrape_douyin_profile_browser(self, account_id: str, page, data: DouyinBrandData):
        """
        Scrape official profile for D2 metrics + D5 live commerce.
        account_id can be a numeric user id or a handle suffix.
        """
        url = f"https://www.douyin.com/user/{account_id}"
        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
        except Exception as e:
            logger.warning(f"Profile navigation issue: {e} — trying to continue")
        await page.wait_for_timeout(random.randint(5000, 8000))

        text = await page.evaluate("document.body ? document.body.innerText : ''")
        if any(m in text for m in _RATE_LIMIT_MARKERS):
            raise RuntimeError(f"Douyin rate-limit page detected on profile {account_id}")

        # D2: Profile metrics — try both "粉丝 32.6万" and "32.6万粉丝" orderings
        followers = self._extract_stat(text, ("粉丝", "关注者", "fans"))
        videos = self._extract_stat(text, ("作品", "视频", "posts"))
        likes = self._extract_stat(text, ("获赞", "喜欢", "点赞", "total likes"))

        # Only overwrite if we got a higher value (search page already set d2_official_followers)
        if followers > data.d2_official_followers:
            data.d2_official_followers = followers
        data.d2_total_videos = videos
        data.d2_total_likes = likes

        # Safety net: if profile stats are suspiciously empty for a brand
        # we thought was official, dump the page text so we can see why.
        if followers < 1000 and videos == 0:
            _dump_debug(text, data.brand_name, f'profile_{account_id[:20]}')
            logger.warning(
                f"[PROFILE] Suspiciously low stats for {data.brand_name} "
                f"(followers={followers}, videos={videos}) — raw page dumped to .debug/"
            )

        # D5: Live status
        if "直播中" in text or "LIVE" in text:
            data.d5_live_status = "live_now"
            data.d5_live_viewers = self._extract_number(
                text, r"(\d[\d,.]*)\s*(?:观看|在线)", 0)
        elif "预告" in text or "即将开播" in text:
            data.d5_live_status = "scheduled"
        else:
            data.d5_live_status = "offline"

        shop_match = re.search(r"(\d+)\s*(?:商品|件商品|橱窗)", text)
        if shop_match:
            data.d5_shop_product_count = int(shop_match.group(1))

    async def _scrape_douyin_hashtag_browser(self, brand: dict, page, data: DouyinBrandData):
        """
        Scrape video search page for D4 KOL / creator / engagement data.

        Uses DOM-selector-based extraction — each video card is anchored by
        <a href="/video/{id}">, which is stable across redesigns. This
        replaces the earlier positional-innerText parser which was unreliable.

        Sort: explicitly clicks the "most likes" / "most popular" tab after load
        so results are comparable across brands and sessions (default sort is
        personalized to the logged-in user's demographic and is NOT stable for
        competitive intelligence).
        """
        keyword = brand["douyin_keyword"]
        url = f"https://www.douyin.com/search/{keyword}?type=video"

        try:
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
        except Exception as e:
            logger.warning(f"Video search navigation issue: {e} — trying to continue")
        await page.wait_for_timeout(random.randint(5000, 8000))

        # Rate-limit check
        page_text = await page.evaluate("document.body ? document.body.innerText : ''")
        if any(m in page_text for m in _RATE_LIMIT_MARKERS):
            raise RuntimeError(f"Douyin rate-limit page detected on video search for {brand['name']}")

        # ── Force deterministic sort: click the "most likes" filter tab ─────
        # Try common label variants. Douyin's UI shifts but one of these works.
        # Stops at first successful click — continues silently if none found
        # (default sort still gives useful, just personalized, results).
        sorted_by_likes = False
        for label in ("最多点赞", "按点赞", "最热", "热门"):
            try:
                locator = page.locator(f"text={label}").first
                if await locator.count() > 0:
                    await locator.click(timeout=4000)
                    sorted_by_likes = True
                    logger.info(f"[SORT] Clicked '{label}' tab for {brand['name']}")
                    await page.wait_for_timeout(random.randint(3000, 5000))
                    break
            except Exception as e:
                logger.debug(f"Sort tab '{label}' not clickable: {e}")
                continue

        if not sorted_by_likes:
            logger.warning(
                f"[SORT] Could not find popularity sort tab for {brand['name']} — "
                f"will sort captured cards by likes client-side instead"
            )
            # Dump visible tab/button labels so we can update selectors next run
            try:
                visible_labels = await page.evaluate("""
                    Array.from(document.querySelectorAll(
                        'button, [role="tab"], [role="button"], a[class*="tab"], div[class*="tab"]'
                    ))
                    .filter(el => el.offsetParent !== null)
                    .map(el => (el.innerText || '').trim())
                    .filter(t => t && t.length > 0 && t.length < 20)
                    .slice(0, 40);
                """)
                logger.warning(
                    f"[SORT-DEBUG] Visible clickable labels on the page: "
                    f"{sorted(set(visible_labels))}"
                )
            except Exception as e:
                logger.debug(f"Could not enumerate visible tabs: {e}")

        # Two scrolls with human-ish delays to trigger lazy-loaded cards
        for scroll_y in (800, 1800):
            await page.evaluate(f"window.scrollTo(0, {scroll_y})")
            await page.wait_for_timeout(random.randint(1500, 2800))

        # Selector-based video card extraction.
        # Each card contains: title, creator handle, like count, upload date.
        video_cards = await page.evaluate("""
            Array.from(document.querySelectorAll('a[href*="/video/"]'))
                .slice(0, 25)
                .map(a => {
                    const card = a.closest('li, div[class*="video"], div[class*="aweme"], div[class*="card"]') || a.parentElement;
                    return {
                        href: a.href,
                        text: (card ? card.innerText : a.innerText).trim().slice(0, 400)
                    };
                })
                .filter(x => x.text.length > 0);
        """)

        if not video_cards:
            _dump_debug(page_text, brand['name'], 'video_search')
            logger.warning(f"No video cards found for {brand['name']} — page may have been blocked or DOM changed")
            return

        # Parse each card into structured top_videos + creators
        top_videos = []
        creators_seen = set()
        creators = []
        for card in video_cards:
            parsed = self._parse_video_card(card["text"])
            if parsed["title"]:
                parsed["likes_int"] = DouyinScraper._likes_to_int(parsed.get("likes", ""))
                top_videos.append(parsed)
            handle = parsed.get("creator")
            if handle and handle not in creators_seen:
                creators_seen.add(handle)
                creators.append({"name": handle, "source": "douyin_video"})

        # Client-side sort by parsed like count desc — deterministic even if
        # Douyin's UI didn't give us a sort tab or if the default sort was
        # personalized to the logged-in user's demographic.
        top_videos.sort(key=lambda v: v.get("likes_int", 0), reverse=True)

        data.d4_top_creators = creators[:10]
        data.d4_brand_mentions_count = len(creators)

        for v in top_videos[:5]:
            data.d4_hashtag_views[v["title"][:40]] = v["likes"]

        # Hashtag total plays (if shown on the results header)
        view_match = re.search(
            rf"{re.escape(keyword)}\s*(\d[\d,.]*[万亿w]?)\s*(?:播放|次播放)", page_text)
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
    def _first_line(text: str) -> str:
        """Return the first non-empty stripped line of a block of text."""
        for line in text.split("\n"):
            line = line.strip()
            if line:
                return line
        return ""

    @staticmethod
    def _find_official_account_from_cards(cards: List[Dict[str, str]],
                                           brand: dict) -> Optional[dict]:
        """
        Scan user cards and return the one most likely to be the brand's
        official account.

        Strategy: among cards whose text contains the brand name (or English
        name), pick the one with the HIGHEST follower count. A real brand
        account always dominates on follower count — fan accounts, parodies,
        and random users with "adidas" in their bio are orders of magnitude
        smaller.

        Verification markers (认证 / 蓝V / 官方) are unreliable signals because
        Douyin renders them as SVG badges, not text — so we don't rely on
        them for ranking, only record them when present.
        """
        name = brand["name"]
        name_en = brand.get("name_en", name) or name

        candidates = []
        for card in cards:
            t = card["text"]
            t_low = t.lower()
            if name.lower() not in t_low and name_en.lower() not in t_low:
                continue

            # Try both "粉丝 32.6万" and "32.6万粉丝" orderings
            followers = DouyinScraper._extract_stat(t, ("粉丝", "followers", "fans"))
            is_verified = any(m in t for m in ("认证", "蓝V", "官方账号", "官方"))

            user_id = ""
            id_match = re.search(r"/user/([^/?#]+)", card["href"])
            if id_match:
                user_id = id_match.group(1)

            candidates.append({
                "name": DouyinScraper._first_line(t) or name,
                "id": user_id,
                "followers": followers,
                "verified": is_verified,
                "raw_text_preview": t[:200],
            })

        if not candidates:
            logger.warning(f"[MATCH] No user cards matched brand name '{name}'")
            return None

        # Sort by follower count desc — brand account almost always wins
        candidates.sort(key=lambda c: c["followers"], reverse=True)
        top = candidates[0]

        logger.info(
            f"[MATCH] Brand='{name}' picked top candidate: "
            f"'{top['name']}' followers={top['followers']:,} "
            f"verified={top['verified']} (out of {len(candidates)} candidates)"
        )
        # Drop the debug-only field before returning
        top.pop("raw_text_preview", None)
        return top

    @staticmethod
    def _parse_video_card(text: str) -> Dict[str, str]:
        """
        Parse a single video card's innerText into a structured dict.

        A typical card looks like:
            这双adidas超好看 | 穿搭分享
            @creator_handle
            12.3万
            3 天前

        We try to identify: title (first Chinese line), creator (@handle),
        likes (standalone number possibly with 万/w), date (relative time).
        """
        result = {"title": "", "creator": "", "likes": "", "date": ""}
        lines = [l.strip() for l in text.split("\n") if l.strip()]

        for line in lines:
            # Creator handle
            if not result["creator"]:
                m = re.match(r"^@(.+)", line)
                if m:
                    result["creator"] = m.group(1)[:40]
                    continue

            # Standalone number = like count (most cards show one)
            if not result["likes"] and re.match(r"^[\d,.]+[万亿w]?$", line):
                result["likes"] = line
                continue

            # Relative date
            if not result["date"] and re.search(r"(\d+\s*(?:天|小时|分钟|秒|月|年)前|今天|昨天)", line):
                result["date"] = line
                continue

            # Title — first non-trivial Chinese-containing line that isn't above
            if (not result["title"]
                    and len(line) >= 4
                    and re.search(r"[\u4e00-\u9fffA-Za-z]", line)
                    and not re.match(r"^[\d,.万亿w]+$", line)
                    and not line.startswith("@")):
                result["title"] = line[:120]

        return result

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
    def _likes_to_int(s: str) -> int:
        """Convert a like-count string like '12.3万' / '1,234' / '8w' into an int."""
        if not s:
            return 0
        m = re.match(r"^([\d,.]+)\s*([万亿wWkK]?)$", s.strip())
        if not m:
            return 0
        num_str = m.group(1).replace(",", "")
        try:
            val = float(num_str)
        except ValueError:
            return 0
        unit = m.group(2).lower()
        if unit in ("万", "w"):
            return int(val * 10_000)
        if unit == "亿":
            return int(val * 100_000_000)
        if unit == "k":
            return int(val * 1_000)
        return int(val)

    @staticmethod
    def _extract_stat(text: str, labels: tuple) -> int:
        """
        Extract a numeric stat from Douyin text by trying BOTH label orderings.

        Douyin profile pages render stats as "粉丝 32.6万" (label first), while
        some search result contexts render "32.6万粉丝" (number first). We try
        label-first first — it's the most common profile format — then fall
        back to number-first. Returns the largest value found (brand accounts
        dominate, so picking max is safe).
        """
        best = 0
        for label in labels:
            # Pattern A: "粉丝 32.6万" — label then number (profile pages)
            for m in re.finditer(
                rf"{label}\s*[:：]?\s*(\d[\d,.]*\s*[万亿wWkK]?)", text
            ):
                val = DouyinScraper._likes_to_int(m.group(1).replace(" ", ""))
                if val > best:
                    best = val
            # Pattern B: "32.6万粉丝" — number then label (some cards)
            for m in re.finditer(
                rf"(\d[\d,.]*\s*[万亿wWkK]?)\s*{label}", text
            ):
                val = DouyinScraper._likes_to_int(m.group(1).replace(" ", ""))
                if val > best:
                    best = val
        return best

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
