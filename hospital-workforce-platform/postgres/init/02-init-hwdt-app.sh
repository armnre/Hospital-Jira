#!/usr/bin/env bash
# =============================================================================
# HWDT Phase 1: application database (hwdt_db) owned by hwdt_app.
# Runs automatically on a FRESH postgres volume. For an existing Phase 0 volume run once:
#   docker compose exec postgres bash /docker-entrypoint-initdb.d/02-init-hwdt-app.sh
# Idempotent. Schemas/tables are created by backend migrations (database/migrations).
# =============================================================================
set -euo pipefail
: "${POSTGRES_USER:?}"
HWDT_DB_NAME="${HWDT_DB_NAME:-hwdt_db}"
HWDT_DB_USER="${HWDT_DB_USER:-hwdt_app}"
: "${HWDT_DB_PASSWORD:?HWDT_DB_PASSWORD must be set}"
psql_admin() { psql -v ON_ERROR_STOP=1 --no-psqlrc --username "$POSTGRES_USER" --dbname "${POSTGRES_DB:-postgres}" "$@"; }

echo "[hwdt-init] ensuring role ${HWDT_DB_USER} and database ${HWDT_DB_NAME}"
psql_admin -v role="$HWDT_DB_USER" -v pw="$HWDT_DB_PASSWORD" <<'EOSQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'role', :'pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'role', :'pw') \gexec
EOSQL
if ! psql_admin -Atc "SELECT 1 FROM pg_database WHERE datname = '${HWDT_DB_NAME}'" | grep -q 1; then
  psql_admin -v db="$HWDT_DB_NAME" -v owner="$HWDT_DB_USER" <<'EOSQL'
SELECT format('CREATE DATABASE %I WITH OWNER %I ENCODING ''UTF8'' TEMPLATE template0', :'db', :'owner') \gexec
EOSQL
fi
psql_admin -v db="$HWDT_DB_NAME" -v owner="$HWDT_DB_USER" <<'EOSQL'
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db') \gexec
SELECT format('GRANT CONNECT, TEMPORARY, CREATE ON DATABASE %I TO %I', :'db', :'owner') \gexec
EOSQL
psql -v ON_ERROR_STOP=1 --no-psqlrc --username "$POSTGRES_USER" --dbname "$HWDT_DB_NAME" -v owner="$HWDT_DB_USER" <<'EOSQL'
SELECT format('ALTER SCHEMA public OWNER TO %I', :'owner') \gexec
EOSQL
echo "[hwdt-init] ${HWDT_DB_NAME}/${HWDT_DB_USER} ready"
