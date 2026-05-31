#!/bin/bash
# Daily PostgreSQL backup — keeps 14 days of compressed dumps.
#
# Hardened 2026-05-31 (issue #133):
#   - Fails loudly if DATABASE_URL or DB_PASSWORD is not set (no more
#     silent '123456789' fallback). Pre-fix, the 2026-05-04 path-change
#     cron failure silently used the wrong password for 22 days while
#     reporting success.
#   - Prefers DATABASE_URL when present (matches the rest of the codebase
#     via backend/db.js, services/competitor_intel/db_bridge.py).
#   - Non-zero exit on ANY failure so cron / monitoring can detect it.
#   - Backup-size sanity check now non-zero exits (was: just print WARNING).
#
# Run: bash scripts/backup_db.sh
# Cron: 0 3 * * * /root/rebase/scripts/backup_db.sh >> /var/log/rebase-backup.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load env. Use `set -a` so the exports take effect for the duration of
# this script; safer than the per-line export which mishandled lines
# containing '=' in the value (e.g. PASSWORD=foo=bar).
if [ -f "$REPO_DIR/backend/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$REPO_DIR/backend/.env"
  set +a
fi

# Fail-closed: refuse to back up without explicit credentials.
# Either DATABASE_URL (preferred — matches the rest of the codebase) OR
# DB_PASSWORD must be set. The placeholder '123456789' is rejected even
# if someone tries to use it as a real password.
if [ -z "${DATABASE_URL:-}" ] && [ -z "${DB_PASSWORD:-}" ]; then
  echo "[$(date)] ERROR: Neither DATABASE_URL nor DB_PASSWORD is set." >&2
  echo "  Set one in $REPO_DIR/backend/.env or as an env var." >&2
  echo "  This script no longer silently falls back to a placeholder password." >&2
  exit 2
fi
if [ "${DB_PASSWORD:-}" = "123456789" ]; then
  echo "[$(date)] ERROR: DB_PASSWORD is set to the placeholder '123456789'." >&2
  echo "  This is the placeholder from .env.example, not a real password." >&2
  echo "  Update $REPO_DIR/backend/.env with the real password." >&2
  exit 2
fi

BACKUP_DIR="/var/backups/rebase"
mkdir -p "$BACKUP_DIR"

FILENAME="rebase_$(date +%Y%m%d_%H%M%S).sql.gz"

# pg_dump call — prefer DATABASE_URL when set so we use the same
# connection string as the rest of the codebase. Falls back to the
# tuple form with DB_PASSWORD if DATABASE_URL is missing.
if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/$FILENAME"
else
  PGPASSWORD="$DB_PASSWORD" pg_dump -U rebase_app rebase | gzip > "$BACKUP_DIR/$FILENAME"
fi

# Verify backup is not empty (suspicious = pg_dump returned an error
# stream into the file, or the connection failed silently).
SIZE=$(stat -c %s "$BACKUP_DIR/$FILENAME" 2>/dev/null || echo 0)
if [ "$SIZE" -lt 1000 ]; then
  echo "[$(date)] ERROR: Backup suspiciously small ($SIZE bytes): $FILENAME" >&2
  echo "  This usually means pg_dump failed (wrong creds, DB down, etc.)" >&2
  echo "  Removing the bad file so it doesn't get counted as a success." >&2
  rm -f "$BACKUP_DIR/$FILENAME"
  exit 3
fi
echo "[$(date)] Backup complete: $FILENAME ($SIZE bytes)"

# Clean backups older than 14 days. `find -delete` returns non-zero if a
# file in scope can't be removed, but with `set -e` we'd exit. Allow
# cleanup failures to be non-fatal — the new backup is what matters.
find "$BACKUP_DIR" -name "rebase_*.sql.gz" -mtime +14 -delete || true
COUNT=$(find "$BACKUP_DIR" -name "rebase_*.sql.gz" | wc -l)
echo "[$(date)] Old backups cleaned. Current backups: $COUNT"
