#!/usr/bin/env bash
# HWDT — shared helpers for backup / restore / validation scripts.
# Execution modes:
#   BACKUP_MODE=docker  -> run pg tools inside the "postgres" compose container (host usage)
#   BACKUP_MODE=direct  -> run local pg tools against $PGHOST (backup container, CI, sandbox)
#   BACKUP_MODE=auto    -> direct if PGHOST is set, else docker if available, else direct
set -euo pipefail

HWDT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export HWDT_ROOT

# Load .env when running on the host (never required inside containers)
if [[ -f "${HWDT_ROOT}/.env" && -z "${HWDT_ENV_LOADED:-}" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${HWDT_ROOT}/.env"
  set +a
  export HWDT_ENV_LOADED=1
fi

BACKUP_DIR="${BACKUP_DIR:-${HWDT_ROOT}/postgres/backups}"
BACKUP_MODE="${BACKUP_MODE:-auto}"
PG_SUPERUSER="${PGUSER:-${POSTGRES_SUPERUSER:-postgres}}"

if [[ "$BACKUP_MODE" == "auto" ]]; then
  if [[ -n "${PGHOST:-}" ]]; then
    BACKUP_MODE=direct
  elif command -v docker >/dev/null 2>&1; then
    BACKUP_MODE=docker
  else
    BACKUP_MODE=direct
  fi
fi
export BACKUP_MODE BACKUP_DIR

log()  { echo "[hwdt] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }
warn() { echo "[hwdt] $(date -u +%Y-%m-%dT%H:%M:%SZ) WARN: $*" >&2; }
die()  { echo "[hwdt] $(date -u +%Y-%m-%dT%H:%M:%SZ) ERROR: $*" >&2; exit 1; }

# Run a PostgreSQL client tool (psql, pg_dump, pg_restore, ...) in the selected mode.
# stdin/stdout are passed through, so streaming dumps work in both modes.
pg_tool() {
  local tool="$1"; shift
  if [[ "$BACKUP_MODE" == "docker" ]]; then
    docker compose -f "${HWDT_ROOT}/docker-compose.yml" exec -T \
      -e PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD:-}" postgres \
      "$tool" -U "$PG_SUPERUSER" "$@"
  else
    "$tool" -U "$PG_SUPERUSER" "$@"
  fi
}

psql_admin() { pg_tool psql -v ON_ERROR_STOP=1 --no-psqlrc -d postgres "$@"; }

db_exists() {
  [[ "$(psql_admin -Atc "SELECT 1 FROM pg_database WHERE datname = '$1'")" == "1" ]]
}

# Default owner role for a database (jira_db -> jira_user, confluence_db -> confluence_user)
default_owner_for() {
  case "$1" in
    "${JIRA_DB_NAME:-jira_db}"*)             echo "${JIRA_DB_USER:-jira_user}" ;;
    "${CONFLUENCE_DB_NAME:-confluence_db}"*) echo "${CONFLUENCE_DB_USER:-confluence_user}" ;;
    "${HWDT_DB_NAME:-hwdt_db}"*)             echo "${HWDT_DB_USER:-hwdt_app}" ;;
    *) echo "$PG_SUPERUSER" ;;
  esac
}

# Deterministic fingerprint of a database: "schema.table|rowcount" for every base table.
db_fingerprint() {
  local db="$1"
  pg_tool psql --no-psqlrc -At -d "$db" -c "
    SELECT table_schema || '.' || table_name || '|' ||
           (xpath('/row/c/text()',
                  query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY 1;"
}
