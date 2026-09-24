#!/usr/bin/env bash
# =============================================================================
# HWDT — PostgreSQL restore
#
# Usage:
#   ./scripts/restore_database.sh <backup.dump | latest:<db>> [target_db] [--owner ROLE] [--force]
#
# Examples:
#   ./scripts/restore_database.sh latest:jira_db                     # restore into jira_db (asks to confirm)
#   ./scripts/restore_database.sh latest:jira_db jira_db_restore_test # non-destructive restore test
#   ./scripts/restore_database.sh postgres/backups/jira_db/jira_db_20260101T000000Z.dump jira_db --force
#
# Behaviour:
#   * verifies the .sha256 checksum before touching any database
#   * restoring over an EXISTING database requires --force (drops & recreates it)
#   * STOP Jira/Confluence before restoring their live database:
#       docker compose stop jira confluence
# =============================================================================
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/common.sh"

usage() { sed -n '3,20p' "$0"; exit 1; }
[[ $# -ge 1 ]] || usage

SOURCE="$1"; shift
TARGET=""
OWNER=""
FORCE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --owner) OWNER="$2"; shift 2 ;;
    --force) FORCE=1; shift ;;
    -h|--help) usage ;;
    *) TARGET="$1"; shift ;;
  esac
done

# Resolve "latest:<db>"
if [[ "$SOURCE" == latest:* ]]; then
  SRC_DB="${SOURCE#latest:}"
  SOURCE="$(ls -1t "${BACKUP_DIR}/${SRC_DB}"/*.dump 2>/dev/null | head -n1 || true)"
  [[ -n "$SOURCE" ]] || die "No backups found for '${SRC_DB}' in ${BACKUP_DIR}/${SRC_DB}"
fi
[[ -f "$SOURCE" ]] || die "Backup file not found: ${SOURCE}"

BASENAME="$(basename "$SOURCE")"
SRC_DB="${BASENAME%_*}"                    # jira_db_20260101T000000Z.dump -> jira_db
TARGET="${TARGET:-$SRC_DB}"
OWNER="${OWNER:-$(default_owner_for "$SRC_DB")}"

log "Restore requested: ${BASENAME} -> database '${TARGET}' (owner=${OWNER}, mode=${BACKUP_MODE})"

# 1. Integrity check
if [[ -f "${SOURCE}.sha256" ]]; then
  ( cd "$(dirname "$SOURCE")" && sha256sum -c --status "${BASENAME}.sha256" ) \
    || die "Checksum verification FAILED for ${BASENAME}"
  log "Checksum verified"
else
  warn "No checksum file for ${BASENAME} — integrity not verified"
fi

# 2. Validate archive readability
pg_tool pg_restore --list < "$SOURCE" > /dev/null || die "Archive is not a readable pg_dump custom-format file"

# 3. Determine encoding/collation BEFORE anything is dropped.
#    Priority: existing target -> existing source -> application defaults
#    (Jira requires collation C; Confluence a UTF-8 locale).
db_props() {
  psql_admin -At -F ' ' -c "SELECT pg_encoding_to_char(encoding), datcollate, datctype FROM pg_database WHERE datname = '$1'"
}
if db_exists "$TARGET"; then
  read -r ENC COLL CTYPE <<< "$(db_props "$TARGET")"
elif db_exists "$SRC_DB"; then
  read -r ENC COLL CTYPE <<< "$(db_props "$SRC_DB")"
else
  case "$SRC_DB" in
    "${JIRA_DB_NAME:-jira_db}") ENC=UTF8; COLL=C; CTYPE=C ;;
    *) ENC=UTF8; COLL="${CONFLUENCE_DB_LOCALE:-C.UTF-8}"; CTYPE="$COLL" ;;
  esac
fi
TEMPLATE_OPTS="ENCODING '${ENC}' LC_COLLATE '${COLL}' LC_CTYPE '${CTYPE}' TEMPLATE template0"

# 4. Prepare target database
if db_exists "$TARGET"; then
  if [[ "$FORCE" -ne 1 ]]; then
    if [[ -t 0 ]]; then
      read -r -p "Database '${TARGET}' exists and will be DROPPED. Type the database name to continue: " CONFIRM
      [[ "$CONFIRM" == "$TARGET" ]] || die "Aborted by user"
    else
      die "Target '${TARGET}' exists. Re-run with --force to overwrite."
    fi
  fi
  log "Dropping existing database '${TARGET}'"
  psql_admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TARGET}' AND pid <> pg_backend_pid();" > /dev/null
  psql_admin -c "DROP DATABASE \"${TARGET}\";" > /dev/null
fi

log "Creating database '${TARGET}' (${TEMPLATE_OPTS})"
psql_admin -c "CREATE DATABASE \"${TARGET}\" WITH OWNER \"${OWNER}\" ${TEMPLATE_OPTS};" > /dev/null
psql_admin -c "REVOKE ALL ON DATABASE \"${TARGET}\" FROM PUBLIC; GRANT CONNECT, TEMPORARY, CREATE ON DATABASE \"${TARGET}\" TO \"${OWNER}\";" > /dev/null

# 5. Restore (objects owned by $OWNER)
log "Running pg_restore"
pg_tool pg_restore --no-owner --no-privileges --role="$OWNER" --exit-on-error -d "$TARGET" < "$SOURCE"

TABLES="$(pg_tool psql --no-psqlrc -At -d "$TARGET" -c "SELECT count(*) FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema')")"
log "Restore completed: '${TARGET}' now contains ${TABLES} table(s)"
