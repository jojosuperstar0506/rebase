#!/bin/bash
# Rebase health check — runs every 5 minutes via cron
# Checks Express + PostgreSQL, alerts via WeChat if down, auto-restarts Express

ECS_URL="http://localhost:3000"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load environment
if [ -f "$REPO_DIR/backend/.env" ]; then
  while IFS= read -r line; do
    [[ -z "$line" || "$line" =~ ^# ]] && continue
    export "$line"
  done < "$REPO_DIR/backend/.env"
fi

# Check Express
if ! curl -sf "$ECS_URL/health" > /dev/null 2>&1; then
  echo "[$(date)] EXPRESS DOWN — attempting restart"

  # Alert via WeChat
  if [ -n "$WECHAT_WORK_WEBHOOK" ]; then
    curl -s -X POST "$WECHAT_WORK_WEBHOOK" \
      -H 'Content-Type: application/json' \
      -d '{"msgtype":"text","text":{"content":"⚠️ Rebase API is DOWN — auto-restarting"}}' \
      > /dev/null 2>&1
  fi

  # Restart
  pm2 restart all
fi

# Check PostgreSQL
if ! PGPASSWORD="${DB_PASSWORD:-123456789}" psql -U rebase_app -d rebase -c "SELECT 1" > /dev/null 2>&1; then
  echo "[$(date)] POSTGRESQL DOWN"

  if [ -n "$WECHAT_WORK_WEBHOOK" ]; then
    curl -s -X POST "$WECHAT_WORK_WEBHOOK" \
      -H 'Content-Type: application/json' \
      -d '{"msgtype":"text","text":{"content":"⚠️ Rebase PostgreSQL is DOWN — manual intervention needed"}}' \
      > /dev/null 2>&1
  fi
fi
