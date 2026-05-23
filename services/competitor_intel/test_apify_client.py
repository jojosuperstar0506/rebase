"""
Tests for ApifyScraperClient (services/competitor_intel/scrapers/apify_client.py).

Synthetic-fixture phase: these tests use hand-constructed dicts shaped like
zhorex/rednote-xiaohongshu-scraper's documented output (per Apify marketplace
page, fetched 2026-05-22). They validate the structural code paths — mapping,
login-wall detection, retry logic — without making live API calls.

When Will completes A1 (manual Apify Console run), replace the SYNTHETIC_SEARCH
and SYNTHETIC_PROFILE constants with the recorded fixture from his Console
output. Tests should keep passing — if any fail, the mapper needs revision
because Apify's actual output differs from documented schema.

Run:
    pytest services/competitor_intel/test_apify_client.py -v
"""

from __future__ import annotations

import os
from unittest.mock import patch, MagicMock

import pytest


# ─── Synthetic fixtures (replace with real A1 output later) ────────────────

# Search-mode response — shape per zhorex docs. Each item is one XHS post.
SYNTHETIC_SEARCH = [
    {
        "postId": "abc123",
        "postUrl": "https://www.xiaohongshu.com/explore/abc123",
        "type": "normal",
        "title": "Songmont 新款帆布包测评",
        "content": "今天分享一下 Songmont 的新款帆布包...",
        "hashtag": ["Songmont", "帆布包", "穿搭"],
        "publishedAt": "2026-05-20T10:00:00Z",
        "images": ["https://sns-img.xhscdn.com/img1.jpg", "https://sns-img.xhscdn.com/img2.jpg"],
        "likes": 1500,
        "comments": 87,
        "shares": 42,
        "saves": 230,
        "author": {
            "userId": "songmont_official",
            "nickname": "Songmont 官方",
            "avatar": "https://avatar.xhscdn.com/songmont.jpg",
        },
        "authorName": "Songmont 官方",
        "scrapedAt": "2026-05-22T08:00:00Z",
    },
    {
        "postId": "def456",
        "postUrl": "https://www.xiaohongshu.com/explore/def456",
        "type": "video",
        "title": "口袋包真的不实用吗？",
        "content": "Songmont 口袋包入手三个月真实感受...",
        "hashtag": ["Songmont", "口袋包"],
        "publishedAt": "2026-05-18T15:30:00Z",
        "images": ["https://sns-img.xhscdn.com/img3.jpg"],
        "videoUrl": "https://video.xhscdn.com/vid1.mp4",
        "likes": 850,
        "comments": 45,
        "shares": 12,
        "saves": 110,
        "author": {
            "userId": "user_xyz",
            "nickname": "随便看看",
        },
        "authorName": "随便看看",
    },
]

# Profile-mode response — shape per zhorex docs. Single profile item.
SYNTHETIC_PROFILE = [
    {
        "userId": "songmont_official",
        "profileUrl": "https://www.xiaohongshu.com/user/profile/songmont_official",
        "redId": "songmont",
        "nickname": "Songmont 官方",
        "avatar": "https://avatar.xhscdn.com/songmont.jpg",
        "description": "原创设计 · 都市轻奢",
        "gender": "female",
        "location": "上海",
        "followers": 47200,
        "following": 12,
        "totalLikes": 285000,
        "notesCount": 340,
        "isVerified": True,
        "tags": ["原创设计", "包袋", "穿搭"],
    }
]

LOGIN_WALL_FIXTURE = [
    {
        "title": "登录小红书",
        "content": "请先登录后查看内容",
    }
]


# ─── Fixtures ──────────────────────────────────────────────────────────────


@pytest.fixture
def fake_client(monkeypatch):
    """Build an ApifyScraperClient with the real ApifyClient mocked out."""
    # Set required env vars
    monkeypatch.setenv("APIFY_API_TOKEN", "apify_api_test_fake")

    # Patch the SDK class before instantiating our wrapper
    from services.competitor_intel.scrapers import apify_client as mod

    fake_actor = MagicMock()
    fake_dataset = MagicMock()
    fake_apify_client = MagicMock()
    fake_apify_client.actor.return_value = fake_actor
    fake_apify_client.dataset.return_value = fake_dataset

    monkeypatch.setattr(mod, "_ApifyClientSdk", lambda token: fake_apify_client, raising=False)

    client = mod.ApifyScraperClient(apify_token="apify_api_test_fake", xhs_cookie="web_session=fake")
    # Expose the mock so tests can configure return values
    client._fake_actor = fake_actor
    client._fake_dataset = fake_dataset
    return client


# ─── Construction ──────────────────────────────────────────────────────────


def test_init_requires_token():
    from services.competitor_intel.scrapers.apify_client import ApifyScraperClient
    with pytest.raises(ValueError, match="apify_token is required"):
        ApifyScraperClient(apify_token="")


# ─── Login-wall detection ──────────────────────────────────────────────────


