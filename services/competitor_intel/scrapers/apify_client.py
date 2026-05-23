"""Apify-hosted-actor client for OMI Competitive Intelligence scraping.

Replaces the per-platform Playwright scrapers behind feature flag USE_APIFY=true.
Same DB write path (save_brand_profile / save_products); zero changes needed
in scoring pipelines.

Design: docs/SCRAPING-A2-APIFY-CLIENT-DESIGN.md
Strategy: docs/SCRAPING-STRATEGY.md (Joanna's plan + William's corrections)
Tracks: GitHub issue #62

Actor choices (validated 2026-05-22):
  - XHS:    zhorex/rednote-xiaohongshu-scraper  (active; huggable_quote is deprecated)
  - Taobao: pizani/taobao-product-scraper       (A4 — stubbed here)
  - Douyin: natanielsantos/douyin-scraper       (A4 — stubbed here, needs fallback)

Why this file exists:
  Our 750-line Playwright XHS scraper is structurally losing the anti-bot
  arms race. Joanna's burner account got banned 2026-04-22 even with
  conservative rate limits. Apify outsources the arms race to a vendor whose
  full-time job is keeping their actors working. We pay ~$80-110/mo and stop
  patching detection bypasses ourselves.

  This client is the integration layer. It reads APIFY_API_TOKEN and
  XHS_SESSION_COOKIE from env vars (per CLAUDE.md no-hardcoding rule),
  calls Apify's hosted actors, and produces the exact dict shape that
  scrape_runner.py:_save_result() expects to pass to save_brand_profile().
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


# Import the third-party apify-client SDK at module level so tests can
# monkey-patch this attribute. Falls back to None if the package isn't
# installed; ApifyScraperClient.__init__ raises a helpful ImportError then.
try:
    from apify_client import ApifyClient as _ApifyClientSdk
except ImportError:
    _ApifyClientSdk = None


# Apify actor IDs — kept here (not in scraping_rules.yml) because they're
# tightly coupled to the per-actor mapping code below. If we move to a
# different XHS actor later, the mapping logic changes too — single source
# of truth for the (actor_id, mapping_function) pair belongs in code.
XHS_ACTOR_ID = "zhorex/rednote-xiaohongshu-scraper"
TAOBAO_ACTOR_ID = "pizani/taobao-product-scraper"           # A4
DOUYIN_ACTOR_ID_PRIMARY = "natanielsantos/douyin-scraper"   # A4
DOUYIN_ACTOR_ID_FALLBACK = None                             # A4 — pick at A4 time

# Login-wall markers — load from scraping_rules.yml (same source of truth as
# xhs_scraper.py uses). Fall back to a hardcoded set if the YAML loader fails,
# so a config error doesn't take down the cron silently.
try:
    from ..scraping_config import auth_wall_markers as _yaml_auth_wall_markers, ScrapingRulesError
    try:
        _LOGIN_WALL_MARKERS = tuple(_yaml_auth_wall_markers("xhs")) or (
            "扫码登录", "登录后查看", "登录小红书", "请先登录",
            "Scan with logged-in", "QR code expires",
        )
    except ScrapingRulesError as _e:
        logger.warning(
            "scraping_rules.yml load failed (%s); falling back to hardcoded login-wall markers",
            _e,
        )
        _LOGIN_WALL_MARKERS = (
            "扫码登录", "登录后查看", "登录小红书", "请先登录",
            "Scan with logged-in", "QR code expires",
        )
except ImportError:
    # scraping_config not importable (e.g., test environment without yaml) — fall back
    _LOGIN_WALL_MARKERS = (
        "扫码登录", "登录后查看", "登录小红书", "请先登录",
        "Scan with logged-in", "QR code expires",
    )


# ─── Exceptions ────────────────────────────────────────────────────────────


class ApifyScrapeError(Exception):
    """Structured error for Apify actor call failures.

    Carries enough context that the caller can decide whether to retry,
    skip the brand, or alert. Mirrors the LlmCallError pattern from
    narrative_pipeline.py (William's PR #4fc7b1c precedent).
    """

    def __init__(
        self,
        message: str,
        *,
        mode: str = "",
        brand: str = "",
        actor: str = "",
        status_code: int = 0,
        cost_so_far_usd: float = 0.0,
        cookie_expired: bool = False,
    ):
        super().__init__(message)
        self.mode = mode
        self.brand = brand
        self.actor = actor
        self.status_code = status_code
        self.cost_so_far_usd = cost_so_far_usd
        self.cookie_expired = cookie_expired


# ─── Result type ───────────────────────────────────────────────────────────


@dataclass
class ScrapeResult:
    """Output of a single scrape_*_brand() call.

    `data_dict` is the EXACT dict shape that save_brand_profile() expects
    (see scrape_runner.py:73-138). Caller can pass it through unchanged.
    `notes_list` is the list-of-dicts shape that save_products() expects.
    """
    status: str  # "success" | "partial" | "failed"
    brand_name: str = ""
    platform: str = ""
    data_dict: Optional[Dict[str, Any]] = None
    notes_list: List[Dict[str, Any]] = field(default_factory=list)
    cost_estimate_usd: float = 0.0
    errors: List[str] = field(default_factory=list)


# ─── Client ────────────────────────────────────────────────────────────────


class ApifyScraperClient:
    """Production XHS / Taobao / Douyin scraping via Apify hosted actors.

    Stateless per-call; instantiate once per process (e.g., in scrape_runner.py)
    and reuse for all brands in a daily run.

    Args:
        apify_token: APIFY_API_TOKEN env var. Required.
        xhs_cookie: XHS_SESSION_COOKIE env var. Optional for search mode;
                    required for profile mode and comments.
        cost_logger: callable invoked after each actor call with a dict of
                     {brand, platform, actor, mode, items_returned,
                      estimated_cost_usd, timestamp, run_id}. Used by W2/A2's
                     cost-logging hook. Pass None to disable.
        max_retries: how many times to retry on transient failures (default 3).
    """

    def __init__(
        self,
        apify_token: str,
        xhs_cookie: Optional[str] = None,
        cost_logger: Optional[Callable[[Dict[str, Any]], None]] = None,
        max_retries: int = 3,
    ):
        if not apify_token:
            raise ValueError("apify_token is required (set APIFY_API_TOKEN env var)")

        self._token = apify_token
        self._xhs_cookie = xhs_cookie
        self._cost_logger = cost_logger
        self._max_retries = max_retries

        # Module-level _ApifyClientSdk is the real SDK class when installed,
        # None otherwise. Tests monkey-patch this module attribute to inject a fake.
        sdk_cls = _ApifyClientSdk
        if sdk_cls is None:
            raise ImportError(
                "apify-client not installed. Run: "
                "pip install -r services/competitor_intel/requirements.txt"
            )
        self._client = sdk_cls(apify_token)

    # ── Public scrape methods ──

    def scrape_xhs_brand(self, brand: Dict[str, Any]) -> ScrapeResult:
        """Scrape one XHS brand via Apify (search + profile, two actor calls).

        Args:
            brand: dict with at least 'name' and 'keyword' keys. Matches the
                   shape scrape_runner.py reads from get_scrape_targets().

        Returns:
            ScrapeResult with data_dict matching save_brand_profile() contract.

        Raises:
            ApifyScrapeError on unrecoverable failure. Partial successes
            (e.g., search worked but profile failed) return status="partial"
            rather than raising.
        """
        brand_name = brand.get("name") or brand.get("brand_name") or ""
        keyword = brand.get("keyword") or brand_name
        if not brand_name or not keyword:
            raise ValueError(f"brand requires 'name' and 'keyword' keys, got: {brand}")

        result = ScrapeResult(status="failed", brand_name=brand_name, platform="xhs")

        # ── Call 1: search mode (gets posts) ──
        try:
            search_items = self._call_actor(
                actor_id=XHS_ACTOR_ID,
                actor_input={
                    "mode": "search",
                    "searchQuery": keyword,
                    "maxResults": 30,
                    **({"cookieString": self._xhs_cookie} if self._xhs_cookie else {}),
                },
                mode_label="search",
                brand=brand_name,
            )
        except ApifyScrapeError as exc:
            result.errors.append(f"search mode failed: {exc}")
            return result  # search is critical — no posts = no data

        if self._detect_login_wall(search_items):
            result.errors.append("login wall detected in search results (cookie expired?)")
            raise ApifyScrapeError(
                "XHS search returned login-wall content",
                mode="search", brand=brand_name, actor=XHS_ACTOR_ID,
                cookie_expired=True,
            )

        # ── Call 2: profile mode (gets follower count + total stats) ──
        # Cookie usually required for profile mode. If we don't have one,
        # skip this call and degrade gracefully.
        profile_items: List[Dict[str, Any]] = []
        profile_url = self._guess_brand_profile_url(search_items, brand_name)
        if profile_url and self._xhs_cookie:
            try:
                profile_items = self._call_actor(
                    actor_id=XHS_ACTOR_ID,
                    actor_input={
                        "mode": "profile",
                        "userUrl": profile_url,
                        "cookieString": self._xhs_cookie,
                    },
                    mode_label="profile",
                    brand=brand_name,
                )
            except ApifyScrapeError as exc:
                # Don't bail the whole scrape on profile failure — degrade
                logger.warning("Profile mode failed for %s: %s", brand_name, exc)
                result.errors.append(f"profile mode failed: {exc}")
        elif not profile_url:
            result.errors.append("no brand profile URL found in search results")
        elif not self._xhs_cookie:
            result.errors.append("XHS_SESSION_COOKIE not set — skipped profile mode")

        # ── Map combined output → save_brand_profile() dict ──
        try:
            data_dict = self._build_save_brand_profile_dict(
                brand_name=brand_name,
                search_items=search_items,
                profile_items=profile_items,
            )
            notes_list = self._build_save_products_list(brand_name, search_items)
        except Exception as exc:  # mapper bugs shouldn't bring down the cron
            logger.exception("Mapping failed for %s", brand_name)
            result.errors.append(f"mapping failed: {exc}")
            return result

        result.data_dict = data_dict
        result.notes_list = notes_list
        result.status = "partial" if result.errors else "success"
        return result

    def scrape_taobao_products(self, brand: Dict[str, Any]) -> ScrapeResult:
        """Taobao product search. A4 — separate PR."""
        raise NotImplementedError("A4 task — pizani/taobao-product-scraper integration pending")

    def scrape_douyin_brand(self, brand: Dict[str, Any]) -> ScrapeResult:
        """Douyin brand scrape. A4 — separate PR with primary+fallback path."""
        raise NotImplementedError("A4 task — natanielsantos/douyin-scraper + fallback pending")

    # ── Internal helpers ──

    def _call_actor(
        self,
        *,
        actor_id: str,
        actor_input: Dict[str, Any],
        mode_label: str,
        brand: str,
    ) -> List[Dict[str, Any]]:
        """Single Apify actor call with retries + cost logging.

        Retries up to self._max_retries on transient errors (rate limit,
        timeout). Non-transient errors raise ApifyScrapeError immediately.

        SYNC method — uses time.sleep() for backoff. The Apify Python SDK
        is synchronous; if A3 calls this from an async context, wrap with
        ``asyncio.to_thread()`` or ``loop.run_in_executor()`` to avoid
        blocking the event loop.
        """
        # Sanitize input for logging — never log cookieString
        safe_input = {k: v for k, v in actor_input.items() if k != "cookieString"}
        logger.info("apify: %s actor=%s brand=%s input=%s", mode_label, actor_id, brand, safe_input)

        last_exc: Optional[Exception] = None
        for attempt in range(1, self._max_retries + 1):
            try:
                run = self._client.actor(actor_id).call(run_input=actor_input)
                items = list(self._client.dataset(run["defaultDatasetId"]).iterate_items())

                # Cost estimation — refined at A3 time once we see actual billing
                cost_estimate = self._estimate_cost(actor_id, mode_label, len(items))
                self._log_cost({
                    "brand": brand,
                    "platform": "xhs" if "xiaohongshu" in actor_id or "rednote" in actor_id else "unknown",
                    "actor": actor_id,
                    "mode": mode_label,
                    "items_returned": len(items),
                    "estimated_cost_usd": cost_estimate,
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "run_id": run.get("id", ""),
                })

                logger.info("apify: %s done items=%d cost=$%.4f", mode_label, len(items), cost_estimate)
                return items

            except Exception as exc:
                last_exc = exc
                # Apify SDK raises generic exceptions — we'd refine these
                # once we see real failure shapes in A3 testing. Until then,
                # treat all as potentially-transient and retry.
                if attempt < self._max_retries:
                    backoff = 2 ** attempt
                    logger.warning(
                        "apify: %s failed (attempt %d/%d): %s — retrying in %ds",
                        mode_label, attempt, self._max_retries, exc, backoff,
                    )
                    time.sleep(backoff)

        raise ApifyScrapeError(
            f"Actor {actor_id} failed after {self._max_retries} attempts: {last_exc}",
            mode=mode_label,
            brand=brand,
            actor=actor_id,
        )

    def _detect_login_wall(self, items: List[Any]) -> bool:
        """Walk the returned items looking for XHS login-wall markers."""
        if not items:
            return False
        text_blob = " ".join(
            str(v) for item in items if isinstance(item, dict)
            for v in item.values() if isinstance(v, str)
        )[:5000]  # truncate to avoid quadratic cost on large outputs
        return any(marker in text_blob for marker in _LOGIN_WALL_MARKERS)

    def _guess_brand_profile_url(
        self,
        search_items: List[Dict[str, Any]],
        brand_name: str,
    ) -> Optional[str]:
        """Best-effort: find a brand's official profile URL in search results.

        Looks for posts whose author.nickname matches brand_name (case-insensitive),
        then constructs the profile URL from author.userId.
        """
        target = brand_name.lower()
        for item in search_items:
            if not isinstance(item, dict):
                continue
            author = item.get("author") or {}
            if not isinstance(author, dict):
                continue
            nick = (author.get("nickname") or "").lower()
            user_id = author.get("userId") or ""
            if user_id and target in nick:
                return f"https://www.xiaohongshu.com/user/profile/{user_id}"
            # Fallback shapes some actors return
            if (item.get("authorName") or "").lower() == target and item.get("authorUserId"):
                return f"https://www.xiaohongshu.com/user/profile/{item['authorUserId']}"
        return None

    def _estimate_cost(self, actor_id: str, mode: str, items_returned: int) -> float:
        """Rough per-call cost estimate. Refined at A3 with real billing data.

        Pricing source: Apify actor pages as of 2026-05-22.
        zhorex/rednote-xiaohongshu-scraper: per-event pricing
            - search post: $0.010/post
            - profile: $0.020/profile
            - comments: $0.005/comment
            - videos: $0.025/video
        """
        if mode == "search":
            return 0.010 * items_returned
        if mode == "profile":
            return 0.020 * max(1, items_returned)
        if mode == "comments":
            return 0.005 * items_returned
        if mode == "video":
            return 0.025 * items_returned
        return 0.0

    def _log_cost(self, payload: Dict[str, Any]) -> None:
        if self._cost_logger is None:
            return
        try:
            self._cost_logger(payload)
        except Exception:  # cost logging must never break the scrape
            logger.exception("cost_logger raised — continuing")

    # ── Field mappers (Apify output → DB dict shape) ──
    #
    # STUB. These functions need a real Apify Console run output (A1) to
    # validate field paths. Current implementation is the educated-guess
    # version based on zhorex's documented schema fetched 2026-05-22 from
    # https://apify.com/zhorex/rednote-xiaohongshu-scraper.
    #
    # After A1 completes, replace educated guesses with verified field paths,
    # using the recorded fixture as ground truth.

    def _build_save_brand_profile_dict(
        self,
        *,
        brand_name: str,
        search_items: List[Dict[str, Any]],
        profile_items: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Produce the exact dict shape save_brand_profile() expects.

        Contract source of truth: scrape_runner.py:73-138.
        """
        profile = profile_items[0] if profile_items else {}

        # Top-level stats from profile mode
        follower_count = profile.get("followers") or 0
        total_notes = profile.get("notesCount") or 0
        total_likes = profile.get("totalLikes") or 0
        is_verified = bool(profile.get("isVerified"))
        brand_user_id = profile.get("userId") or ""
        brand_nickname = profile.get("nickname") or brand_name

        # Build d3.top_notes from search results (up to 50)
        top_notes = self._map_posts_to_top_notes(search_items[:50])

        # d4.note_authors from filtered top_notes
        d4_note_authors = [
            {
                "name": n.get("author_name", ""),
                "followers": n.get("author_followers", 0),
                "is_sponsored": n.get("is_sponsored", False),
            }
            for n in top_notes if n.get("author_followers", 0) > 10000
        ][:20]

        # d3.content_types: count posts by type
        content_types: Dict[str, int] = {}
        for item in search_items:
            t = (item.get("type") or "normal").lower()
            content_types[t] = content_types.get(t, 0) + 1

        return {
            "follower_count": follower_count,
            "total_products": None,  # XHS has no product concept
            "avg_price": None,
            "engagement_metrics": {
                "total_likes": total_likes,
                "total_notes": total_notes,
            },
            "content_metrics": {
                "content_types": content_types,
            },
            "raw_dimensions": {
                "d1": {
                    "search_suggestions": [],  # zhorex search doesn't return this; A4 candidate
                    "search_volume_rank": "",
                },
                "d2": {
                    "followers": follower_count,
                    "total_notes": total_notes,
                    "total_likes": total_likes,
                    "is_verified": is_verified,
                    "user_id": brand_user_id,
                    "nickname": brand_nickname,
                },
                "d3": {
                    "content_types": content_types,
                    "top_notes": top_notes,
                    "catalog_size": len(search_items),
                },
                "d4": {
                    "kols": [],  # would need per-author profile lookups; A4 candidate
                    "note_authors": d4_note_authors,
                },
                "d6": {
                    "sentiment_keywords": [],  # needs comments mode (cookie-gated); A5/A4 candidate
                    "positive_keywords": [],
                    "negative_keywords": [],
                    "consumer_comments": [],
                },
            },
        }

    def _map_posts_to_top_notes(self, posts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Map Apify post items → d3.top_notes shape (per scrape_runner.py:96-114)."""
        out = []
        for p in posts:
            if not isinstance(p, dict):
                continue
            author = p.get("author") or {}
            images = p.get("images") or []
            hashtags = p.get("hashtag") or p.get("hashtags") or p.get("tags") or []
            out.append({
                "title":              p.get("title", "") or "",
                "body_text":          p.get("content", "") or "",
                "likes":              int(p.get("likes", 0) or 0),
                "comments_count":     int(p.get("comments", 0) or 0),
                "shares":             int(p.get("shares", 0) or 0),
                "hashtags":           hashtags if isinstance(hashtags, list) else [],
                "tagged_products":    [],  # not surfaced by zhorex search mode
                "is_sponsored":       False,  # not surfaced; could regex on content for #广告
                "brand_collab":       "",
                "author_followers":   0,  # would require per-post author lookup
                "author_name":        author.get("nickname") or p.get("authorName") or "",
                "image_count":        len(images) if isinstance(images, list) else 0,
                "top_comments":       [],  # needs comments mode
                "note_id":            p.get("postId", "") or "",
                "type":               p.get("type", "normal") or "normal",
            })
        return out

    def _build_save_products_list(
        self,
        brand_name: str,
        search_items: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Notes-as-products list (per scrape_runner.py:148-158 pattern)."""
        out = []
        for i, p in enumerate(search_items):
            if not isinstance(p, dict):
                continue
            note_id = p.get("postId", f"{brand_name}-{i}")
            images = p.get("images") or []
            hashtags = p.get("hashtag") or p.get("hashtags") or p.get("tags") or []
            out.append({
                "product_id":      note_id,
                "product_name":    p.get("title", "") or "",
                "sales_volume":    int(p.get("likes", 0) or 0),
                "review_count":    int(p.get("comments", 0) or 0),
                "product_url":     p.get("postUrl") or (f"https://www.xiaohongshu.com/explore/{note_id}" if note_id else ""),
                "image_urls":      images if isinstance(images, list) else [],
                "category":        ", ".join(hashtags[:5]) if isinstance(hashtags, list) and hashtags else None,
                "data_confidence": "apify",
            })
        return out


# ─── Smoke test entrypoint (for A3 local verification) ─────────────────────
#
# Not invoked from production. Run by hand to verify the wrapper works:
#
#   USE_APIFY=true \
#   APIFY_API_TOKEN=apify_api_xxx \
#   XHS_SESSION_COOKIE='web_session=...' \
#       python -m services.competitor_intel.scrapers.apify_client --brand Songmont
#
# Prints the produced data_dict to stdout for visual inspection. Does NOT
# touch the database.

def _smoke_test_main():
    import argparse
    import json as _json
    parser = argparse.ArgumentParser(description="A2/A3 smoke test for ApifyScraperClient")
    parser.add_argument("--brand", default="Songmont")
    parser.add_argument("--keyword", default=None, help="Override search keyword")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    token = os.environ.get("APIFY_API_TOKEN")
    cookie = os.environ.get("XHS_SESSION_COOKIE")
    if not token:
        print("ERROR: APIFY_API_TOKEN env var not set", flush=True)
        return 1

    client = ApifyScraperClient(apify_token=token, xhs_cookie=cookie)
    result = client.scrape_xhs_brand({
        "name": args.brand,
        "keyword": args.keyword or args.brand,
    })

    print(f"\nstatus: {result.status}")
    print(f"errors: {result.errors}")
    print(f"cost estimate: ${result.cost_estimate_usd:.4f}")
    print(f"notes saved: {len(result.notes_list)}")
    if result.data_dict:
        print("\n=== data_dict (would go to save_brand_profile) ===")
        print(_json.dumps(result.data_dict, ensure_ascii=False, indent=2)[:4000])
        print("... (truncated for readability)")
    return 0 if result.status in ("success", "partial") else 1


if __name__ == "__main__":
    import sys
    sys.exit(_smoke_test_main())
