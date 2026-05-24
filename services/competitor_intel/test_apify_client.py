"""
Tests for ApifyScraperClient (services/competitor_intel/scrapers/apify_client.py).

Real-fixture-driven: tests load the actual easyapi output captured during the
A1.5/Tier B spike (2026-05-24) and validate that the mapper produces the exact
dict shape save_brand_profile() expects.

Two fixtures:
  - apify_easyapi_user_posts_songmont_2026-05-24.json  (validated, real)
  - apify_easyapi_profile_songmont_2026-05-24.json     (TBD — populated when
    Will runs the profile actor; until then, profile-mapper tests are skipped)

Run:
    pytest services/competitor_intel/test_apify_client.py -v
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import MagicMock

import pytest

FIXTURE_DIR = Path(__file__).parent / "scrapers" / "fixtures"
USER_POSTS_FIXTURE = FIXTURE_DIR / "apify_easyapi_user_posts_songmont_2026-05-24.json"
PROFILE_FIXTURE = FIXTURE_DIR / "apify_easyapi_profile_songmont_2026-05-24.json"


# ─── Fixtures ──────────────────────────────────────────────────────────────


def _load_user_posts() -> list:
    with open(USER_POSTS_FIXTURE, encoding="utf-8") as f:
        return json.load(f)


def _load_profile() -> list:
    """Returns [] if the profile fixture doesn't exist yet (Will's pending run)."""
    if not PROFILE_FIXTURE.exists():
        return []
    with open(PROFILE_FIXTURE, encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def fake_client(monkeypatch):
    """Build an ApifyScraperClient with the real ApifyClient SDK mocked out."""
    from services.competitor_intel.scrapers import apify_client as mod

    fake_actor = MagicMock()
    fake_dataset = MagicMock()
    fake_apify_client = MagicMock()
    fake_apify_client.actor.return_value = fake_actor
    fake_apify_client.dataset.return_value = fake_dataset

    monkeypatch.setattr(mod, "_ApifyClientSdk", lambda token: fake_apify_client, raising=False)

    client = mod.ApifyScraperClient(apify_token="apify_api_test_fake")
    client._fake_actor = fake_actor
    client._fake_dataset = fake_dataset
    return client


# ─── Construction ──────────────────────────────────────────────────────────


def test_init_requires_token():
    from services.competitor_intel.scrapers.apify_client import ApifyScraperClient
    with pytest.raises(ValueError, match="apify_token is required"):
        ApifyScraperClient(apify_token="")


def test_init_no_cookie_param():
    """easyapi handles auth internally — constructor should NOT accept xhs_cookie."""
    from services.competitor_intel.scrapers.apify_client import ApifyScraperClient
    # Cookie params shouldn't be in the signature; passing one should raise TypeError
    with pytest.raises(TypeError):
        ApifyScraperClient(apify_token="x", xhs_cookie="should_not_exist")


# ─── Parse helpers ─────────────────────────────────────────────────────────


def test_parse_count_handles_int():
    from services.competitor_intel.scrapers.apify_client import _parse_count
    assert _parse_count(42) == 42


def test_parse_count_handles_comma_string():
    """easyapi returns counts like '6,739' — must parse to 6739."""
    from services.competitor_intel.scrapers.apify_client import _parse_count
    assert _parse_count("6,739") == 6739
    assert _parse_count("1,234,567") == 1234567


def test_parse_count_handles_chinese_wan():
    """XHS often abbreviates large numbers: '10万' = 100,000."""
    from services.competitor_intel.scrapers.apify_client import _parse_count
    assert _parse_count("10万") == 100000
    assert _parse_count("3.5万") == 35000


def test_parse_count_handles_chinese_yi():
    """'1亿' = 100,000,000."""
    from services.competitor_intel.scrapers.apify_client import _parse_count
    assert _parse_count("1亿") == 100_000_000


def test_parse_count_returns_zero_on_garbage():
    from services.competitor_intel.scrapers.apify_client import _parse_count
    assert _parse_count(None) == 0
    assert _parse_count("") == 0
    assert _parse_count("not a number") == 0


def test_parse_count_handles_fuzzy_bucket_plus_suffix():
    """Profile actor returns '1万+' / '10K+' for follower buckets.
    We take the LOWER BOUND as the int — '1万+' → 10000.
    """
    from services.competitor_intel.scrapers.apify_client import _parse_count
    assert _parse_count("1万+") == 10000
    assert _parse_count("10K+") == 10000
    assert _parse_count("10+") == 10
    assert _parse_count("5万+") == 50000
    assert _parse_count("100K+") == 100000


def test_extract_user_id_from_profile_url():
    """Profile actor doesn't include user_id field — must parse from URL."""
    from services.competitor_intel.scrapers.apify_client import _extract_user_id_from_profile_url
    assert _extract_user_id_from_profile_url(
        "https://www.rednote.com/user/profile/58c7d02b82ec3977dd42c218"
    ) == "58c7d02b82ec3977dd42c218"
    assert _extract_user_id_from_profile_url(
        "https://www.rednote.com/user/profile/abc123?xsec_token=xyz&xsec_source=pc_search"
    ) == "abc123"
    assert _extract_user_id_from_profile_url("") == ""
    assert _extract_user_id_from_profile_url("https://example.com/no-match") == ""


