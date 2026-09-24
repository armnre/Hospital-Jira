#!/usr/bin/env bash
# =============================================================================
# HWDT — Automated restore test (non-destructive)
#
# Usage: ./scripts/test_restore.sh [database ...]   (default: jira_db confluence_db)
#
# For each database:
#   1. takes the latest backup (or creates one if none exists)
#   2. restores it into <db>_restore_test
#   3. compares table list + row counts with the source database
#   4. drops the scratch database
# Exit code 0 = every restore verified.
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"

if [[ $# -gt 0 ]]; then DATABASES=("$@"); else
  read -r -a DATABASES <<< "${BACKUP_DATABASES:-${JIRA_DB_NAME:-jira_db} ${CONFLUENCE_DB_NAME:-confluence_db} ${HWDT_DB_NAME:-hwdt_db}}"
fi

RESULT=0
for DB in "${DATABASES[@]}"; do
  SCRATCH="${DB}_restore_test"
  log "=== Restore test for ${DB} ==="
  LATEST="$(ls -1t "${BACKUP_DIR}/${DB}"/*.dump 2>/dev/null | head -n1 || true)"
  if [[ -z "$LATEST" ]]; then
    log "No backup found for ${DB}; creating one"
    "${SCRIPT_DIR}/backup_database.sh" "$DB"
    LATEST="$(ls -1t "${BACKUP_DIR}/${DB}"/*.dump | head -n1)"
  fi

  "${SCRIPT_DIR}/restore_database.sh" "$LATEST" "$SCRATCH" --force

  SRC_FP="$(db_fingerprint "$DB")"
  DST_FP="$(db_fingerprint "$SCRATCH")"
  TABLES="$(printf '%s\n' "$SRC_FP" | grep -c . || true)"
  if [[ "$SRC_FP" == "$DST_FP" ]]; then
    log "PASS ${DB}: ${TABLES} table(s), row counts identical (backup $(basename "$LATEST"))"
  else
    warn "FAIL ${DB}: fingerprint mismatch"
    diff <(printf '%s\n' "$SRC_FP") <(printf '%s\n' "$DST_FP") || true
    RESULT=1
  fi
  psql_admin -c "DROP DATABASE IF EXISTS \"${SCRATCH}\";" > /dev/null
  log "Scratch database ${SCRATCH} dropped"
done

[[ "$RESULT" -eq 0 ]] && log "Restore test PASSED" || die "Restore test FAILED"
