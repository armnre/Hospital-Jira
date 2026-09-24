#!/usr/bin/env bash
# =============================================================================
# HWDT — PostgreSQL bootstrap: creates jira_db / confluence_db and their owners.
# Executed automatically by the postgres image on first start
# (/docker-entrypoint-initdb.d). Idempotent: safe to re-run at any time:
#   docker compose exec postgres bash /docker-entrypoint-initdb.d/01-init-databases.sh
# All credentials come from environment variables (.env) — nothing hard-coded.
# =============================================================================
set -euo pipefail

: "${POSTGRES_USER:?POSTGRES_USER must be set}"
JIRA_DB_NAME="${JIRA_DB_NAME:-jira_db}"
JIRA_DB_USER="${JIRA_DB_USER:-jira_user}"
: "${JIRA_DB_PASSWORD:?JIRA_DB_PASSWORD must be set}"
CONFLUENCE_DB_NAME="${CONFLUENCE_DB_NAME:-confluence_db}"
CONFLUENCE_DB_USER="${CONFLUENCE_DB_USER:-confluence_user}"
: "${CONFLUENCE_DB_PASSWORD:?CONFLUENCE_DB_PASSWORD must be set}"
CONFLUENCE_DB_LOCALE="${CONFLUENCE_DB_LOCALE:-en_US.UTF-8}"
ADMIN_DB="${POSTGRES_DB:-postgres}"

log() { echo "[hwdt-init] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

psql_admin() {
  psql -v ON_ERROR_STOP=1 --no-psqlrc --username "$POSTGRES_USER" --dbname "$ADMIN_DB" "$@"
}

ensure_role() {
  local role="$1" password="$2"
  log "Ensuring role '${role}'"
  psql_admin -v role="$role" -v pw="$password" <<'EOSQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'role', :'pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'role', :'pw') \gexec
EOSQL
}

db_exists() {
  psql_admin -Atc "SELECT 1 FROM pg_database WHERE datname = '$1'" | grep -q 1
}

create_database() {
  local db="$1" owner="$2" encoding="$3" collate="$4"
  if db_exists "$db"; then
    log "Database '${db}' already exists — skipping create"
  else
    log "Creating database '${db}' (owner=${owner}, encoding=${encoding}, collate=${collate})"
    if ! psql_admin -v db="$db" -v owner="$owner" -v enc="$encoding" -v coll="$collate" <<'EOSQL'
SELECT format('CREATE DATABASE %I WITH OWNER %I ENCODING %L LC_COLLATE %L LC_CTYPE %L TEMPLATE template0',
              :'db', :'owner', :'enc', :'coll', :'coll') \gexec
EOSQL
    then
      log "WARN: locale '${collate}' unavailable — falling back to C.UTF-8"
      psql_admin -v db="$db" -v owner="$owner" -v enc="$encoding" <<'EOSQL'
SELECT format('CREATE DATABASE %I WITH OWNER %I ENCODING %L LC_COLLATE ''C.UTF-8'' LC_CTYPE ''C.UTF-8'' TEMPLATE template0',
              :'db', :'owner', :'enc') \gexec
EOSQL
    fi
  fi

  log "Hardening privileges on '${db}'"
  psql_admin -v db="$db" -v owner="$owner" <<'EOSQL'
SELECT format('ALTER DATABASE %I OWNER TO %I', :'db', :'owner') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db') \gexec
SELECT format('GRANT CONNECT, TEMPORARY, CREATE ON DATABASE %I TO %I', :'db', :'owner') \gexec
EOSQL
  psql -v ON_ERROR_STOP=1 --no-psqlrc --username "$POSTGRES_USER" --dbname "$db" -v owner="$owner" <<'EOSQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SELECT format('ALTER SCHEMA public OWNER TO %I', :'owner') \gexec
SELECT format('GRANT ALL ON SCHEMA public TO %I', :'owner') \gexec
EOSQL
}

log "Starting HWDT database bootstrap"
ensure_role "$JIRA_DB_USER" "$JIRA_DB_PASSWORD"
ensure_role "$CONFLUENCE_DB_USER" "$CONFLUENCE_DB_PASSWORD"

# Jira requires C collation + UNICODE encoding (Atlassian KB: "Connecting Jira to PostgreSQL")
create_database "$JIRA_DB_NAME" "$JIRA_DB_USER" "UNICODE" "C"
# Confluence requires UTF8 + a case-sensitive UTF-8 collation
create_database "$CONFLUENCE_DB_NAME" "$CONFLUENCE_DB_USER" "UTF8" "$CONFLUENCE_DB_LOCALE"

log "Bootstrap complete: ${JIRA_DB_NAME}/${JIRA_DB_USER}, ${CONFLUENCE_DB_NAME}/${CONFLUENCE_DB_USER}"
