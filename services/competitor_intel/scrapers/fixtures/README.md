# Apify recorded fixtures

Real Apify Console output captured during A1 testing. Used by
`services/competitor_intel/test_apify_client.py` as test data.

## What we have

| File | Mode | Date | Source | Notes |
|---|---|---|---|---|
| `apify_xhs_search_2026-05-23.json` | search | 2026-05-23 | Apify Console run, query="Songmont", 10 items | **Search mode is thin** — returns only postId, title, likes, author. content/tags/images/comments/shares are empty. Query "Songmont" returned feed content, not Songmont-related posts. |

## Confirmed shape of search-mode output (zhorex/rednote-xiaohongshu-scraper)

Per-item fields populated by **search mode**:
- `postId`, `postUrl`, `xsecToken` ✓
- `type` (video / normal) ✓
- `title` ✓
- `likes` ✓
- `author.userId`, `author.nickname`, `author.avatar`, `authorName` ✓
- `mode`, `scrapedAt` ✓

Per-item fields **empty in search mode** (need post_details mode to enrich):
- `content` (post body text) — always `""`
- `tags` (hashtags) — always `[]`
- `images` — always `[]`
- `videoUrl` — always `null`
- `comments`, `shares`, `saves` — always `0`
- `publishedAt`, `location` — always `""`

## Implications for `apify_client.py`

For our scoring pipelines that need `top_notes[].body_text`, `top_notes[].hashtags`,
`top_notes[].comments_count`, etc. — search mode alone is insufficient.

Production approach: use `user_posts` mode (richer per-post data) as the primary,
optionally enrich with `post_details` for top-N posts.

## How to add a new fixture

After running Apify Console with a known input:
1. Output tab → All fields → JSON view
2. Copy the entire array
3. Save here as `apify_<platform>_<mode>_<date>.json`
4. Update this README's table
5. Update `test_apify_client.py` if any tests should use the new fixture