def test_find_interaction_by_type():
    """easyapi profile.interactions is a list — must find by type tag."""
    from services.competitor_intel.scrapers.apify_client import _find_interaction
    profile_data = {
        "interactions": [
            {"type": "follows", "count": "10+"},
            {"type": "fans", "count": "1万+"},
            {"type": "interaction", "count": "5万+"},
        ]
    }
    assert _find_interaction(profile_data, "fans")["count"] == "1万+"
    assert _find_interaction(profile_data, "interaction")["count"] == "5万+"
    assert _find_interaction(profile_data, "nonexistent") is None
    assert _find_interaction({}, "fans") is None  # missing key OK


def test_derive_note_id_uses_cover_url_hash():
    """easyapi note_id is always empty — derive from cover URL."""
    from services.competitor_intel.scrapers.apify_client import _derive_note_id
    post = {
        "cover": {
            "url_default": "http://sns-web-i10.rednotecdn.com/202605241954/abc123def456/1040g2sg31va4ia9r3qa0!nc_n_webp_mw_1?src=A",
        }
    }
    note_id = _derive_note_id(post)
    assert note_id.startswith("xhs-")
    assert note_id  # non-empty


def test_derive_note_id_stable_across_calls():
    """Same input → same ID (for DB uniqueness)."""
    from services.competitor_intel.scrapers.apify_client import _derive_note_id
    post = {
        "cover": {"url_default": "http://example.com/x"},
        "display_title": "test",
    }
    assert _derive_note_id(post) == _derive_note_id(post)


# ─── Real-fixture validation (the meat of the regression suite) ────────────


def test_real_user_posts_fixture_loads_with_10_items():
    items = _load_user_posts()
    assert len(items) == 10


def test_real_user_posts_has_songmont_branding():
    """Every item should reference Songmont (user_id 58c7d02b82ec3977dd42c218)."""
    items = _load_user_posts()
    for item in items:
        user = (item.get("postData") or {}).get("user") or {}
        assert user.get("user_id") == "58c7d02b82ec3977dd42c218"
        assert "Songmont" in (user.get("nickname") or "")


def test_real_user_posts_have_unique_titles():
    """Sanity check: the 10 items aren't duplicates."""
    items = _load_user_posts()
    titles = {(item.get("postData") or {}).get("display_title") for item in items}
    # Should have ~9-10 unique titles (allow 1 duplicate for safety)
    assert len(titles) >= 9


def test_mapper_handles_easyapi_user_posts_shape(fake_client):
    """End-to-end: real easyapi fixture → mapper → DB-contract dict."""
    items = _load_user_posts()
    result = fake_client._build_save_brand_profile_dict(
        brand_name="Songmont",
        posts_items=items,
        profile_items=[],
    )

    # Top-level keys from save_brand_profile contract
    assert "follower_count" in result
    assert "engagement_metrics" in result
    assert "content_metrics" in result
    assert "raw_dimensions" in result

    # raw_dimensions structure
    rd = result["raw_dimensions"]
    for key in ("d1", "d2", "d3", "d4", "d6"):
        assert key in rd, f"missing raw_dimensions.{key}"

    # d3 top_notes from the 10 posts
    top_notes = rd["d3"]["top_notes"]
    assert len(top_notes) == 10


def test_mapper_parses_liked_count_strings(fake_client):
    """easyapi returns liked_count as '6,739' string — must parse to 6739 int."""
    items = _load_user_posts()
    result = fake_client._build_save_brand_profile_dict(
        brand_name="Songmont",
        posts_items=items,
        profile_items=[],
    )
    top_notes = result["raw_dimensions"]["d3"]["top_notes"]
    # First item in fixture has liked_count "6,739"
    assert top_notes[0]["likes"] == 6739
    # All likes should be ints (not strings)
    for note in top_notes:
        assert isinstance(note["likes"], int)


def test_mapper_extracts_author_from_easyapi_user_block(fake_client):
    """user.nickname → top_notes[].author_name (not author.nickname like zhorex)."""
    items = _load_user_posts()
    result = fake_client._build_save_brand_profile_dict(
        brand_name="Songmont",
        posts_items=items,
        profile_items=[],
    )
    top_notes = result["raw_dimensions"]["d3"]["top_notes"]
    for note in top_notes:
        assert "Songmont" in note["author_name"]


