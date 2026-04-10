# Rebase Local Scraping Agent

Scrapes Chinese ecommerce platforms from your laptop using a real browser
with real login sessions. Pushes results to the Rebase ECS backend automatically.

## Quick Start

```bash
bash install.sh
export REBASE_API_SECRET=your_secret
python3 agent.py --login        # Log into platforms (first time only)
python3 agent.py --dry-run      # Test scraping without pushing
python3 agent.py                # Scrape and push to backend
```

## Commands

| Command | What it does |
|---------|-------------|
| `python3 agent.py --login` | Opens browser — log into 小红书, 淘宝, etc. |
| `python3 agent.py` | Scrapes all targets from ECS and pushes results |
| `python3 agent.py --dry-run` | Scrapes but doesn't push (safe for testing) |
| `python3 agent.py --brand Songmont` | Scrapes one specific brand |
| `python3 agent.py --dry-run --brand Songmont` | Test one brand without pushing |

## Running on Another Laptop

1. Copy this entire `scrape-agent/` folder to the other machine
2. Run `bash install.sh`
3. Set `export REBASE_API_SECRET=your_secret`
4. Run `python3 agent.py --login` (log into platforms on that machine)
5. Run `python3 agent.py`

Each machine can handle different platforms:
```bash
# Laptop A — handles XHS
REBASE_PLATFORMS=xhs python3 agent.py

# Laptop B — handles Douyin (once implemented)
REBASE_PLATFORMS=douyin python3 agent.py
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REBASE_API_SECRET` | *(required)* | API auth secret (get from team) |
| `REBASE_ECS_URL` | `http://8.217.242.191:3000` | Backend URL |
| `REBASE_AGENT_ID` | auto-generated | This machine's identifier |
| `REBASE_PLATFORMS` | `xhs` | Platforms to scrape (comma-separated) |
| `REBASE_PROFILE_DIR` | `~/.rebase-scraper` | Browser session storage |
| `REBASE_DRY_RUN` | `false` | Set to `true` to test without pushing |
| `REBASE_MIN_DELAY` | `3` | Minimum seconds between brands |
| `REBASE_MAX_DELAY` | `8` | Maximum seconds between brands |
| `REBASE_SKIP_HOURS` | `20` | Skip brands scraped within this many hours |

## How It Works

1. **Fetches targets** from ECS (`/api/ci/scrape-targets`) — the brands your workspace is tracking
2. **Opens a real Chrome browser** (visible, not headless) using saved login sessions
3. **Scrapes via the accessibility tree** — reads structured data from the page DOM, not raw HTML parsing
4. **Pushes results to ECS** (`/api/ci/ingest`) with your API secret for auth

The browser runs **visible** (not headless) to reduce bot detection. Login sessions are saved to `~/.rebase-scraper/` and persist between runs — you only need to log in once per machine.

## Platform Status

| Platform | Status |
|----------|--------|
| 小红书 (XHS) | ✅ Implemented |
| 抖音 (Douyin) | 🔲 Placeholder — coming soon |
| 淘宝/天猫 | 🔲 Planned |

## Scheduling (Optional)

Run automatically every night at 2am:

```bash
# macOS — crontab
crontab -e
# Add this line:
0 2 * * * cd /path/to/scrape-agent && REBASE_API_SECRET=xxx python3 agent.py >> ~/rebase-agent.log 2>&1
```

## Troubleshooting

**"No targets from ECS"** — Either the API secret is wrong, or no brands are in your workspace yet. Use `--brand BrandName` to test.

**"Cannot reach ECS"** — Check that `REBASE_ECS_URL` is correct and the backend is running.

**XHS scraper extracts nothing** — You may need to log in again: `python3 agent.py --login`. XHS sessions expire periodically.

**Browser opens but looks wrong** — Make sure you're in the `scrape-agent/` directory when running.
