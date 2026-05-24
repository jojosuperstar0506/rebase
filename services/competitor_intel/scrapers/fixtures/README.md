# Apify recorded fixtures

Real Apify Console output captured during the A1 / A1.5 / Tier B spike (2026-05-22 → 24).
Used by `services/competitor_intel/test_apify_client.py` as test data.

## What we have

| File | Actor | Mode | Date | Notes |
|---|---|---|---|---|
| `apify_xhs_search_2026-05-23.json` | `zhorex/rednote-xiaohongshu-scraper` | search | 2026-05-23 | **HISTORICAL — zhorex rejected.** Search-mode query was ignored (returned algorithmic feed, not Songmont). Kept as evidence-of-failure for the strategy doc. |
| `apify_easyapi_user_posts_songmont_2026-05-24.json` | `easyapi/rednote-xiaohongshu-user-posts-scraper` | user_posts | 2026-05-24 | **ACTIVE.** 10 real Songmont posts. Drives all real-fixture mapper tests. |
| `apify_easyapi_profile_songmont_2026-05-24.json` | `easyapi/rednote-xiaohongshu-profile-scraper` | profile | 2026-05-24 | **ACTIVE.** Songmont profile with basicInfo + interactions (fuzzy follower buckets). |

## easyapi user_posts schema (validated 2026-05-24)

Each item:
```
{
  "profileUrl": str,
  "postData": {
    "postUrl": str,              # generic explore URL, not per-post permalink
    "type": "video" | "normal",
    "display_title": str,
    "user": {"nickname", "nick_name", "avatar", "user_id"},
    "interact_info": {
      "liked_count": str,        # comma-formatted: "6,739"
      "sticky": bool
    },
    "cover": {"url_default", "url_pre", "info_list": [...]},
    "note_id": "" (ALWAYS EMPTY),
    "xsec_token": str
  },
  "scrapedAt": str
}
```

**Populated fields:** postId, type, display_title, user.*, interact_info.liked_count, cover.*, xsec_token
**Empty/missing in user_posts:** body text (content), tags, comments, shares, saves, publishedAt, multiple images, note_id

## easyapi profile schema (validated 2026-05-24)

```
{
  "profileUrl": str,
  "profileData": {
    "basicInfo": {"nickname", "redId", "gender", "ipLocation", "desc", "images", "imageb"},
    "interactions": [
      {"type": "follows", "count": "10+", "i18nCount": "10+", "name": "Following"},
      {"type": "fans", "count": "1万+", "i18nCount": "10K+", "name": "Followers"},
      {"type": "interaction", "count": "1万+", "i18nCount": "10K+", "name": "Likes & Saves"}
    ],
    "tags": [...]
  },
  "scrapedAt": str
}
```

**KEY LIMITATION: counts are FUZZY BUCKETS, not exact integers.**
- `"1万+"` (10K+) means ">= 10,000 but < 50,000". XHS displays buckets, not exact counts, as anti-scraping measure.
- `_parse_count()` takes the lower bound (`"1万+"` → 10000).
- This means scoring pipelines that need exact follower counts for week-over-week momentum will hit a ceiling — Songmont staying in the "1万+" bucket means no detectable growth.
- Eventually need chanmama / feigua (Joanna's Layer 2) for exact counts. Deferred.

**Other limitations:**
- No `isVerified` flag in output (heuristic in mapper checks tags; defaults False)
- No `user_id` field (parsed from `profileUrl` path via `_extract_user_id_from_profile_url`)
- No `notesCount` (mapper falls back to `len(posts_items)` — a lower bound only)

## Implications for `apify_client.py`

Per Tier B coverage:
- ✅ d2 brand identity (nickname, user_id, redId, bio, ipLocation)
- ⚠️ d2 quantitative (followers / total_likes are bucketed; total_notes is len(posts))
- ✅ d3 content strategy (title, likes, type, author_name, cover_url)
- ⚠️ d3 narrative depth (no body_text or hashtags — degraded)
- ❌ d4 KOL ecosystem (deferred to A4 search actor)
- ❌ d6 sentiment (deferred to A4 comments actor)

## How to add a new fixture

After running easyapi (or any) actor with a known input:
1. Output tab → All fields → JSON view
2. Copy the entire array
3. Save here as `apify_<vendor>_<mode>_<brand>_<date>.json`
4. Update this README's table
5. Update `test_apify_client.py` if any tests should use the new fixture
6. Run `pytest services/competitor_intel/test_apify_client.py -v` to verify
