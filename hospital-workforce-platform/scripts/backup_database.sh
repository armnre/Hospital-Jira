#!/usr/bin/env bash
# =============================================================================
# HWDT — PostgreSQL backup
#
# Usage:  ./scripts/backup_database.sh [database ...]
#         (default databases: $BACKUP_DATABASES or "jira_db confluence_db")
#
# Produces, per database:
#   $BACKUP_DIR/<db>/<db>_<UTC timestamp>.dump         (pg_dump custom format, compressed)
#   $BACKUP_DIR/<db>/<db>_<UTC timestamp>.dump.sha256  (integrity checksum)
#   $BACKUP_DIR/globals/globals_<ts>.sql               (roles, no passwords)
# Applies retention: deletes dumps older than $BACKUP_RETENTION_DAYS (default 7).
# Writes epoch of last success to $BACKUP_DIR/.last_success (used by healthcheck).
# =============================================================================
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
if [[ $# -gt 0 ]]; then
  DATABASES=("$@")
else
  read -r -a DATABASES <<< "${BACKUP_DATABASES:-${JIRA_DB_NAME:-jira_db} ${CONFLUENCE_DB_NAME:-confluence_db} ${HWDT_DB_NAME:-hwdt_db}}"
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
log "Backup started (mode=${BACKUP_MODE}, dir=${BACKUP_DIR}, databases=${DATABASES[*]})"

# Cluster globals (roles/memberships) — passwords intentionally excluded
mkdir -p "${BACKUP_DIR}/globals"
if pg_tool pg_dumpall --globals-only --no-role-passwords > "${BACKUP_DIR}/globals/globals_${TS}.sql" 2>/dev/null; then
  log "Globals saved: globals/globals_${TS}.sql"
else
  rm -f "${BACKUP_DIR}/globals/globals_${TS}.sql"
  warn "Could not dump cluster globals (continuing)"
fi

FAILED=0
for DB in "${DATABASES[@]}"; do
  if ! db_exists "$DB"; then
    warn "Database '${DB}' does not exist — skipped"
    FAILED=1
    continue
  fi
  OUT_DIR="${BACKUP_DIR}/${DB}"
  mkdir -p "$OUT_DIR"
  FILE="${OUT_DIR}/${DB}_${TS}.dump"
  TMP="${FILE}.partial"

  log "Dumping ${DB} -> ${FILE}"
  if pg_tool pg_dump --format=custom --compress=6 --no-owner --no-privileges -d "$DB" > "$TMP"; then
    mv "$TMP" "$FILE"
    ( cd "$OUT_DIR" && sha256sum "$(basename "$FILE")" > "$(basename "$FILE").sha256" )
    SIZE="$(du -h "$FILE" | cut -f1)"
    log "OK ${DB}: ${SIZE}, sha256=$(cut -d' ' -f1 "${FILE}.sha256")"
  else
    rm -f "$TMP"
    warn "pg_dump failed for ${DB}"
    FAILED=1
  fi
done

# Retention
if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ && "$RETENTION_DAYS" -gt 0 ]]; then
  DELETED="$(find "$BACKUP_DIR" -type f \( -name '*.dump' -o -name '*.dump.sha256' -o -name 'globals_*.sql' \) -mtime +"$RETENTION_DAYS" -print -delete | wc -l)"
  log "Retention (${RETENTION_DAYS}d): removed ${DELETED} old file(s)"
fi

if [[ "$FAILED" -ne 0 ]]; then
  die "Backup finished with errors"
fi
date +%s > "${BACKUP_DIR}/.last_success"
log "Backup completed successfully"
