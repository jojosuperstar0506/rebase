#!/bin/bash
# Daily CI pipeline: scrape -> score -> (future: narratives)
# Run at 2am HK time via cron

set -e
cd "$(dirname "$0")/../.."

# Load env vars if .env exists
if [ -f backend/.env ]; then
    export $(grep -v '^#' backend/.env | xargs)
fi

PYTHON=${PYTHON_BIN:-python3.11}

echo "[$(date)] Starting daily CI pipeline"

# Step 1: Scrape watchlist brands
echo "[$(date)] Step 1: Scraping XHS watchlist..."
$PYTHON -m services.competitor_intel.scrape_runner --platform xhs --tier watchlist || true

echo "[$(date)] Step 1b: Scraping Douyin watchlist..."
$PYTHON -m services.competitor_intel.scrape_runner --platform douyin --tier watchlist || true

# Step 2: Compute scores for all workspaces
echo "[$(date)] Step 2: Computing scores..."
$PYTHON -m services.competitor_intel.scoring_pipeline --all || true

# Step 3: Generate AI narratives
echo "[$(date)] Step 3: Generating narratives..."
$PYTHON -m services.competitor_intel.narrative_pipeline --all || true

echo "[$(date)] Daily CI pipeline complete"
