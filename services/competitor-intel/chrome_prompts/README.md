# Chrome-Based Data Extraction — User Guide

## Overview

Instead of automated scrapers that fight anti-bot systems, we use **Claude for Chrome** (Anthropic's browsing agent) to extract competitor data while you're logged into XHS and Douyin in your real browser. This gives us accurate, authenticated data without getting blocked.

## Workflow

### 1. Prepare
- Open Chrome and make sure you're logged into **小红书** (xiaohongshu.com) and **抖音** (douyin.com)
- Activate Claude for Chrome (the Anthropic browser extension)

### 2. Extract XHS Data
- Open `brand_list_priority5.md` (for weekly quick runs) or `brand_list_all.md` (for full monthly runs)
- Copy the brand list section
- Open `xhs_extract.md` and copy the full prompt
- Paste the brand list into the `{BRAND_LIST}` placeholder
- Paste the complete prompt into Claude for Chrome's chat
- Wait for extraction (usually 10-15 minutes for 5 brands)
- Copy the JSON output and save as `xhs_YYYY-MM-DD.json` in a convenient location

### 3. Extract Douyin Data (separate session)
- Same process with `douyin_extract.md`
- Save as `douyin_YYYY-MM-DD.json`

> **Tip:** Do XHS and Douyin in separate Chrome sessions. Each platform takes 10-15 min for 5 brands.

### 4. Import into Database
```bash
# Import both files at once:
cd /path/to/rebase
python3.12 -m services.competitor-intel.import_chrome_extract \
  xhs_2026-03-28.json douyin_2026-03-28.json

# Or import one at a time:
python3.12 -m services.competitor-intel.import_chrome_extract xhs_2026-03-28.json

# Or paste directly from clipboard (macOS):
pbpaste | python3.12 -m services.competitor-intel.import_chrome_extract --stdin --platform xhs
```

The import script will:
- Validate the JSON structure
- Convert Chinese numbers (e.g., "15.2万" → 152000)
- Merge XHS + Douyin data for the same brand
- Save snapshots to the SQLite database
- Extract metrics for trending

### 5. Update Static Dashboard
After importing, regenerate the static JSON for Vercel:
```bash
python3.12 -c "
from services.competitor_intel.storage import init_db, export_latest_json
conn = init_db()
export_latest_json(conn, 'frontend/public/data/competitors/competitors_latest.json')
print('Done — commit and push to update Vercel.')
"
```

## Recommended Schedule

| Frequency | What | Brands | Time |
|-----------|------|--------|------|
| **Weekly** (Monday AM) | XHS + Douyin | Priority 5 | ~30 min |
| **Monthly** (1st Monday) | XHS + Douyin | All 20 | ~2 hours |

## Tips

- **Spot-check numbers**: After extraction, compare 2-3 follower counts against what you see on screen. Claude for Chrome is accurate but occasionally rounds differently.
- **Start small**: First time, do just 1-2 brands to verify the output format is correct.
- **JSON issues?** The import script handles common problems (code fences, Chinese numbers, trailing commas). If it still fails, check the error message — it's specific about what's wrong.
- **Partial data is OK**: If a brand doesn't have a Douyin shop, the import script fills those fields with defaults.
