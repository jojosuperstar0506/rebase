"""Apify-hosted-actor client for OMI Competitive Intelligence scraping.

Replaces the per-platform Playwright scrapers behind feature flag USE_APIFY=true.
Same DB write path (save_brand_profile / save_products); zero changes needed
in scoring pipelines.

Design: docs/SCRAPING-A2-APIFY-CLIENT-DESIGN.md
Strategy: docs/SCRAPING-STRATEGY.md (Joanna's plan + William's corrections + Tier B decision)
Tracks: GitHub issue #62

ACTOR CHOICES — VALIDATED 2026-05-24
====================================
After spike testing on 2026-05-23 → 24, settled on TWO easyapi actors per brand:

  XHS user posts:   easyapi/rednote-xiaohongshu-user-posts-scraper
  XHS profile:      easyapi/rednote-xiaohongshu-profile-scraper
  (Taobao):         easyapi/... (A4 — separate PR)
  (Douyin):         easyapi/... (A4 — separate PR)

Why easyapi over zhorex (rejected): zhorex returned 0 items in user_posts and
profile modes despite full burner cookies; its search mode also ignored the
searchQuery parameter, returning random feed content. Five iterations confirmed
zhorex is fundamentally broken for our use case. easyapi handles auth
internally via residential proxies + their own cookie pool — we don't pass
session cookies at all.

COVERAGE TIER: B  (d2 brand stats + d3 content strategy)
========================================================
Deferred to future PRs:
  - d4 KOL ecosystem (needs search-mode UGC scraping)
  - d6 consumer sentiment from comments (needs easyapi comments actor)

Per-post fields easyapi user_posts gives us:
  ✓ title (display_title), likes (interact_info.liked_count), type
  ✓ cover image URL (single), author info
  ✗ body text, hashtags, comments/shares/saves counts, multiple images
  ✗ note_id (empty — we derive a stable key from cover URL hash)
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
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


# Apify actor IDs — easyapi's specialized scrapers (validated 2026-05-24).
XHS_USER_POSTS_ACTOR = "easyapi/rednote-xiaohongshu-user-posts-scraper"
XHS_PROFILE_ACTOR = "easyapi/rednote-xiaohongshu-profile-scraper"
TAOBAO_ACTOR_ID = "easyapi/taobao-product-scraper"          # A4
DOUYIN_ACTOR_ID = "easyapi/douyin-scraper"                  # A4


# ─── Exceptions ────────────────────────────────────────────────────────────


class ApifyScrapeError(Exception):
    """Structured error for Apify actor call failures.

    Mirrors the LlmCallError pattern from narrative_pipeline.py
    (William's PR #4fc7b1c precedent).
    """

    def __init__(
        self,
        message: str,
        *,
        actor: str = "",
        brand: str = "",
        status_code: int = 0,
        cost_so_far_usd: float = 0.0,
    ):
        super().__init__(message)
        self.actor = actor
        self.brand = brand
        self.status_code = status_code
        self.cost_so_far_usd = cost_so_far_usd


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


# ─── Helpers (parse, hash, etc.) ───────────────────────────────────────────


def _parse_count(val: Any) -> int:
    """Parse easyapi's stringified counts (e.g., '6,739' or '10万') into int.

    easyapi returns counts as strings with thousands commas or Chinese
    万 ("ten thousand") suffix. Returns 0 on failure (don't crash the scrape).
    """
    if val is None:
        return 0
    if isinstance(val, int):
        return val
    s = str(val).strip().replace(",", "").replace("，", "")
    if not s:
        return 0
    # Handle 万 (10k) and 亿 (100M) Chinese number suffixes
    try:
        if s.endswith("万"):
            return int(float(s[:-1]) * 10000)
        if s.endswith("亿"):
            return int(float(s[:-1]) * 100_000_000)
        if s.endswith("w") or s.endswith("W"):
            return int(float(s[:-1]) * 10000)
        return int(float(s))
    except (ValueError, TypeError):
        return 0


_NOTE_ID_RE = re.compile(r"/([a-f0-9]{16,32})!nc_", re.IGNORECASE)


def _derive_note_id(post: Dict[str, Any]) -> str:
    """easyapi returns note_id="" — derive a stable ID for DB uniqueness.

    Strategy: look for a stable hex hash in the cover image URL. Fallback to
    SHA1 of (display_title + cover URL). Both produce stable IDs that match
    across re-scrapes as long as the post + image don't change.
    """
    cover = post.get("cover") or {}
    cover_url = cover.get("url_default") or cover.get("url") or ""

    # Try to extract a stable hash from the cover URL path
    m = _NOTE_ID_RE.search(cover_url)
    if m:
        return f"xhs-img-{m.group(1)}"

    # Fallback: SHA1 of title + URL
    seed = (post.get("display_title") or "") + cover_url
    if seed.strip():
        return f"xhs-sha-{hashlib.sha1(seed.encode('utf-8')).hexdigest()[:16]}"

    return ""  # truly empty post — caller can skip


# ─── Client ────────────────────────────────────────────────────────────────


class ApifyScraperClient:
    """Production XHS scraping via two easyapi actors per brand.

    Each `scrape_xhs_brand` call makes TWO Apify actor invocations:
      1. easyapi/rednote-xiaohongshu-user-posts-scraper (d3 content)
      2. easyapi/rednote-xiaohongshu-profile-scraper    (d2 brand stats)

    easyapi handles XHS authentication internally (residential proxies +
    their own session pool), so we do NOT pass session cookies. The brand
    dict MUST include an xhs_profile_url field (one-time config per brand).

    Args:
        apify_token: APIFY_API_TOKEN env var. Required.
        cost_logger: callable invoked after each actor call with a dict of
                     {brand, platform, actor, items_returned, estimated_cost_usd,
                      timestamp, run_id}. Pass None to disable.
        max_retries: how many times to retry on transient failures (default 3).
    """

    def __init__(
        self,
        apify_token: str,
        cost_logger: Optional[Callable[[Dict[str, Any]], None]] = None,
        max_retries: int = 3,
    ):
        if not apify_token:
            raise ValueError("apify_token is required (set APIFY_API_TOKEN env var)")

        self._token = apify_token
        self._cost_logger = cost_logger
        self._max_retries = max_retries

        sdk_cls = _ApifyClientSdk
        if sdk_cls is None:
            raise ImportError(
                "apify-client not installed. Run: "
                "pip install -r services/competitor_intel/requirements.txt"
            )
        self._client = sdk_cls(apify_token)

    # ── Public scrape methods ──

    def scrape_xhs_brand(self, brand: Dict[str, Any]) -> ScrapeResult:
        """Scrape one XHS brand via two easyapi actors (user_posts + profile).

        Args:
            brand: dict with at least 'name' and 'xhs_profile_url' keys.
                   The profile URL is one-time-config per brand (set up via
                   admin UI or seed_test_data.py).

        Returns:
            ScrapeResult with data_dict matching save_brand_profile() contract.

        Raises:
            ApifyScrapeError on unrecoverable failure. Partial successes
            (e.g., posts worked but profile failed) return status="partial".
        """
        brand_name = brand.get("name") or brand.get("brand_name") or ""
        profile_url = brand.get("xhs_profile_url") or brand.get("profile_url") or ""

        if not brand_name:
            raise ValueError(f"brand requires 'name' key, got: {brand}")
        if not profile_url:
            raise ValueError(
                f"brand '{brand_name}' missing 'xhs_profile_url' — must be "
                f"configured before scraping (one-time per brand)"
            )

        result = ScrapeResult(status="failed", brand_name=brand_name, platform="xhs")

        # ── Call 1: user_posts (d3 content) ──
        try:
            posts_items = self._call_easyapi_user_posts(profile_url, brand_name, max_items=50)
        except ApifyScrapeError as exc:
            result.errors.append(f"user_posts actor failed: {exc}")
            return result  # posts are critical — no posts = no content data

        # ── Call 2: profile (d2 brand stats) ──
        profile_items: List[Dict[str, Any]] = []
        try:
            profile_items = self._call_easyapi_profile(profile_url, brand_name)
        except ApifyScrapeError as exc:
            # Profile failure is degradation, not fatal — partial scrape is OK
            logger.warning("Profile actor failed for %s: %s", brand_name, exc)
            result.errors.append(f"profile actor failed: {exc}")

        # ── Map combined output → save_brand_profile() dict ──
        try:
            data_dict = self._build_save_brand_profile_dict(
                brand_name=brand_name,
                posts_items=posts_items,
                profile_items=profile_items,
            )
            notes_list = self._build_save_products_list(brand_name, posts_items)
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
        raise NotImplementedError("A4 task — easyapi Taobao actor integration pending")

    def scrape_douyin_brand(self, brand: Dict[str, Any]) -> ScrapeResult:
        """Douyin brand scrape. A4 — separate PR."""
        raise NotImplementedError("A4 task — easyapi Douyin actor integration pending")

    # ── Actor call helpers ──

    def _call_easyapi_user_posts(
        self,
        profile_url: str,
        brand: str,
        max_items: int = 50,
    ) -> List[Dict[str, Any]]:
        """Call easyapi/rednote-xiaohongshu-user-posts-scraper.

        Input shape: {"profileUrls": [url], "maxItems": N}
        Output shape: list of items each with {"profileUrl", "postData", "scrapedAt"}.
        """
        return self._call_actor(
            actor_id=XHS_USER_POSTS_ACTOR,
            actor_input={
                "profileUrls": [profile_url],
                "maxItems": max_items,
            },
            brand=brand,
            label="user_posts",
        )

    def _call_easyapi_profile(self, profile_url: str, brand: str) -> List[Dict[str, Any]]:
        """Call easyapi/rednote-xiaohongshu-profile-scraper.

        Input shape: {"profileUrls": [url]}
        Output shape: list of profile items with brand stats.
        """
        return self._call_actor(
            actor_id=XHS_PROFILE_ACTOR,
            actor_input={"profileUrls": [profile_url]},
            brand=brand,
            label="profile",
        )

    def _call_actor(
        self,
        *,
        actor_id: str,
        actor_input: Dict[str, Any],
        brand: str,
        label: str,
    ) -> List[Dict[str, Any]]:
        """Single Apify actor call with retries + cost logging.

        SYNC method — uses time.sleep() for backoff. The Apify Python SDK
        is synchronous; if A3 calls this from an async context, wrap with
        ``asyncio.to_thread()`` (which scrape_runner._scrape_brand_via_apify
        already does).
        """
        logger.info("apify: %s actor=%s brand=%s", label, actor_id, brand)

        last_exc: Optional[Exception] = None
        for attempt in range(1, self._max_retries + 1):
            try:
                run = self._client.actor(actor_id).call(run_input=actor_input)
                items = list(self._client.dataset(run["defaultDatasetId"]).iterate_items())

                cost_estimate = self._estimate_cost(actor_id, len(items))
                self._log_cost({
                    "brand": brand,
                    "platform": "xhs",
                    "actor": actor_id,
                    "label": label,
                    "items_returned": len(items),
                    "estimated_cost_usd": cost_estimate,
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "run_id": run.get("id", ""),
                })

                logger.info("apify: %s done items=%d cost=$%.4f", label, len(items), cost_estimate)
                return items

            except Exception as exc:
                last_exc = exc
                if attempt < self._max_retries:
                    backoff = 2 ** attempt
                    logger.warning(
                        "apify: %s failed (attempt %d/%d): %s — retrying in %ds",
                        label, attempt, self._max_retries, exc, backoff,
                    )
                    time.sleep(backoff)

        raise ApifyScrapeError(
            f"Actor {actor_id} failed after {self._max_retries} attempts: {last_exc}",
            actor=actor_id,
            brand=brand,
        )

    def _estimate_cost(self, actor_id: str, items_returned: int) -> float:
        """Pricing source: Apify actor pages as of 2026-05-24.

        easyapi/rednote-xiaohongshu-*-scraper: $4.99 / 1000 results = $0.005 / item.
        """
        return 0.005 * items_returned

    def _log_cost(self, payload: Dict[str, Any]) -> None:
        if self._cost_logger is None:
            return
        try:
            self._cost_logger(payload)
        except Exception:  # cost logging must never break the scrape
            logger.exception("cost_logger raised — continuing")

    # ── Field mappers (easyapi output → DB dict shape) ────────────────────
    #
    # Contract source of truth: scrape_runner.py:_save_result() lines 73-138.
    # The new wrapper must produce the SAME dict shape so scoring pipelines
    # (which read DB JSONB columns) are completely untouched.
    #
    # easyapi user_posts schema (validated against real Songmont fixture
    # apify_easyapi_user_posts_songmont_2026-05-24.json):
    #
    #   item = {
    #     "profileUrl": str,
    #     "postData": {
    #       "postUrl": str,        # generic explore URL, not per-post permalink
    #       "type": "video" | "normal",
    #       "display_title": str,
    #       "user": {"nick_name", "nickname", "avatar", "user_id"},
    #       "interact_info": {"liked_count": str(comma-formatted), "sticky": bool},
    #       "cover": {"url_default", "url_pre", "info_list": [...]},
    #       "note_id": "" (always empty — we derive via _derive_note_id),
    #       "xsec_token": str
    #     },
    #     "scrapedAt": str
    #   }
    #
    # easyapi profile schema (TBD — validated when Will sends profile fixture).

    def _build_save_brand_profile_dict(
        self,
        *,
        brand_name: str,
        posts_items: List[Dict[str, Any]],
        profile_items: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Build the EXACT dict shape save_brand_profile() expects.

        Contract: scrape_runner.py:73-138.
        """
        # ── d2 from profile actor (if it ran) ──
        prof = profile_items[0] if profile_items else {}
        # easyapi profile field paths TBD — placeholders use best-guess based on
        # the schema doc's mention of "fans count" and "nickname".
        # Will be corrected to verified paths when profile fixture arrives.
        follower_count = _parse_count(
            (prof.get("interactions") or {}).get("fans")
            or prof.get("followers")
            or prof.get("fansCount")
            or 0
        )
        total_notes = _parse_count(
            prof.get("notesCount")
            or prof.get("totalNotes")
            or len(posts_items)  # fallback: count of posts we scraped
        )
        total_likes = _parse_count(
            prof.get("totalLikes")
            or prof.get("likedAndCollected")
            or 0
        )
        is_verified = bool(prof.get("isVerified") or prof.get("verified"))
        brand_user_id = (
            prof.get("userId") or prof.get("user_id") or ""
        )
        # Fall back to user_id from first post if profile didn't return one
        if not brand_user_id and posts_items:
            first_user = (posts_items[0].get("postData") or {}).get("user") or {}
            brand_user_id = first_user.get("user_id") or ""
        brand_nickname = (
            prof.get("nickname") or prof.get("nick_name") or brand_name
        )

        # ── d3 from user_posts actor ──
        top_notes = self._map_posts_to_top_notes(posts_items[:50])
        content_types: Dict[str, int] = {}
        for item in posts_items:
            post = item.get("postData") or {}
            t = (post.get("type") or "normal").lower()
            content_types[t] = content_types.get(t, 0) + 1

        # d4.note_authors filtered (easyapi user_posts only returns the brand
        # itself as author for each post; no UGC mentions yet — that needs the
        # search actor in a future PR)
        d4_note_authors: List[Dict[str, Any]] = []

        return {
            "follower_count": follower_count,
            "total_products": None,  # XHS has no product concept at the user level
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
                    "search_suggestions": [],  # not from user_posts; A4 candidate
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
                    "catalog_size": len(posts_items),
                },
                "d4": {
                    "kols": [],
                    "note_authors": d4_note_authors,
                },
                "d6": {
                    "sentiment_keywords": [],  # needs comments actor; A4 candidate
                    "positive_keywords": [],
                    "negative_keywords": [],
                    "consumer_comments": [],
                },
            },
        }

    def _map_posts_to_top_notes(self, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Map easyapi user_posts items → d3.top_notes shape.

        Per scrape_runner.py:96-114, each top_notes entry needs:
          title, body_text, likes, comments_count, shares, hashtags,
          tagged_products, is_sponsored, brand_collab, author_followers,
          image_count, top_comments, note_id, type, author_name

        easyapi user_posts populates: title, likes, type, author_name, cover image.
        Everything else is empty/zero — deferred to comments/search actors in A4.
        """
        out = []
        for item in items:
            if not isinstance(item, dict):
                continue
            post = item.get("postData") or {}
            user = post.get("user") or {}
            cover = post.get("cover") or {}
            interact = post.get("interact_info") or {}

            cover_url = cover.get("url_default") or cover.get("url") or ""
            note_id = _derive_note_id(post)

            out.append({
                "title":             post.get("display_title") or "",
                "body_text":         "",  # easyapi doesn't populate; needs comments actor
                "likes":             _parse_count(interact.get("liked_count")),
                "comments_count":    0,   # not populated by user_posts actor
                "shares":            0,
                "hashtags":          [],  # not populated by user_posts actor
                "tagged_products":   [],
                "is_sponsored":      False,
                "brand_collab":      "",
                "author_followers":  0,
                "author_name":       user.get("nickname") or user.get("nick_name") or "",
                "image_count":       1 if cover_url else 0,
                "top_comments":      [],
                "note_id":           note_id,
                "type":              post.get("type") or "normal",
                "cover_url":         cover_url,  # extra: useful for the Brief UI
            })
        return out

    def _build_save_products_list(
        self,
        brand_name: str,
        items: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Map easyapi user_posts items → save_products() list shape."""
        out = []
        for i, item in enumerate(items):
            if not isinstance(item, dict):
                continue
            post = item.get("postData") or {}
            cover = post.get("cover") or {}
            interact = post.get("interact_info") or {}
            note_id = _derive_note_id(post) or f"{brand_name}-easyapi-{i}"
            cover_url = cover.get("url_default") or cover.get("url") or ""

            out.append({
                "product_id":      note_id,
                "product_name":    post.get("display_title") or "",
                "sales_volume":    _parse_count(interact.get("liked_count")),
                "review_count":    0,  # not in easyapi user_posts output
                "product_url":     post.get("postUrl") or "",
                "image_urls":      [cover_url] if cover_url else [],
                "category":        None,  # would need hashtags — not available
                "data_confidence": "apify_easyapi",
            })
        return out


# ─── Smoke test entrypoint (for A3 local verification) ─────────────────────
#
#   APIFY_API_TOKEN=apify_api_xxx \
#       python -m services.competitor_intel.scrapers.apify_client \
#         --brand Songmont \
#         --profile-url https://www.rednote.com/user/profile/58c7d02b82ec3977dd42c218
#
# Prints the produced data_dict to stdout. Does NOT touch the database.

def _smoke_test_main():
    import argparse
    import json as _json
    parser = argparse.ArgumentParser(description="A3 smoke test for ApifyScraperClient (easyapi)")
    parser.add_argument("--brand", default="Songmont")
    parser.add_argument("--profile-url", required=True,
                        help="XHS profile URL, e.g. https://www.rednote.com/user/profile/<userId>")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    token = os.environ.get("APIFY_API_TOKEN")
    if not token:
        print("ERROR: APIFY_API_TOKEN env var not set", flush=True)
        return 1

    client = ApifyScraperClient(apify_token=token)
    result = client.scrape_xhs_brand({
        "name": args.brand,
        "xhs_profile_url": args.profile_url,
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
