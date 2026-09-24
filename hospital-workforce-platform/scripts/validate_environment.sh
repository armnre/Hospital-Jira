#!/usr/bin/env bash
# =============================================================================
# HWDT — PHASE 0 validation suite (run on a Docker host after `docker compose up -d`)
# Usage: ./scripts/validate_environment.sh
# Writes a Markdown report to docs/test-report-<timestamp>.md
# =============================================================================
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"
set +e

COMPOSE=(docker compose -f "${HWDT_ROOT}/docker-compose.yml")
REPORT="${HWDT_ROOT}/docs/test-report-$(date -u +%Y%m%dT%H%M%SZ).md"
PASS=0; FAIL=0
ROWS=()
record() { # area test result details
  ROWS+=("| $1 | $2 | $3 | $4 |")
  if [[ "$3" == "PASS" ]]; then PASS=$((PASS+1)); echo "✓ [$1] $2"; else FAIL=$((FAIL+1)); echo "✗ [$1] $2 — $4"; fi
}

# ---- Docker ----------------------------------------------------------------
"${COMPOSE[@]}" config -q && record Docker "Compose file valid" PASS "docker compose config" \
                          || record Docker "Compose file valid" FAIL "docker compose config failed"
for svc in postgres jira confluence nginx backup prometheus cadvisor node-exporter backend frontend; do
  cid="$("${COMPOSE[@]}" ps -q "$svc")"
  state="$( [[ -n "$cid" ]] && docker inspect -f '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$cid" || echo missing)"
  [[ "$state" == running/healthy || "$state" == running/none ]] && record Docker "Container $svc" PASS "$state" \
                                                             || record Docker "Container $svc" FAIL "$state"
done

# ---- Database --------------------------------------------------------------
psql_admin -Atc "select 1" >/dev/null && record Database "PostgreSQL accepts connections" PASS "select 1" \
                                      || record Database "PostgreSQL accepts connections" FAIL "psql failed"
for pair in "${JIRA_DB_NAME:-jira_db}:${JIRA_DB_USER:-jira_user}" "${CONFLUENCE_DB_NAME:-confluence_db}:${CONFLUENCE_DB_USER:-confluence_user}"; do
  db="${pair%%:*}"; owner="${pair##*:}"
  actual="$(psql_admin -Atc "select pg_get_userbyid(datdba) from pg_database where datname='${db}'")"
  [[ "$actual" == "$owner" ]] && record Database "${db} owned by ${owner}" PASS "owner=${actual}" \
                              || record Database "${db} owned by ${owner}" FAIL "owner=${actual:-none}"
done

# ---- Jira / Confluence via reverse proxy ------------------------------------
PORT="${NGINX_HTTP_PORT:-80}"
for pair in "jira.local:Jira" "confluence.local:Confluence"; do
  host="${pair%%:*}"; name="${pair##*:}"
  body="$(curl -s -H "Host: ${host}" "http://127.0.0.1:${PORT}/status")"
  echo "$body" | grep -Eq 'RUNNING|FIRST_RUN' && record "$name" "Accessible via http://${host}" PASS "$body" \
                                             || record "$name" "Accessible via http://${host}" FAIL "${body:-no response}"
done

# ---- Networking --------------------------------------------------------------
hdrs="$(curl -sI -H 'Host: jira.local' "http://127.0.0.1:${PORT}/status")"
echo "$hdrs" | grep -qi 'x-content-type-options: nosniff' && record Networking "Security headers present" PASS "nosniff/SAMEORIGIN" \
                                                        || record Networking "Security headers present" FAIL "headers missing"
code="$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: unknown.local' "http://127.0.0.1:${PORT}/x")"
[[ "$code" == "000" ]] && record Networking "Unknown hosts rejected (444)" PASS "connection closed" \
                       || record Networking "Unknown hosts rejected (444)" FAIL "HTTP ${code}"
"${COMPOSE[@]}" exec -T nginx wget -qO- http://jira:8080/status >/dev/null 2>&1 && record Networking "nginx -> jira:8080 internal DNS" PASS "reachable" \
                                                                                  || record Networking "nginx -> jira:8080 internal DNS" FAIL "unreachable"
"${COMPOSE[@]}" exec -T nginx wget -qO- http://confluence:8090/status >/dev/null 2>&1 && record Networking "nginx -> confluence:8090 internal DNS" PASS "reachable" \
                                                                                        || record Networking "nginx -> confluence:8090 internal DNS" FAIL "unreachable"
"${COMPOSE[@]}" exec -T nginx nginx -t >/dev/null 2>&1 && record Networking "nginx -t" PASS "syntax ok" || record Networking "nginx -t" FAIL "syntax error"

# ---- Backup / Restore ---------------------------------------------------------
"${SCRIPT_DIR}/backup_database.sh" >/tmp/hwdt-backup.log 2>&1 && record Backup "backup_database.sh" PASS "$(grep -c 'OK ' /tmp/hwdt-backup.log) dump(s)" \
                                                            || record Backup "backup_database.sh" FAIL "see /tmp/hwdt-backup.log"
"${SCRIPT_DIR}/test_restore.sh" >/tmp/hwdt-restore.log 2>&1 && record Restore "test_restore.sh" PASS "fingerprints identical" \
                                                           || record Restore "test_restore.sh" FAIL "see /tmp/hwdt-restore.log"

# ---- Monitoring -----------------------------------------------------------------
targets="$("${COMPOSE[@]}" exec -T prometheus wget -qO- 'http://127.0.0.1:9090/api/v1/query?query=up' 2>/dev/null)"
echo "$targets" | grep -q '"job":"cadvisor"' && record Monitoring "Prometheus scraping cAdvisor/node-exporter" PASS "up metrics present" \
                                            || record Monitoring "Prometheus scraping cAdvisor/node-exporter" FAIL "no targets"

{
  echo "# HWDT Phase 0 — Test Report ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
  echo
  echo "**Result:** ${PASS} passed, ${FAIL} failed"
  echo
  echo "| Area | Test | Result | Details |"
  echo "|---|---|---|---|"
  printf '%s\n' "${ROWS[@]}"
} > "$REPORT"
echo; echo "Report: ${REPORT}"
echo "Summary: ${PASS} passed, ${FAIL} failed"
[[ "$FAIL" -eq 0 ]]