def test_login_wall_detected_in_results(fake_client):
    assert fake_client._detect_login_wall(LOGIN_WALL_FIXTURE) is True


def test_login_wall_not_detected_in_normal_results(fake_client):
    assert fake_client._detect_login_wall(SYNTHETIC_SEARCH) is False


def test_login_wall_empty_results_returns_false(fake_client):
    assert fake_client._detect_login_wall([]) is False


# ─── Profile URL guessing ─────────────────────────────────────────────────


def test_guess_profile_url_finds_brand_match(fake_client):
    url = fake_client._guess_brand_profile_url(SYNTHETIC_SEARCH, "Songmont")
    assert url == "https://www.xiaohongshu.com/user/profile/songmont_official"


def test_guess_profile_url_returns_none_when_no_match(fake_client):
    url = fake_client._guess_brand_profile_url(SYNTHETIC_SEARCH, "UnknownBrand")
    assert url is None


# ─── Cost estimation ──────────────────────────────────────────────────────


def test_cost_estimate_search_mode(fake_client):
    # 30 search items at $0.010 each
    assert fake_client._estimate_cost("zhorex/rednote-xiaohongshu-scraper", "search", 30) == pytest.approx(0.30)


def test_cost_estimate_profile_mode(fake_client):
    # Profile mode: $0.020 per profile, minimum 1
    assert fake_client._estimate_cost("zhorex/rednote-xiaohongshu-scraper", "profile", 1) == pytest.approx(0.020)


# ─── Mapper: posts → top_notes (DB contract) ──────────────────────────────


def test_mapper_produces_save_brand_profile_dict_shape(fake_client):
    """The output must match scrape_runner.py:_save_result's dict contract exactly."""
    result_dict = fake_client._build_save_brand_profile_dict(
        brand_name="Songmont",
        search_items=SYNTHETIC_SEARCH,
        profile_items=SYNTHETIC_PROFILE,
    )

    # Top-level keys required by save_brand_profile (db_bridge.py:save_brand_profile)
    assert "follower_count" in result_dict
    assert "total_products" in result_dict
    assert "avg_price" in result_dict
    assert "engagement_metrics" in result_dict
    assert "content_metrics" in result_dict
    assert "raw_dimensions" in result_dict

    # Engagement metrics shape
    em = result_dict["engagement_metrics"]
    assert "total_likes" in em
    assert "total_notes" in em

    # Raw dimensions — d1/d2/d3/d4/d6 shape
    rd = result_dict["raw_dimensions"]
    for key in ("d1", "d2", "d3", "d4", "d6"):
        assert key in rd, f"raw_dimensions missing {key}"


def test_mapper_pulls_follower_count_from_profile(fake_client):
    result = fake_client._build_save_brand_profile_dict(
        brand_name="Songmont",
        search_items=SYNTHETIC_SEARCH,
        profile_items=SYNTHETIC_PROFILE,
    )
    assert result["follower_count"] == 47200


def test_mapper_pulls_total_notes_from_profile(fake_client):
    result = fake_client._build_save_brand_profile_dict(
        brand_name="Songmont",
        search_items=SYNTHETIC_SEARCH,
        profile_items=SYNTHETIC_PROFILE,
    )
    assert result["engagement_metrics"]["total_notes"] == 340


def test_mapper_pulls_total_likes_from_profile(fake_client):
    result = fake_client._build_save_brand_profile_dict(
        brand_name="Songmont",
        search_items=SYNTHETIC_SEARCH,
        profile_items=SYNTHETIC_PROFILE,
    )
    assert result["engagement_metrics"]["total_likes"] == 285000


def test_mapper_handles_missing_profile_gracefully(fake_client):
    """If profile mode failed/was skipped, fields default to 0/empty without raising."""
    result = fake_client._build_save_brand_profile_dict(
        brand_name="Songmont",
        search_items=SYNTHETIC_SEARCH,
        profile_items=[],   # no profile data
    )
    assert result["follower_count"] == 0
    assert result["engagement_metrics"]["total_notes"] == 0
    # But posts list should still be populated from search
    assert len(result["raw_dimensions"]["d3"]["top_notes"]) == 2


def test_mapper_counts_content_types_from_posts(fake_client):
    result = fake_client._build_save_brand_profile_dict(
        brand_name="Songmont",
        search_items=SYNTHETIC_SEARCH,
        profile_items=SYNTHETIC_PROFILE,
    )
    # SYNTHETIC_SEARCH has 1 "normal" + 1 "video"
    content_types = result["content_metrics"]["content_types"]
    assert content_types.get("normal") == 1
    assert content_types.get("video") == 1


def test_mapper_top_notes_have_expected_fields(fake_client):
    result = fake_client._build_save_brand_profile_dict(
        brand_name="Songmont",
        search_items=SYNTHETIC_SEARCH,
        profile_items=SYNTHETIC_PROFILE,
    )
    top_notes = result["raw_dimensions"]["d3"]["top_notes"]
    assert len(top_notes) == 2

    note = top_notes[0]
    # The exact fields scrape_runner.py:_save_result reads (lines 96-114)
    for key in ("title", "body_text", "likes", "comments_count", "shares",
                "hashtags", "is_sponsored", "author_followers", "image_count",
                "note_id", "type"):
        assert key in note, f"top_note missing {key}"


