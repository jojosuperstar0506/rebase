# A2 Design — `apify_client.py`

> **Status:** Design only — code lands when A1 (Apify signup + burner XHS + manual Console test) completes.
> **Tracks:** Issue [#62](https://github.com/jojosuperstar0506/rebase/issues/62) · PR [#81](https://github.com/jojosuperstar0506/rebase/pull/81)
> **Strategy doc:** `docs/SCRAPING-STRATEGY.md` (Joanna's plan + William's corrections)
> **Owner:** William (cross into Joanna's `services/competitor_intel/` per CODEOWNERS — Joanna reviews)

---

## Why this doc exists

A1 verifies the actor works in the Apify Console manually. A2 builds the Python wrapper that makes those Console calls automatically as part of our daily pipeline. This doc captures the design decisions for A2 so the moment A1 reports back "actor works," coding starts without re-deriving the file shape.

The integration contract is **the dict shape that `save_brand_profile()` accepts**, not `XhsBrandData`. Source of truth: `scrape_runner.py:_save_result()` lines 73-138. The new `apify_client.py` must produce that exact dict shape so zero changes are needed in the 16 downstream scoring pipelines.

---

## File location & module shape

```
services/competitor_intel/scrapers/apify_client.py
```

Single file. Single class. ~250-350 lines.

```python
class ApifyScraperClient:
    """Production XHS/Taobao/Douyin scraping via Apify hosted actors.

    Replaces the per-platform Playwright scrapers behind feature flag
    USE_APIFY=true. Same DB write path (save_brand_profile/save_products);
    zero changes required in scoring pipelines.
    """

    def __init__(self,
                 apify_token: str,
                 xhs_cookie: Optional[str] = None,
                 cost_logger: Optional[Callable] = None):
        ...

    def scrape_xhs_brand(self, brand: dict) -> ScrapeResult:
        """Run search + profile, produce save_brand_profile dict, return ScrapeResult."""
        ...

    def scrape_taobao_products(self, brand: dict) -> ScrapeResult:
        """A4 work — separate PR. Stub here for the contract."""
        raise NotImplementedError("A4")

    def scrape_douyin_brand(self, brand: dict) -> ScrapeResult:
        """A4 work — separate PR. Stub here for the contract."""
        raise NotImplementedError("A4")
```

`ScrapeResult` is a small dataclass: `status`, `data_dict`, `notes_list`, `cost_estimate`, `errors`. Keeps the method signatures clean and lets the caller decide whether to save / retry / alert.

---

## Feature flag

Per CLAUDE.md ("never hardcode external service URLs / API keys / region-specific config"), all new behavior goes behind `USE_APIFY=true`. Read by `scrape_runner.py`:

```python
USE_APIFY = os.environ.get("USE_APIFY", "false").lower() == "true"

if USE_APIFY:
    from .scrapers.apify_client import ApifyScraperClient
    client = ApifyScraperClient(
        apify_token=os.environ["APIFY_API_TOKEN"],
        xhs_cookie=os.environ.get("XHS_SESSION_COOKIE"),
    )
    result = client.scrape_xhs_brand(brand)
else:
    # Existing Playwright path — untouched
    result = await xhs_scraper.scrape_brand_api(brand)
```

Default `false`. Production cron stays on Playwright until **optional A6 (3-day parallel run)** shows Apify is at parity with score-drift < 5%. If A6 is skipped per Will's call, cutover happens after A3 lands and a single-day manual verification.

---

## DB write contract — must match exactly

The dict passed to `save_brand_profile(platform, brand_name, data, scrape_tier)` MUST have this shape (from `scrape_runner.py:73-138`):

```python
{
    "follower_count": int | None,
    "total_products": int | None,    # OK to leave None for XHS (no product concept)
    "avg_price": float | None,       # OK to leave None for XHS
    "engagement_metrics": {
        "total_likes": int | None,
        "total_notes": int | None,
    },
    "content_metrics": {
        "content_types": dict | None,  # {"image_post": 12, "video": 8, ...}
    },
    "raw_dimensions": {
        "d1": {"search_suggestions": list, "search_volume_rank": str},
        "d2": {"followers": int, "total_notes": int, "total_likes": int},
        "d3": {
            "content_types": dict,
            "top_notes": [  # ← the big one, 50 items max
                {
                    "title": str,
                    "body_text": str,
                    "likes": int,
                    "comments_count": int,
                    "shares": int,
                    "hashtags": list,
                    "tagged_products": list,
                    "is_sponsored": bool,
                    "brand_collab": str,
                    "author_followers": int,
                    "image_count": int,
                    "top_comments": list,  # up to 5 per note
                    "note_id": str,
                    "type": str,
                },
                ...
            ],
            "catalog_size": int,
        },
        "d4": {
            "kols": list,
            "note_authors": [  # filtered to author_followers > 10k, top 20
                {"name": str, "followers": int, "is_sponsored": bool},
                ...
            ],
        },
        "d6": {
            "sentiment_keywords": list,
            "positive_keywords": list,
            "negative_keywords": list,
            "consumer_comments": list,  # up to 30, drawn from top_comments
        },
    },
}
```

`apify_client.scrape_xhs_brand()` builds this dict and returns it inside `ScrapeResult.data_dict`. The caller (probably `scrape_runner.py`) then passes it to `save_brand_profile()` unchanged.

---

## Apify call sequence

For one brand, two Apify actor runs (validated manually in Apify Console during A1):

| Order | Mode | Cookie? | What we extract |
|---|---|---|---|
| 1 | `search` | optional | Posts list → `d3.top_notes`, plus authorName/userId for profile URL |
| 2 | `profile` | usually required | `followers` → `follower_count`, `totalLikes` → `engagement_metrics.total_likes`, `notesCount` → `engagement_metrics.total_notes`, `isVerified` |

Combined output is mapped to the DB dict above. Order matters: search results may include the brand's own posts which surface the `author.userId` we then feed to profile mode.

**Failure modes:**
- Search returns empty → entire scrape fails (no posts ≈ no scoring signal)
- Profile mode fails (cookie expired) → mark partial, set scrape_status="partial", populate what we have. Don't drop the whole scrape.
- Apify rate-limited → exponential backoff, retry up to 3 times. If still failing, mark connection_expired, alert per A5 runbook.

---

## Cost logging

Apify charges per actor run + per event (post, profile, comment). We need per-brand cost tracking so we know our COGS per workspace.

Approach: pass a `cost_logger` callable into the client. Each actor call logs:
```python
{
    "brand": "Songmont",
    "platform": "xhs",
    "actor": "zhorex/rednote-xiaohongshu-scraper",
    "mode": "search",
    "items_returned": 30,
    "estimated_cost_usd": 0.30,  # search mode pricing × items
    "timestamp": "2026-05-22T15:00:00Z",
    "run_id": "apify_run_xxx",
}
```

Persisted to a new lightweight table `apify_run_log` (1 new migration, ~20 lines of SQL). Aggregated weekly to show per-workspace cost.

**Migration:** `backend/migrations/012_apify_run_log.sql` (William owns per CODEOWNERS). 1 PR with just the migration so it's reviewable in isolation.

---

## Error handling

Per `narrative_pipeline.py:LlmCallError` precedent (PR #4fc7b1c "LLM hardening — surface real errors"), introduce `ApifyScrapeError` exception class:

```python
class ApifyScrapeError(Exception):
    def __init__(self, message, *, mode, brand, cost_so_far=0, status_code=0):
        super().__init__(message)
        self.mode = mode
        self.brand = brand
        self.cost_so_far = cost_so_far
        self.status_code = status_code
```

Caller catches and decides:
- `scrape_runner.py` → marks brand as scrape_status="failed", continues to next brand
- Cron alerts on >N failures per run (>20% failure rate threshold)

---

## Tests

Two test files:

```
services/competitor_intel/scrapers/tests/test_apify_client.py
    test_dict_shape_matches_save_brand_profile_contract
    test_search_mode_input_uses_searchQuery_not_keyword
    test_profile_mode_falls_back_when_no_cookie
    test_combined_output_populates_all_critical_fields

services/competitor_intel/scrapers/tests/test_apify_mapper.py
    test_post_to_top_notes_mapping
    test_author_followers_filter_to_d4
    test_image_count_derived_from_images_array
```

Recorded fixtures saved during A1 manual Console testing — download the JSON from a successful Apify Console run for Songmont (search + profile modes), save as `apify_search_songmont.json` + `apify_profile_songmont.json` under `services/competitor_intel/scrapers/fixtures/`. Tests use these fixtures — no live API calls in tests.

---

## A2 PR plan

Tracks #62. Files in the PR:

| File | Purpose |
|---|---|
| `services/competitor_intel/scrapers/apify_client.py` | NEW — the wrapper |
| `services/competitor_intel/scrapers/tests/test_apify_client.py` | NEW — contract tests |
| `services/competitor_intel/scrapers/tests/test_apify_mapper.py` | NEW — mapping tests |
| `services/competitor_intel/scrapers/fixtures/apify_search_songmont.json` | NEW — recorded fixture |
| `services/competitor_intel/scrapers/fixtures/apify_profile_songmont.json` | NEW — recorded fixture |
| `services/competitor_intel/scrape_runner.py` | MODIFY — feature flag branch around xhs scrape |
| `services/competitor_intel/scraping_rules.yml` | MODIFY — add `apify:` section with actor IDs + budgets |
| `.env.example` | MODIFY — document USE_APIFY, APIFY_API_TOKEN, XHS_SESSION_COOKIE |
| `backend/migrations/012_apify_run_log.sql` | NEW — cost tracking table |
| `docs/SCRAPING-STRATEGY.md` | MODIFY — mark A1 done, A2 in progress in the corrections section |

Estimated lines: ~600 new, ~30 modified. Reviewable in one sitting.

---

## Open questions for Will at A2 start

1. **`xhs_scraper.py` left in tree or removed?** Recommend left for A2 (rollback safety), removed after the parallel-run window passes with clean Apify output. CLAUDE.md says don't create dead code; deferred cleanup acknowledged in commit log.
2. **Cost log retention.** Forever, or 90-day rolling? Recommend 90-day rolling — aggregated weekly stats stay forever.
3. **First brand to migrate.** Songmont (the canonical demo workspace) — lowest risk, most observable.

---

## Definition of done for A2

- [ ] `pytest services/competitor_intel/scrapers/tests/` passes
- [ ] `USE_APIFY=true python -m services.competitor_intel.scrape_runner --platform xhs --brand Songmont` produces a row in `scraped_brand_profiles` identical in shape to the Playwright path's output (manual SQL comparison)
- [ ] `apify_run_log` table populated with cost estimates
- [ ] PR description shows side-by-side score comparison (Playwright vs Apify) for at least one brand
- [ ] Joanna reviews + approves (CODEOWNERS auto-routes since `services/competitor_intel/` is hers)

After A2 merges, optional A6 (3-day parallel run) before cron cutover.
