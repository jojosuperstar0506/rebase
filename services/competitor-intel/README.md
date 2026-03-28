# OMI Competitive Intelligence Service

7-Dimension Brand Equity Framework scraping & analysis pipeline for OMI Bags (欧米箱包).

## Architecture

```
services/competitor-intel/
├── config.py                    # Brand registry, URLs, env config
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
