#!/bin/bash
# Rebase CI Daily Pipeline
# Runs: scrape (watchlist) → score → narrate
# Schedule: 2am HK time daily (18:00 UTC previous day)

set -o pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_FILE="/var/log/rebase/ci-pipeline.log"
STATUS_FILE="/tmp/rebase-pipeline-status.json"

# Load environment (handles special characters in values)
if [ -f "$REPO_DIR/backend/.env" ]; then
  while IFS= read -r line; do
    # Skip comments and empty lines
    [[ -z "$line" || "$line" =~ ^# ]] && continue
    export "$line"
  done < "$REPO_DIR/backend/.env"
fi

PYTHON=${PYTHON_BIN:-python3.11}

cd "$REPO_DIR"

# Write status: running
echo '{"status":"running","started_at":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > "$STATUS_FILE"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

report_failure() {
  local step="$1"
  local error="$2"
  echo '{"status":"failed","step":"'"$step"'","error":"'"$error"'","finished_at":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > "$STATUS_FILE"

  # Alert via WeChat webhook if configured
  if [ -n "$WECHAT_WORK_WEBHOOK" ]; then
    curl -s -X POST "$WECHAT_WORK_WEBHOOK" \
      -H 'Content-Type: application/json' \
      -d '{
        "msgtype": "text",
        "text": {
          "content": "⚠️ Rebase CI Pipeline Failed\nStep: '"$step"'\nError: '"$error"'\nTime: '"$(date '+%Y-%m-%d %H:%M')"'"
        }
      }' > /dev/null 2>&1
  fi
}

log "========== Daily CI Pipeline Starting =========="

# Step 1a: Scrape watchlist (XHS)
log "Step 1a: Scraping XHS watchlist..."
if $PYTHON -m services.competitor_intel.scrape_runner --platform xhs --tier watchlist >> "$LOG_FILE" 2>&1; then
  log "Step 1a: XHS watchlist scrape complete"
else
  log "Step 1a: XHS watchlist scrape failed (continuing)"
  report_failure "xhs_scrape" "XHS watchlist scrape returned non-zero"
fi

# Step 1b: Scrape watchlist (Douyin)
log "Step 1b: Scraping Douyin watchlist..."
if $PYTHON -m services.competitor_intel.scrape_runner --platform douyin --tier watchlist >> "$LOG_FILE" 2>&1; then
  log "Step 1b: Douyin watchlist scrape complete"
else
  log "Step 1b: Douyin watchlist scrape failed (continuing)"
fi

# Step 2: Compute scores
log "Step 2: Computing scores..."
if $PYTHON -m services.competitor_intel.scoring_pipeline --all >> "$LOG_FILE" 2>&1; then
  log "Step 2: Scoring complete"
else
  log "Step 2: Scoring failed"
  report_failure "scoring" "Scoring pipeline returned non-zero"
fi

# Step 2b: Run extended scoring pipelines (all 9 additional scorers)
log "Step 2b: Running extended scoring pipelines..."
for pipeline in keyword_pipeline voice_volume_pipeline product_ranking_pipeline \
                price_analysis_pipeline launch_tracker_pipeline mindshare_pipeline \
                content_strategy_pipeline kol_tracker_pipeline design_vision_pipeline; do
  if $PYTHON -m "services.competitor_intel.pipelines.$pipeline" --all >> "$LOG_FILE" 2>&1; then
    log "  $pipeline: complete"
  else
    log "  $pipeline: failed (continuing)"
  fi
done

# Step 2c: Roll up the 9 metric scores into 3 domain scores
# (consumer_domain / product_domain / marketing_domain).
# Must run AFTER step 2b — reads the rows those pipelines just wrote.
log "Step 2c: Rolling up domain scores..."
if $PYTHON -m services.competitor_intel.pipelines.domain_aggregation_pipeline --all >> "$LOG_FILE" 2>&1; then
  log "Step 2c: Domain aggregation complete"
else
  log "Step 2c: Domain aggregation failed"
  report_failure "domain_aggregation" "Domain rollup pipeline returned non-zero"
fi

# Step 2d: Generate this week's Brief (verdict + moves)
# Reads the domain rollups Step 2c just wrote; writes weekly_briefs.
# Idempotent — UPSERTs on (workspace_id, week_of), so daily reruns just
# refresh the JSONB with the latest LLM synthesis.
log "Step 2d: Generating weekly brief (positioning)..."
if $PYTHON -m services.competitor_intel.brand_positioning_pipeline --all >> "$LOG_FILE" 2>&1; then
  log "Step 2d: Brief generation complete"
else
  log "Step 2d: Brief generation failed (continuing)"
  report_failure "brand_positioning" "brand_positioning_pipeline returned non-zero"
fi

# Step 2e: Generate Douyin content drafts grounded in this week's moves.
# Reads weekly_briefs (written by 2d); writes content_recommendations.
# Idempotent BUT skip-if-exists rather than UPSERT — preserves the user's
# mark_posted / dismiss decisions. The first run of the ISO-week creates
# drafts; subsequent runs that day no-op. --force is intentionally NOT
# used here; the cron should never silently destroy user state.
log "Step 2e: Generating Douyin content drafts..."
if $PYTHON -m services.competitor_intel.gtm_content_pipeline --all >> "$LOG_FILE" 2>&1; then
  log "Step 2e: Content drafts complete"
else
  log "Step 2e: Content draft generation failed (continuing)"
  report_failure "gtm_content" "gtm_content_pipeline returned non-zero"
fi

# Step 3: Generate narratives
log "Step 3: Generating AI narratives..."
if $PYTHON -m services.competitor_intel.narrative_pipeline --all >> "$LOG_FILE" 2>&1; then
  log "Step 3: Narratives complete"
else
  log "Step 3: Narrative generation failed"
  report_failure "narrative" "Narrative pipeline returned non-zero"
fi

# Step 4: Detect alerts
log "Step 4: Detecting alerts..."
if $PYTHON -m services.competitor_intel.alert_detector --all >> "$LOG_FILE" 2>&1; then
  log "Step 4: Alert detection complete"
else
  log "Step 4: Alert detection failed"
fi

# Step 5: Data retention cleanup (keeps DB lean)
log "Step 5: Running data retention cleanup..."
if psql "$DATABASE_URL" -f "$REPO_DIR/backend/migrations/005_data_retention.sql" >> "$LOG_FILE" 2>&1; then
  log "Step 5: Data cleanup complete"
else
  log "Step 5: Data cleanup failed (non-critical)"
fi

# Write status: complete
WORKSPACE_COUNT=$($PYTHON -c "
from services.competitor_intel.db_bridge import get_conn
conn = get_conn()
cur = conn.cursor()
cur.execute('SELECT count(*) as cnt FROM workspaces')
print(cur.fetchone()['cnt'])
conn.close()
" 2>/dev/null || echo "0")

echo '{"status":"complete","finished_at":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","workspaces_processed":'"$WORKSPACE_COUNT"'}' > "$STATUS_FILE"

log "========== Daily CI Pipeline Complete ($WORKSPACE_COUNT workspaces) =========="
