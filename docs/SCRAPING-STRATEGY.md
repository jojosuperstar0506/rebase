# Rebase Scraping Strategy

> **Source:** Authored by Joanna, 2026-05-22 (`Rebase-Scraping-Strategy (2).docx`)  
> **Status:** Active — this is the strategy we are executing  
> **Tracks:** [issue #62](https://github.com/jojosuperstar0506/rebase/issues/62), [PR #81](https://github.com/jojosuperstar0506/rebase/pull/81)  
> **Companion:** `docs/SCRAPING-A2-APIFY-CLIENT-DESIGN.md` (apify_client.py spec)

---

For: William (CI pipeline integration) | Date: May 2026 | Status: Ready to execute


## 1. Current State & Problem

Our XHS scraper (services/competitor_intel/scrapers/xhs_scraper.py) is a 750+ line Playwright-based scraper with sophisticated anti-detection (jittered delays, auth-wall detection, account scoring). However, Joanna’s personal XHS account was blocked on 2026-04-22 due to anti-bot detection. A scraping_rules.yml was created post-incident with conservative rate limits, but the fundamental problem remains: XHS aggressively detects automated browsing patterns regardless of speed.


### Why XHS scraping is structurally hard

Browser fingerprinting — XHS checks canvas, WebGL, fonts, screen resolution, timezone. Playwright has detectable signatures even with stealth plugins.

Behavioral analysis — Navigation patterns, mouse movements, scroll velocity, time-on-page. A scraper doing 20 brand searches/day looks nothing like a real user.

Cookie/session intelligence — One account doing systematic searches is suspicious. Real users browse casually.

IP reputation — Even residential IPs get flagged if behavior is bot-like.

Account value asymmetry — A personal account with real history is expensive to lose. Using it for scraping is high-risk.


## 2. Recommended Strategy: Three-Layer Stack

Instead of building and maintaining custom scrapers for every platform, we use a layered approach: third-party scraping services for social/e-commerce data, analytics subscriptions for seller intelligence, and self-managed scraping only for our own authenticated backends.


### Layer 1: Apify (social + e-commerce public data) — ~$50-80/month

Apify is a cloud scraping platform with pre-built actors (scrapers) that handle proxy rotation, browser fingerprinting, and anti-bot bypass. We call their API, get structured data back. They maintain the scrapers when platforms change detection.


#### Platform coverage on Apify

| Platform | Available? | Cost | Notes |
| --- | --- | --- | --- |
| XHS (xiaohongshu) | Yes | $4.99/1K results | 6 modes: search, profiles, notes, comments, user posts, video. Best actor: huggable_quote/xiaohongshu-all-in-one-scraper |
| Douyin (TikTok CN) | Yes | $20/mo + usage | Search, profiles, comments, video download. Multiple actors available. Some don't need login. |
| Taobao / Tmall | Yes | Pay per result | Product search, prices, shop data. No login needed for public product pages. Actor: pizani/taobao-product-scraper |
| JD.com | Yes | Pay per result | Product data. Easier to scrape than Taobao. |
| 1688 (wholesale) | Yes | Pay per result | Product + supplier data. Good for supply chain intel. |
| Pinduoduo | Limited | N/A | Very aggressive anti-bot. Most vendors struggle. Avoid for now. |

Cookie requirement: XHS actors require session cookies. Use a dedicated BURNER account (never personal accounts). If it gets blocked, create a new one. The account is disposable; the data pipeline is not.


### Layer 2: Analytics subscriptions (seller intelligence) — ~¥500-2000/month

For data that scraping can’t reliably get: Douyin livestream analytics, GMV estimates, ad spend intelligence, cross-platform trends. These companies have official or semi-official data partnerships with the platforms.

chanmama.com — Douyin analytics (livestream, ad creative, GMV estimates). Has its own API.

feigua.cn — XHS + Douyin analytics. Brand tracking, content performance, KOL matching.

xinhong.com — XHS-specific analytics. Note performance, trending content, brand mentions.


### Layer 3: Self-managed scraping (authenticated backends only)

Only scrape platforms where we have our own seller login and are accessing our own business data. The risk profile is completely different from scraping someone else’s public data.

shengyicanmou (SYCM) — Keep existing sycm_scraper.py. It’s our own seller backend. Use conservative rate limits from scraping_rules.yml.

Doudian (Douyin seller backend) — Same approach if we get Douyin seller access.

No third-party vendor covers SYCM or Doudian — they’re behind authenticated seller logins. Self-scraping is the only option.


## 3. Critical Gap: What No Vendor Covers

| Platform | Coverage | Workaround |
| --- | --- | --- |
| SYCM (shengyicanmou) | None — no vendor | Self-scrape with our own seller session (existing code). Or use Alibaba Open Platform API if authorized as ISV. |
| Doudian seller backend | None — no vendor | Self-scrape or apply for Douyin Open Platform ISV access. |
| Chanmama / Feigua | None — no vendor | Subscribe directly. They have their own APIs. |
| Pinduoduo | Very limited | Most aggressive anti-bot in China. Avoid scraping. Use their Duoduojinbao affiliate API if applicable. |


## 4. What to Deprecate in Our Codebase

Once Apify is integrated, these custom scrapers should be deprecated (kept for reference but no longer called in production):

services/competitor_intel/scrapers/xhs_scraper.py — Replace with Apify XHS actor

services/competitor_intel/scrapers/douyin_scraper.py — Replace with Apify Douyin actor

tools/scrape-agent/scrapers/xhs.py — Replace with Apify

services/competitor_intel/setup_profiles.py — No longer needed (Apify handles sessions)

services/competitor_intel/push_cookies.py — Only needed for SYCM self-scraping now

Keep: sycm_scraper.py, scraping_rules.yml, scraping_config.py (for SYCM self-scraping).


## 5. Integration Tasks for William


### TASK-A1: Apify Account + XHS Burner Account Setup (30 min)

Create Apify account at apify.com. Start with Starter plan ($29/month).

Get API token from Apify Console > Settings > Integrations.

Create a new XHS burner account (fresh phone number, no personal data). Do NOT use Joanna’s account.

Log into XHS in a browser, export session cookies using EditThisCookie or Cookie-Editor extension.

Store the Apify API token as APIFY_API_TOKEN in our .env / secrets config.

Store the XHS cookies securely (they expire — will need periodic refresh).

Test the XHS actor manually in Apify Console: run huggable_quote/xiaohongshu-all-in-one-scraper with mode=search, keyword=“Songmont”, and the session cookie. Verify results come back.


### TASK-A2: Apify Client Module (1-2 hours)

Create services/competitor_intel/scrapers/apify_client.py — a Python wrapper around the Apify API that replaces our custom XHS and Douyin scrapers.

Install: pip install apify-client

Create ApifyScraperClient class with methods: scrape_xhs_brand(brand_name), scrape_xhs_notes(user_id), scrape_douyin_brand(brand_name), scrape_taobao_products(keyword)

Each method calls the appropriate Apify actor, waits for results, and returns structured data.

Map Apify response fields to our existing XhsBrandData schema (shared/schemas/).

Handle errors: actor timeout, empty results, cookie expiration (detect login-wall errors and alert).

Add cookie refresh detection: if results contain login-wall markers, log warning and skip (don’t crash pipeline).

Config: read APIFY_API_TOKEN and XHS_SESSION_COOKIE from environment variables.


### TASK-A3: Wire into Scoring Pipeline (1 hour)

Replace the custom scraper calls in the scoring pipeline with the new Apify client.

In scoring_pipeline.py, replace imports of xhs_scraper with apify_client.

Update the data collection step: call apify_client.scrape_xhs_brand() instead of the Playwright-based scraper.

Verify the scoring pipeline still produces valid momentum/threat/WTP scores with Apify-sourced data.

Run against the existing 3 seed brands (Songmont, CASSILE, etc.) and compare scores to previous runs.

Update run_daily_pipeline.sh to pass APIFY_API_TOKEN from environment.

Do NOT modify scoring.py or the scoring logic — only the data collection layer.


### TASK-A4: Add Douyin + Taobao/Tmall Scraping (1-2 hours)

Extend apify_client.py to call Douyin actor (natanielsantos/douyin-scraper) for brand content analysis.

Extend to call Taobao/Tmall actor (pizani/taobao-product-scraper) for competitor product pricing.

Map both to appropriate schemas.

Add to the daily pipeline as additional data sources for the scoring engine.


### TASK-A5: Cookie Refresh Automation (1 hour)

XHS session cookies expire periodically (typically 7-30 days).

Create a simple monitoring script that tests the cookie daily: call the Apify actor with a known search query, check if results come back or if login wall is detected.

On failure: send alert (Slack webhook, email, or console log) prompting manual cookie refresh.

Document the cookie refresh process: log into XHS on browser > export cookies > update .env.

Future enhancement: automate QR-code login via Playwright (low priority — manual refresh is fine for 20 brands).


## 6. Monthly Cost Estimate

| Item | Cost | Covers |
| --- | --- | --- |
| Apify Starter plan | $29/month | Platform credits for compute |
| XHS actor usage (20 brands x weekly) | ~$20-40/month | $4.99/1K results |
| Douyin actor usage | ~$20/month | $20/mo base + usage |
| Taobao/Tmall actor usage | ~$10-20/month | Pay per result |
| Total Layer 1 (Apify) | ~$80-110/month | XHS + Douyin + Taobao/Tmall |
| Layer 2: Chanmama/Feigua (optional) | ¥500-2000/month | Douyin livestream, GMV, ad analytics |
| Layer 3: Self-scraping (SYCM) | $0 (existing infra) | Our own seller data |


## 7. Execution Sequence

Run tasks sequentially. Each builds on the previous. Total estimated: 4-6 hours of Claude Code execution.

| Task | Description | Est. Time | Depends On |
| --- | --- | --- | --- |
| A1 | Apify account + XHS burner + manual test | 30 min | None |
| A2 | Apify client module (apify_client.py) | 1-2 hours | A1 |
| A3 | Wire into scoring pipeline | 1 hour | A2 |
| A4 | Add Douyin + Taobao/Tmall scraping | 1-2 hours | A2 |
| A5 | Cookie refresh monitoring | 1 hour | A2 |

Key principle: Never use personal accounts for scraping. Accounts are disposable; pipelines are not. Outsource the anti-bot arms race to vendors who specialize in it. Spend our engineering time on scoring, narrative generation, and dashboards — not fighting XHS detection.


---

## Corrections applied — William, 2026-05-22

Two tactical corrections after web-research validation of the actor marketplace and re-reading our existing code:

**1. XHS actor: use `zhorex/rednote-xiaohongshu-scraper`, not `huggable_quote/xiaohongshu-all-in-one-scraper`.**

The `huggable_quote` actor is marked **DEPRECATED** on Apify's marketplace (rating 0.0, 0 reviews, "See alternatives" banner displayed by Apify itself). The active replacement `zhorex/rednote-xiaohongshu-scraper` has 144 MAU, daily updates, and its author wrote the canonical 2026 XHS request-signing writeup. Verified input schema: `searchQuery` / `maxResults` / `cookieString` (not the generic `keyword` / `maxItems` / `cookies` parameters one might assume).

**2. Add Douyin actor fallback path.**

`natanielsantos/douyin-scraper` (Joanna's pick) has open reliability issues on its Apify page — community reports of "all requests failing" and yields dropping from 500 to 7 items per call. We still adopt it as primary, but `apify_client.py` adds a fallback actor (TBD at A4 time — `kuaima/douyin-search` is a candidate) that the wrapper tries on primary failure. Adds ~30 lines to the wrapper, removes a single-vendor risk.

**Everything else in this strategy is adopted as-is.**