def test_mapper_post_to_top_note_field_types(fake_client):
    result = fake_client._build_save_brand_profile_dict(
        brand_name="Songmont",
        search_items=SYNTHETIC_SEARCH,
        profile_items=SYNTHETIC_PROFILE,
    )
    note = result["raw_dimensions"]["d3"]["top_notes"][0]
    assert isinstance(note["likes"], int)
    assert isinstance(note["comments_count"], int)
    assert isinstance(note["shares"], int)
    assert isinstance(note["hashtags"], list)
    assert isinstance(note["image_count"], int)
    assert note["image_count"] == 2  # 2 image URLs in SYNTHETIC_SEARCH[0]


# ─── save_products mapper ─────────────────────────────────────────────────


def test_products_list_matches_save_products_contract(fake_client):
    products = fake_client._build_save_products_list("Songmont", SYNTHETIC_SEARCH)
    assert len(products) == 2

    p = products[0]
    # Fields required by db_bridge.py:save_products
    for key in ("product_id", "product_name", "sales_volume", "review_count",
                "product_url", "image_urls", "category", "data_confidence"):
        assert key in p, f"product missing {key}"

    assert p["data_confidence"] == "apify"


# ─── End-to-end orchestration (with mocked Apify SDK) ─────────────────────


def test_scrape_xhs_brand_returns_success_when_search_and_profile_work(fake_client):
    # First .call() returns search data, second returns profile data
    fake_client._fake_actor.call.side_effect = [
        {"defaultDatasetId": "search_dataset_id", "id": "run1"},
        {"defaultDatasetId": "profile_dataset_id", "id": "run2"},
    ]
    # iterate_items returns the corresponding fixture per dataset
    fake_client._fake_dataset.iterate_items.side_effect = [
        iter(SYNTHETIC_SEARCH),
        iter(SYNTHETIC_PROFILE),
    ]

    result = fake_client.scrape_xhs_brand({"name": "Songmont", "keyword": "Songmont"})

    assert result.status == "success", f"unexpected errors: {result.errors}"
    assert result.brand_name == "Songmont"
    assert result.platform == "xhs"
    assert result.data_dict is not None
    assert result.data_dict["follower_count"] == 47200
    assert len(result.notes_list) == 2


def test_scrape_xhs_brand_partial_when_profile_skipped_no_cookie(monkeypatch):
    """If no cookie set, profile mode is skipped but search-only result is still 'partial'."""
    monkeypatch.setenv("APIFY_API_TOKEN", "apify_api_test_fake")

    from services.competitor_intel.scrapers import apify_client as mod

    fake_actor = MagicMock()
    fake_dataset = MagicMock()
    fake_apify_client = MagicMock()
    fake_apify_client.actor.return_value = fake_actor
    fake_apify_client.dataset.return_value = fake_dataset
    monkeypatch.setattr(mod, "_ApifyClientSdk", lambda token: fake_apify_client, raising=False)

    # No cookie passed → profile mode skipped
    client = mod.ApifyScraperClient(apify_token="apify_api_test_fake", xhs_cookie=None)

    fake_actor.call.return_value = {"defaultDatasetId": "ds", "id": "run"}
    fake_dataset.iterate_items.return_value = iter(SYNTHETIC_SEARCH)

    result = client.scrape_xhs_brand({"name": "Songmont", "keyword": "Songmont"})

    # Search succeeded; profile skipped → partial
    assert result.status == "partial"
    assert any("cookie" in e.lower() or "profile" in e.lower() for e in result.errors)
    # data_dict still populated from search alone
    assert result.data_dict is not None
    assert result.data_dict["follower_count"] == 0  # no profile = no follower data
    assert len(result.data_dict["raw_dimensions"]["d3"]["top_notes"]) == 2


def test_scrape_xhs_brand_raises_on_login_wall(fake_client):
    from services.competitor_intel.scrapers.apify_client import ApifyScrapeError

    fake_client._fake_actor.call.return_value = {"defaultDatasetId": "ds", "id": "run"}
    fake_client._fake_dataset.iterate_items.return_value = iter(LOGIN_WALL_FIXTURE)

    with pytest.raises(ApifyScrapeError) as exc_info:
        fake_client.scrape_xhs_brand({"name": "Songmont", "keyword": "Songmont"})
    assert exc_info.value.cookie_expired is True


# ─── A4 stubs ─────────────────────────────────────────────────────────────


def test_scrape_taobao_stub_raises(fake_client):
    with pytest.raises(NotImplementedError, match="A4"):
        fake_client.scrape_taobao_products({"name": "Songmont"})


def test_scrape_douyin_stub_raises(fake_client):
    with pytest.raises(NotImplementedError, match="A4"):
        fake_client.scrape_douyin_brand({"name": "Songmont"})