def test_mapper_derives_note_id_from_cover_url(fake_client):
    """easyapi's note_id is always empty — mapper must derive a stable ID."""
    items = _load_user_posts()
    result = fake_client._build_save_brand_profile_dict(
        brand_name="Songmont",
        posts_items=items,
        profile_items=[],
    )
    top_notes = result["raw_dimensions"]["d3"]["top_notes"]
    for note in top_notes:
        assert note["note_id"], f"note_id should be derived, got empty for {note['title'][:30]}"
        assert note["note_id"].startswith("xhs-")


def test_mapper_counts_content_types(fake_client):
    """6 video + 4 normal posts in the Songmont fixture (verified by manual count)."""
    items = _load_user_posts()
    result = fake_client._build_save_brand_profile_dict(
        brand_name="Songmont",
        posts_items=items,
        profile_items=[],
    )
    ct = result["content_metrics"]["content_types"]
    assert ct.get("video") == 6
    assert ct.get("normal") == 4
    # Sanity: counts add to total
    assert sum(ct.values()) == 10


def test_mapper_uses_post_count_as_fallback_for_total_notes(fake_client):
    """When profile fixture is empty, total_notes falls back to len(posts_items)."""
    items = _load_user_posts()
    result = fake_client._build_save_brand_profile_dict(
        brand_name="Songmont",
        posts_items=items,
        profile_items=[],
    )
    assert result["engagement_metrics"]["total_notes"] == 10


def test_mapper_documents_missing_fields_for_easyapi(fake_client):
    """Tier B coverage limit: body_text, hashtags, comments_count are empty
    by design (easyapi user_posts doesn't return them). This test documents
    the limitation — if a future easyapi version adds these, the test will
    fail and prompt the mapper to take advantage.
    """
    items = _load_user_posts()
    result = fake_client._build_save_brand_profile_dict(
        brand_name="Songmont",
        posts_items=items,
        profile_items=[],
    )
    note = result["raw_dimensions"]["d3"]["top_notes"][0]
    assert note["body_text"] == "", "easyapi now populates body_text? Update mapper!"
    assert note["hashtags"] == [], "easyapi now populates hashtags? Update mapper!"
    assert note["comments_count"] == 0, "easyapi now populates comments? Update mapper!"
    assert note["shares"] == 0


def test_products_list_uses_apify_easyapi_confidence_tag(fake_client):
    """data_confidence is 'apify_easyapi' to distinguish from 'direct_scrape'."""
    items = _load_user_posts()
    products = fake_client._build_save_products_list("Songmont", items)
    assert len(products) == 10
    for p in products:
        assert p["data_confidence"] == "apify_easyapi"


def test_products_list_image_urls_populated(fake_client):
    items = _load_user_posts()
    products = fake_client._build_save_products_list("Songmont", items)
    for p in products:
        # Songmont fixture has at least cover URLs on all items
        assert len(p["image_urls"]) >= 1


# ─── Orchestration with mocked SDK ────────────────────────────────────────


def test_scrape_xhs_brand_requires_profile_url(fake_client):
    """The new contract: brand dict MUST have xhs_profile_url."""
    with pytest.raises(ValueError, match="xhs_profile_url"):
        fake_client.scrape_xhs_brand({"name": "Songmont"})  # no profile_url


def test_scrape_xhs_brand_calls_both_actors_in_sequence(fake_client):
    """user_posts first, then profile — both per the orchestration."""
    items = _load_user_posts()
    # First call returns user_posts dataset, second returns profile dataset
    fake_client._fake_actor.call.side_effect = [
        {"defaultDatasetId": "user_posts_ds", "id": "run1"},
        {"defaultDatasetId": "profile_ds", "id": "run2"},
    ]
    fake_client._fake_dataset.iterate_items.side_effect = [
        iter(items),
        iter([{"followers": 50000, "notesCount": 200, "totalLikes": 1500000}]),
    ]

    result = fake_client.scrape_xhs_brand({
        "name": "Songmont",
        "xhs_profile_url": "https://www.rednote.com/user/profile/58c7d02b82ec3977dd42c218",
    })

    assert result.status == "success", f"unexpected errors: {result.errors}"
    assert result.data_dict is not None
    assert len(result.notes_list) == 10
    # Both actors were called
    assert fake_client._fake_actor.call.call_count == 2


