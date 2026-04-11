#!/bin/bash
# Daily PostgreSQL backup — keeps 14 days of compressed dumps

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load environment for DB password
if [ -f "$REPO_DIR/backend/.env" ]; then
  while IFS= read -r line; do
    [[ -z "$line" || "$line" =~ ^# ]] && continue
    export "$line"
  done < "$REPO_DIR/backend/.env"
fi

BACKUP_DIR="/var/backups/rebase"
mkdir -p "$BACKUP_DIR"

FILENAME="rebase_$(date +%Y%m%d_%H%M%S).sql.gz"
PGPASSWORD="${DB_PASSWORD:-123456789}" pg_dump -U rebase_app rebase | gzip > "$BACKUP_DIR/$FILENAME"

# Verify backup is not empty
SIZE=$(stat -c %s "$BACKUP_DIR/$FILENAME" 2>/dev/null || echo 0)
if [ "$SIZE" -lt 1000 ]; then
  echo "[$(date)] WARNING: Backup suspiciously small ($SIZE bytes): $FILENAME"
else
  echo "[$(date)] Backup complete: $FILENAME ($SIZE bytes)"
fi

# Clean backups older than 14 days
find "$BACKUP_DIR" -name "rebase_*.sql.gz" -mtime +14 -delete
echo "[$(date)] Old backups cleaned. Current backups: $(ls $BACKUP_DIR/*.sql.gz 2>/dev/null | wc -l)"
