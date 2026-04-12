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

    # Full catalog: all notes from the brand's profile (paginated)
    full_note_catalog: List[Dict[str, Any]] = field(default_factory=list)

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

            # D6: UGC sentiment from search results (multiple pages)
            await self._scrape_xhs_ugc_browser(brand, page, data)

            # Full catalog: paginate through all notes on the brand's profile
            if data.d2_official_account_id:
                time.sleep(2)
                await self._scrape_xhs_note_catalog_browser(
                    data.d2_official_account_id, page, data, max_pages=10
                )

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

    async def _scrape_xhs_note_catalog_browser(self, account_id: str, page, data: XhsBrandData, max_pages: int = 10):
        """
        Paginate through ALL notes on the brand's profile page.
        XHS profile pages lazy-load notes on scroll. We scroll and collect.
        This gives us the full content catalog — not just 10 from search.
        """
        profile_url = f"https://www.xiaohongshu.com/user/profile/{account_id}"
        try:
            await page.goto(profile_url)
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(3000)

            all_notes = []
            seen_ids = set()

            for page_num in range(max_pages):
                content = await page.accessibility.snapshot()
                text = self._flatten_accessibility_tree(content)
                cards = self._extract_note_cards_from_text(text)

                new_found = 0
                for card in cards:
                    note_id = card.get("note_id") or card.get("title", "")[:30]
                    if note_id not in seen_ids:
                        seen_ids.add(note_id)
                        all_notes.append(card)
                        new_found += 1

                if new_found == 0:
                    break  # No new notes found, stop paginating

                # Scroll down to trigger lazy loading
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await page.wait_for_timeout(2000)

            data.full_note_catalog = all_notes
            # Also update d3_top_notes with the full catalog (sorted by likes)
            if all_notes:
                sorted_notes = sorted(all_notes, key=lambda n: self._parse_like_count(n.get("likes", "0")), reverse=True)
                data.d3_top_notes = sorted_notes[:50]  # Top 50 by engagement
                data.d3_content_types = self._classify_content_types(all_notes)

            logger.info(f"XHS catalog: collected {len(all_notes)} notes for {account_id} ({page_num+1} pages)")

        except Exception as e:
            logger.warning(f"XHS catalog pagination failed for {account_id}: {e}")
            # Non-fatal: we still have whatever d3_top_notes we got from search

    @staticmethod
    def _parse_like_count(like_str) -> int:
        """Parse like count string (e.g., '1.2万', '3456') into int."""
        if isinstance(like_str, int):
            return like_str
        s = str(like_str).strip()
        if '万' in s or 'w' in s.lower():
            try:
                return int(float(s.replace('万', '').replace('w', '').replace('W', '')) * 10000)
            except ValueError:
                return 0
        try:
            return int(s.replace(',', ''))
        except ValueError:
            return 0

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

                # D6: UGC search — paginate through multiple pages and search variants
                # This captures what CONSUMERS say about the brand (not just the brand's own posts)
                await self._scrape_xhs_ugc_catalog_api(brand, client, data, max_pages=5)
                await self._rate_limit_delay()

                # Full catalog: paginate through brand's note list via API
                if data.d2_official_account_id:
                    await self._scrape_xhs_note_catalog_api(
                        data.d2_official_account_id, client, data, max_pages=10
                    )
                    await self._rate_limit_delay()

                    # Enrich top 50 notes with full content (body, hashtags, products, comments)
                    await self._enrich_top_notes(data, client, top_n=50)

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

    async def _scrape_xhs_ugc_catalog_api(self, brand: dict, client, data: XhsBrandData, max_pages: int = 5):
        """
        Search for UGC content about the brand across multiple search variants.
        This captures what CONSUMERS post about the brand — reviews, unboxings,
        comparisons — not just what the brand posts itself.

        Search variants:
          - "{brand}" (general)
          - "{brand} 测评" (reviews)
          - "{brand} 推荐" (recommendations)
          - "{brand} 避雷" (warnings/negative)
        """
        keyword_base = brand["xhs_keyword"]
        search_variants = [
            keyword_base,                    # General brand mentions
            f"{keyword_base} 测评",          # Reviews
            f"{keyword_base} 推荐",          # Recommendations
            f"{keyword_base} 避雷",          # Warnings / negative sentiment
        ]

        all_ugc_notes = []
        seen_ids = set()
        all_sentiment_words = []

        for variant in search_variants:
            for page_num in range(max_pages):
                try:
                    # XHS search pagination uses page param
                    url = f"https://www.xiaohongshu.com/search_result?keyword={variant}&type=51&page={page_num + 1}"
                    resp = await client.get(url)
                    if resp.status_code != 200:
                        break

                    html = resp.text
                    cards = self._extract_note_cards_from_html(html)

                    if not cards:
                        break

                    new_found = 0
                    for card in cards:
                        note_id = card.get("note_id", card.get("title", ""))
                        if note_id not in seen_ids:
                            seen_ids.add(note_id)
                            card["search_variant"] = variant
                            all_ugc_notes.append(card)
                            new_found += 1

                    if new_found == 0:
                        break

                    await self._rate_limit_delay()

                except Exception as e:
                    logger.warning(f"UGC search page failed ({variant} p{page_num}): {e}")
                    break

            # Extract sentiment from this variant's results
            for card in all_ugc_notes:
                title = card.get("title", "")
                found_words = self._extract_sentiment_keywords(title)
                all_sentiment_words.extend(found_words)

        # Update data with UGC results
        data.d6_ugc_sample_notes = [
            {"title": n.get("title", ""), "likes": n.get("likes", "0"), "variant": n.get("search_variant", "")}
            for n in all_ugc_notes[:100]
        ]

        # Merge sentiment keywords (deduplicate)
        existing = set(data.d6_sentiment_keywords)
        for w in all_sentiment_words:
            if w not in existing:
                data.d6_sentiment_keywords.append(w)
                existing.add(w)

        positive, negative = self._split_sentiment(data.d6_sentiment_keywords)
        data.d6_positive_keywords = positive
        data.d6_negative_keywords = negative

        logger.info(f"UGC catalog: collected {len(all_ugc_notes)} UGC notes across {len(search_variants)} search variants")

    async def _scrape_xhs_note_detail_api(self, note_id: str, client) -> Optional[Dict[str, Any]]:
        """
        Visit an individual note page to extract full content.
        This gets the body text, hashtags, tagged products, comments —
        the rich data that catalog listings don't include.
        """
        url = f"https://www.xiaohongshu.com/explore/{note_id}"
        try:
            resp = await client.get(url)
            if resp.status_code != 200:
                return None
            html = resp.text

            detail = {}

            # Parse __INITIAL_STATE__ for structured note data
            json_match = re.search(r'window\.__INITIAL_STATE__\s*=\s*({.+?})\s*;', html, re.DOTALL)
            if json_match:
                try:
                    state = json.loads(json_match.group(1).replace("undefined", "null"))
                    note_data = (state.get("note") or {}).get("noteDetailMap", {})
                    # The note is keyed by note_id
                    note_obj = None
                    for key, val in note_data.items():
                        note_obj = val.get("note", {})
                        break

                    if note_obj:
                        # Body text (the main content)
                        detail["body_text"] = note_obj.get("desc", "")

                        # Hashtags / tags
                        tag_list = note_obj.get("tagList", [])
                        detail["hashtags"] = [
                            t.get("name", "") for t in tag_list if t.get("name")
                        ]

                        # Tagged products (linked to e-commerce)
                        goods_list = note_obj.get("goodsList", [])
                        detail["tagged_products"] = [
                            {
                                "name": g.get("goodsName", ""),
                                "price": g.get("price", ""),
                                "shop_name": g.get("shopName", ""),
                                "url": g.get("goodsUrl", ""),
                            }
                            for g in goods_list
                        ]

                        # Interaction metrics (detailed)
                        interact = note_obj.get("interactInfo", {})
                        detail["likes"] = interact.get("likedCount", "0")
                        detail["comments_count"] = interact.get("commentCount", "0")
                        detail["collects"] = interact.get("collectedCount", "0")
                        detail["shares"] = interact.get("shareCount", "0")

                        # Is this a collaboration/sponsored post?
                        detail["is_sponsored"] = bool(note_obj.get("brandInfo"))
                        detail["brand_collab"] = note_obj.get("brandInfo", {}).get("name", "")

                        # Author info
                        user = note_obj.get("user", {})
                        detail["author_name"] = user.get("nickname", "")
                        detail["author_followers"] = user.get("fansCount", 0)
                        detail["author_id"] = user.get("userId", "")

                        # Images
                        image_list = note_obj.get("imageList", [])
                        detail["image_urls"] = [
                            img.get("urlDefault", img.get("url", ""))
                            for img in image_list
                        ]
                        detail["image_count"] = len(image_list)

                        # Top comments (if embedded)
                        comments = state.get("note", {}).get("comments", [])
                        detail["top_comments"] = [
                            {
                                "text": c.get("content", ""),
                                "likes": c.get("likeCount", 0),
                            }
                            for c in comments[:10]
                        ]

                except (json.JSONDecodeError, KeyError) as e:
                    logger.warning(f"Failed to parse note detail {note_id}: {e}")

            return detail if detail else None

        except Exception as e:
            logger.warning(f"Note detail scrape failed for {note_id}: {e}")
            return None

    async def _enrich_top_notes(self, data: XhsBrandData, client, top_n: int = 50):
        """
        Visit the top N notes (by engagement) to get full content.
        Enriches the note catalog with body text, hashtags, tagged products,
        comment samples, and author info.
        """
        if not data.full_note_catalog:
            return

        # Sort by likes, take top N
        sorted_notes = sorted(
            data.full_note_catalog,
            key=lambda n: self._parse_like_count(n.get("likes", "0")),
            reverse=True,
        )
        top_notes = [n for n in sorted_notes[:top_n] if n.get("note_id")]

        enriched_count = 0
        for note in top_notes:
            note_id = note["note_id"]
            detail = await self._scrape_xhs_note_detail_api(note_id, client)

            if detail:
                note["body_text"] = detail.get("body_text", "")
                note["hashtags"] = detail.get("hashtags", [])
                note["tagged_products"] = detail.get("tagged_products", [])
                note["is_sponsored"] = detail.get("is_sponsored", False)
                note["brand_collab"] = detail.get("brand_collab", "")
                note["author_followers"] = detail.get("author_followers", 0)
                note["comments_count"] = detail.get("comments_count", "0")
                note["shares"] = detail.get("shares", "0")
                note["top_comments"] = detail.get("top_comments", [])
                note["image_urls"] = detail.get("image_urls", [])
                note["image_count"] = detail.get("image_count", 0)
                enriched_count += 1

            await self._rate_limit_delay()

        logger.info(f"Enriched {enriched_count}/{len(top_notes)} top notes with full content")

    async def _scrape_xhs_note_catalog_api(self, account_id: str, client, data: XhsBrandData, max_pages: int = 10):
        """
        Paginate through all notes on a user's profile via API.
        XHS profile page embeds notes in __INITIAL_STATE__, and subsequent
        pages can be fetched with cursor-based pagination.
        """
        all_notes = []
        cursor = ""

        for page_num in range(max_pages):
            try:
                if page_num == 0:
                    # First page: load profile page HTML
                    url = f"https://www.xiaohongshu.com/user/profile/{account_id}"
                    resp = await client.get(url)
                    if resp.status_code != 200:
                        break
                    html = resp.text

                    # Parse notes from __INITIAL_STATE__
                    json_match = re.search(r'window\.__INITIAL_STATE__\s*=\s*({.+?})\s*;', html, re.DOTALL)
                    if json_match:
                        try:
                            state = json.loads(json_match.group(1).replace("undefined", "null"))
                            user_data = state.get("user", {})
                            notes_data = user_data.get("notes", [])
                            cursor = user_data.get("cursor", "")

                            for note in notes_data:
                                all_notes.append({
                                    "note_id": note.get("id", ""),
                                    "title": note.get("displayTitle", note.get("title", "")),
                                    "likes": str(note.get("likedCount", note.get("likes", 0))),
                                    "type": "video_note" if note.get("type") == "video" else "image_note",
                                    "cover_url": note.get("cover", {}).get("url", ""),
                                    "timestamp": note.get("time", ""),
                                })
                        except (json.JSONDecodeError, KeyError) as e:
                            logger.warning(f"Failed to parse profile notes: {e}")
                            break
                else:
                    # Subsequent pages: use XHS internal API with cursor
                    if not cursor:
                        break

                    api_url = f"https://www.xiaohongshu.com/api/sns/web/v1/user_posted"
                    params = {
                        "num": "30",
                        "cursor": cursor,
                        "user_id": account_id,
                        "image_formats": "jpg,webp,avif",
                    }
                    resp = await client.get(api_url, params=params)
                    if resp.status_code != 200:
                        break

                    try:
                        result = resp.json()
                        notes_data = result.get("data", {}).get("notes", [])
                        cursor = result.get("data", {}).get("cursor", "")
                        has_more = result.get("data", {}).get("has_more", False)

                        if not notes_data:
                            break

                        for note in notes_data:
                            display_title = note.get("display_title", note.get("title", ""))
                            interact = note.get("interact_info", {})
                            all_notes.append({
                                "note_id": note.get("note_id", ""),
                                "title": display_title,
                                "likes": str(interact.get("liked_count", 0)),
                                "comments_count": str(interact.get("comment_count", 0)),
                                "collects": str(interact.get("collected_count", 0)),
                                "type": "video_note" if note.get("type") == "video" else "image_note",
                                "cover_url": note.get("cover", {}).get("url_default", ""),
                                "timestamp": note.get("time", ""),
                            })

                        if not has_more or not cursor:
                            break

                    except (json.JSONDecodeError, KeyError) as e:
                        logger.warning(f"Failed to parse paginated notes: {e}")
                        break

                await self._rate_limit_delay()

            except Exception as e:
                logger.warning(f"Catalog page {page_num} failed: {e}")
                break

        data.full_note_catalog = all_notes

        # Update d3 with full catalog data (much more representative)
        if all_notes:
            sorted_notes = sorted(
                all_notes,
                key=lambda n: self._parse_like_count(n.get("likes", "0")),
                reverse=True,
            )
            data.d3_top_notes = sorted_notes[:50]
            data.d3_content_types = self._classify_content_types(all_notes)

        logger.info(f"XHS API catalog: collected {len(all_notes)} notes for {account_id}")

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