def test_scrape_xhs_brand_partial_when_profile_actor_fails(fake_client):
    """Profile actor failure is partial, not fatal — posts still saved."""
    from services.competitor_intel.scrapers.apify_client import ApifyScrapeError
    items = _load_user_posts()

    def side_effect(*args, **kwargs):
        if not hasattr(side_effect, "called"):
            side_effect.called = True
            return {"defaultDatasetId": "user_posts_ds", "id": "run1"}
        raise Exception("simulated profile failure")

    fake_client._fake_actor.call.side_effect = side_effect
    fake_client._fake_dataset.iterate_items.return_value = iter(items)

    result = fake_client.scrape_xhs_brand({
        "name": "Songmont",
        "xhs_profile_url": "https://www.rednote.com/user/profile/58c7d02b82ec3977dd42c218",
    })

    assert result.status == "partial"
    assert any("profile" in e.lower() for e in result.errors)
    assert result.data_dict is not None
    assert len(result.notes_list) == 10  # posts still saved


# ─── A4 stubs ─────────────────────────────────────────────────────────────


def test_scrape_taobao_stub_raises(fake_client):
    with pytest.raises(NotImplementedError, match="A4"):
        fake_client.scrape_taobao_products({"name": "Songmont"})


def test_scrape_douyin_stub_raises(fake_client):
    with pytest.raises(NotImplementedError, match="A4"):
        fake_client.scrape_douyin_brand({"name": "Songmont"})


# ─── Profile-fixture-conditional tests (skip if Will hasn't run profile yet) ──


@pytest.mark.skipif(
    not PROFILE_FIXTURE.exists(),
    reason="Profile fixture not yet captured (waiting on Will's easyapi profile run)",
)
def test_profile_fixture_loads():
    profile = _load_profile()
    assert len(profile) >= 1


@pytest.mark.skipif(
    not PROFILE_FIXTURE.exists(),
    reason="Profile fixture not yet captured",
)
def test_mapper_pulls_real_follower_count_from_profile(fake_client):
    """When profile fixture exists, real follower count flows through."""
    items = _load_user_posts()
    profile = _load_profile()
    result = fake_client._build_save_brand_profile_dict(
        brand_name="Songmont",
        posts_items=items,
        profile_items=profile,
    )
    # Songmont's fixture has "1万+" follower bucket → 10000 lower bound
    assert result["follower_count"] == 10000


@pytest.mark.skipif(
    not PROFILE_FIXTURE.exists(),
    reason="Profile fixture not yet captured",
)
def test_mapper_preserves_fuzzy_follower_display_string(fake_client):
    """We store the raw '1万+' string alongside the int for UI display."""
    profile = _load_profile()
    result = fake_client._build_save_brand_profile_dict(
        brand_name="Songmont",
        posts_items=_load_user_posts(),
        profile_items=profile,
    )
    d2 = result["raw_dimensions"]["d2"]
    assert d2["followers_display"] == "1万+"
    assert d2["total_likes_display"] == "1万+"


@pytest.mark.skipif(
    not PROFILE_FIXTURE.exists(),
    reason="Profile fixture not yet captured",
)
def test_mapper_extracts_brand_metadata_from_profile(fake_client):
    """Profile actor enriches d2 with bio, redId, ipLocation, etc."""
    profile = _load_profile()
    result = fake_client._build_save_brand_profile_dict(
        brand_name="Songmont",
        posts_items=_load_user_posts(),
        profile_items=profile,
    )
    d2 = result["raw_dimensions"]["d2"]
    assert d2["nickname"] == "Songmont山下有松"
    assert d2["red_id"] == "95560643885"
    assert d2["ip_location"] == "上海"
    assert "山下有松" in d2["bio"]
    assert "包中有温度" in d2["bio"]


@pytest.mark.skipif(
    not PROFILE_FIXTURE.exists(),
    reason="Profile fixture not yet captured",
)
def test_mapper_derives_user_id_from_profile_url(fake_client):
    """Profile actor doesn't include user_id field — derived from profileUrl."""
    profile = _load_profile()
    result = fake_client._build_save_brand_profile_dict(
        brand_name="Songmont",
        posts_items=_load_user_posts(),
        profile_items=profile,
    )
    assert result["raw_dimensions"]["d2"]["user_id"] == "58c7d02b82ec3977dd42c218"


@pytest.mark.skipif(
    not PROFILE_FIXTURE.exists(),
    reason="Profile fixture not yet captured",
)
def test_mapper_documents_isverified_limitation(fake_client):
    """easyapi profile output doesn't include explicit isVerified flag.
    Defaults to False. If a future actor version adds it, this test
    should fail and the heuristic should be revisited.
    """
    profile = _load_profile()
    result = fake_client._build_save_brand_profile_dict(
        brand_name="Songmont",
        posts_items=_load_user_posts(),
        profile_items=profile,
    )
    assert result["raw_dimensions"]["d2"]["is_verified"] is False
