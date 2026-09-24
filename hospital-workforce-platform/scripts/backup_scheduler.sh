#!/usr/bin/env bash
# HWDT — entrypoint of the "backup" container. Runs backup_database.sh immediately,
# then every $BACKUP_INTERVAL_SECONDS (default 24h). Weekly restore test on Sundays.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"

echo "[hwdt-backup] scheduler starting (interval=${INTERVAL}s, retention=${BACKUP_RETENTION_DAYS:-7}d)"
until pg_isready -h "${PGHOST:-postgres}" -U "${PGUSER:-postgres}" >/dev/null 2>&1; do
  echo "[hwdt-backup] waiting for PostgreSQL..."
  sleep 5
done

trap 'echo "[hwdt-backup] stopping"; exit 0' SIGTERM SIGINT

while true; do
  if bash "${SCRIPT_DIR}/backup_database.sh"; then
    echo "[hwdt-backup] backup cycle OK"
  else
    echo "[hwdt-backup] backup cycle FAILED" >&2
  fi
  if [[ "$(date -u +%u)" == "7" ]]; then
    bash "${SCRIPT_DIR}/test_restore.sh" || echo "[hwdt-backup] weekly restore test FAILED" >&2
  fi
  sleep "$INTERVAL" &
  wait $!
done
