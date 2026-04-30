#!/bin/bash
# Run the full post-scrape analysis chain for a SINGLE workspace.
#
# Used by POST /api/ci/run-analysis when a user clicks "Run Today's Analysis."
# Mirrors the cron's order (run_daily_pipeline.sh Steps 2 → 2g) but operates
# on ONE workspace and skips the scrape step — scrape data must already exist.
#
# Why this exists:
#   The previous run-analysis endpoint spawned scoring + 9 metric pipelines
#   in parallel (detached). It did NOT spawn domain_aggregation, brand_
#   positioning, gtm_content, product_opportunity, or white_space — so the
#   user's Brief never refreshed when they clicked the button. From the
#   user's seat the button looked broken: spinner ends, page looks identical
#   until the next 2am cron. This script closes that gap by running every
#   downstream stage in proper dependency order.
#
# Stage order (matches the cron):
#   1. scoring_pipeline                        (uses --job-id for per-brand UI progress)
#   2. 9 metric pipelines                      (sequential, each is fast)
#   3. domain_aggregation_pipeline             (depends on #1 + #2)
#   4. brand_positioning_pipeline              (depends on #3 — writes weekly_briefs)
#   5. gtm_content_pipeline                    (depends on #4 — reads brief moves)
#   6. product_opportunity_pipeline            (depends on #4)
#   7. white_space_pipeline                    (depends on #3 + #4)
#
# Job tracking:
#   scoring_pipeline updates ci_analysis_jobs as it goes and marks
#   status='complete' at the end. We immediately override that to
#   'narrating' so the frontend keeps polling while the post-scoring
#   stages run. Final UPDATE → status='complete' when all stages succeed.
#   Brief race-window is ~100ms — acceptable; refactor scoring_pipeline
#   to accept --no-mark-complete if it becomes a real UX issue.
#
# Usage:
#   bash run_analysis_for_workspace.sh <workspace_id> [job_id]

set -uo pipefail

WORKSPACE_ID="${1:-}"
JOB_ID="${2:-}"
if [ -z "$WORKSPACE_ID" ]; then
  echo "Usage: $0 <workspace_id> [job_id]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PYTHON="${PYTHON_BIN:-python3.11}"

LOG_DIR="/var/log/rebase"
mkdir -p "$LOG_DIR" 2>/dev/null || true
# Fall back to /tmp if /var/log/rebase isn't writable (e.g., dev/test runs).
[ -w "$LOG_DIR" ] || LOG_DIR="/tmp"
LOG_FILE="$LOG_DIR/analysis-$(date +%Y%m%d-%H%M%S)-${WORKSPACE_ID:0:8}.log"

# Load .env so DATABASE_URL + LLM keys are available.
if [ -f "$REPO_DIR/backend/.env" ]; then
  set -a && source "$REPO_DIR/backend/.env" && set +a
fi

cd "$REPO_DIR"

log() { echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG_FILE"; }

set_job_status() {
  local new_status="$1"
  local extra_sql="${2:-}"
  if [ -n "$JOB_ID" ] && [ -n "${DATABASE_URL:-}" ]; then
    psql "$DATABASE_URL" -c "UPDATE ci_analysis_jobs SET status='$new_status'$extra_sql WHERE id='$JOB_ID';" \
      >> "$LOG_FILE" 2>&1 || true
  fi
}

fail() {
  local stage="$1"
  log "FAILED at stage: $stage (see $LOG_FILE)"
  # Escape single quotes in the stage name to keep the SQL safe.
  local safe_stage="${stage//\'/\'\'}"
  set_job_status "failed" ", error_message='$safe_stage', completed_at=NOW()"
  exit 1
}

run_step() {
  local label="$1"
  shift
  log "▶ $label"
  if ! "$@" >> "$LOG_FILE" 2>&1; then
    fail "$label"
  fi
}

log "═══ Analysis chain for workspace $WORKSPACE_ID (job=${JOB_ID:-none}) ═══"

# ─── Stage 1: scoring (momentum / threat / wtp) ──────────────────────────────
# Passes --job-id so the existing UI progress bar shows per-brand status.
# This pipeline marks ci_analysis_jobs.status='complete' at its end; the
# orchestrator overrides immediately below.
SCORING_ARGS=(-m services.competitor_intel.scoring_pipeline --workspace-id "$WORKSPACE_ID")
[ -n "$JOB_ID" ] && SCORING_ARGS+=(--job-id "$JOB_ID")
run_step "1/7 scoring" "$PYTHON" "${SCORING_ARGS[@]}"

# Reset to 'narrating' so the frontend keeps polling while we run the
# post-scoring stages. Schema check_constraint allows 'narrating'.
set_job_status "narrating"

# ─── Stage 2: 9 individual metric pipelines ──────────────────────────────────
# Each writes its own metric_type rows into analysis_results. Sequential
# rather than parallel to keep error handling simple — total wall time is
# ~1-3 minutes for 3-5 competitors, dominated by LLM-using pipelines below.
for p in keyword voice_volume product_ranking price_analysis launch_tracker \
         mindshare content_strategy kol_tracker design_vision; do
  run_step "2/7 metric:$p" "$PYTHON" -m "services.competitor_intel.pipelines.${p}_pipeline" \
    --workspace-id "$WORKSPACE_ID"
done

# ─── Stage 3: domain aggregation ─────────────────────────────────────────────
# Rolls the 9 metrics + 3 scoring composites into 3 domain scores
# (consumer_domain / product_domain / marketing_domain).
run_step "3/7 domain_aggregation" "$PYTHON" \
  -m services.competitor_intel.pipelines.domain_aggregation_pipeline \
  --workspace-id "$WORKSPACE_ID"

# ─── Stage 4: brief (verdict + moves) ────────────────────────────────────────
# Reads domain rollups, writes weekly_briefs. UPSERT — daily reruns refresh
# the verdict, never duplicate.
run_step "4/7 brand_positioning" "$PYTHON" \
  -m services.competitor_intel.brand_positioning_pipeline \
  --workspace-id "$WORKSPACE_ID"

# ─── Stage 5: Douyin content drafts ──────────────────────────────────────────
# Skip-if-exists at (workspace_id, week_of) — preserves the user's
# mark_posted / dismiss decisions across reruns.
run_step "5/7 gtm_content" "$PYTHON" \
  -m services.competitor_intel.gtm_content_pipeline \
  --workspace-id "$WORKSPACE_ID"

# ─── Stage 6: product opportunity ────────────────────────────────────────────
# Skip-if-exists same as Stage 5 — preserves accept/dismiss state.
run_step "6/7 product_opportunity" "$PYTHON" \
  -m services.competitor_intel.product_opportunity_pipeline \
  --workspace-id "$WORKSPACE_ID"

# ─── Stage 7: white space ────────────────────────────────────────────────────
run_step "7/7 white_space" "$PYTHON" \
  -m services.competitor_intel.white_space_pipeline \
  --workspace-id "$WORKSPACE_ID"

# ─── Done ────────────────────────────────────────────────────────────────────
log "═══ Analysis chain COMPLETE ═══"
set_job_status "complete" ", completed_at=NOW()"
exit 0
