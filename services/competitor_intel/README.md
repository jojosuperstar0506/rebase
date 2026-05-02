# OMI Competitive Intelligence Service

7-Dimension Brand Equity Framework scraping & analysis pipeline for OMI Bags (欧米箱包).

## Architecture

```
services/competitor-intel/
├── config.py                    # Brand registry, URLs, env config
├── scraping_rules.yml           # ⭐ Central: selectors, URLs, rate limits (EDIT THIS)
├── scraping_config.py           # Loader for scraping_rules.yml
├── orchestrator.py              # Main pipeline coordinator
├── html_generator.py            # Dashboard HTML generator
├── requirements.txt             # Python dependencies
├── scrapers/
│   ├── xhs_scraper.py          # 小红书 scraper (D1,D2,D3,D4,D6)
│   ├── douyin_scraper.py       # 抖音 scraper (D1,D2,D4,D5)
│   └── sycm_scraper.py         # 生意参谋 scraper (D7)
└── analysis/
    └── anthropic_analyzer.py   # Claude API analysis engine
```

## Editing scraping behavior — use `scraping_rules.yml`, not scraper code

**Rule:** selectors, URLs, delays, rate limits, and auth-wall markers live in
`services/competitor_intel/scraping_rules.yml`. Both William and Joanna edit
this file. The scraper `.py` files read from it at startup.

Common edits:

| Scenario | What to change |
|---|---|
| XHS changes a CSS class → follower count broken | `xhs.selectors.follower_count` in YAML |
| Getting rate-limited → need slower scrapes | `xhs.rate_limit.between_brands_seconds` (widen the range) |
| New XHS login-wall phrase appears in `.debug/` dumps | Append to `xhs.auth_wall_markers` |
| XHS changes a URL pattern | `xhs.urls.*` |

**Do NOT** add hardcoded selectors / URLs / delays back into `xhs_scraper.py` or
`douyin_scraper.py`. If you need something the YAML doesn't expose, add it to
the YAML + the `scraping_config.py` loader, then read it from the scraper.

Quick check that your YAML edit is valid:
```bash
python -m services.competitor_intel.scraping_config  # prints rate-limit summary
```

### ⚠️ Rate limits — do not loosen without sign-off

The `rate_limit` section in `scraping_rules.yml` was tuned after Joanna's
personal XHS account (7K+ followers) got banned on 2026-04-22 for automation
patterns. Key protections:

- `between_brands_seconds: [300, 900]` — 5–15 min jittered gap between brands
- `max_scrapes_per_account_per_day: 10`
- `active_hours_local: [9, 23]` — no 2-7 AM scraping
- `forbidden_ip_hostname_substrings: [aliyun, ...]` — blocks datacenter IPs

Loosening these requires a written reason in the YAML comment block + both
engineers' sign-off. See `.claude/plans/hazy-mapping-blossom.md` Phase C.


## 7 Dimensions

| Dim | Name | Primary Source |
|-----|------|---------------|
| D1 | Brand Search Index 搜索联想词 | XHS + Douyin search |
| D2 | Brand Voice Volume 声量指数 | XHS + Douyin profiles |
| D3 | Content Strategy DNA 内容策略 | XHS notes |
| D4 | Celebrity/KOL Ecosystem 达人生态 | XHS + Douyin |
| D5 | Social Commerce Engine 社交电商 | Douyin live |
| D6 | Consumer Mindshare 消费者心智 | XHS UGC |
| D7 | Channel Authority 渠道权威度 | 生意参谋 / Tmall |

## Usage

### Full scrape (all 20 brands)
```bash
python -m services.competitor-intel.orchestrator --full --mode api \
  --xhs-cookies "YOUR_XHS_COOKIES" \
  --douyin-cookies "YOUR_DOUYIN_COOKIES"
```

### Single brand
```bash
python -m services.competitor-intel.orchestrator --brand "CASSILE" --platform xhs,douyin
```

### With Anthropic analysis
```bash
export ANTHROPIC_API_KEY=sk-ant-...
python -m services.competitor-intel.orchestrator --full --push
```

### Dry run
```bash
python -m services.competitor-intel.orchestrator --brand "Songmont" --dry-run
```

## Deployment

### Cowork (current)
- Scheduled task runs every 3 days
- Scrapes via browser automation (MCP tools)
- Saves JSON + pushes to GitHub → Vercel auto-deploy

### Aliyun Cloud (future)
- Cron job on ECS instance
- API mode with cookie rotation + proxy
- Anthropic API for analysis
- Push to GitHub or direct to Aliyun OSS/database

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...        # For AI analysis
ANTHROPIC_MODEL=claude-sonnet-4-20250514  # Model to use
COMPETITOR_DATA_DIR=frontend/src/data/competitors
COMPETITOR_HTML_DIR=frontend/public
GITHUB_REPO=jojosuperstar0506/rebase
GITHUB_TOKEN=ghp_...                # For git push
GIT_BRANCH=main
XHS_COOKIES=...                     # XHS session cookies
DOUYIN_COOKIES=...                  # Douyin session cookies
SYCM_COOKIES=...                   # 生意参谋 session cookies
SCRAPER_PROXY=http://...           # Proxy for API mode
```

## 20 Competitor Brands

**Group D (快时尚/International):** 小CK, COACH, MK, Kipling
**Group C (价值挑战者):** La Festin, Cnolés蔻一, ECODAY, VINEY, FOXER, NUCELLE, OMTO, muva
**Group B (新兴国货):** Songmont, 古良吉吉, 裘真, DISSONA, Amazing Song, CASSILE, 西木汀, 红谷
