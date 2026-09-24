#!/usr/bin/env bash
# =============================================================================
# HWDT — Health check: container status, CPU, memory, disk, endpoints, backups.
# Usage: ./scripts/health_check.sh [--json]
# Exit code: 0 healthy, 1 degraded (at least one check failed)
# =============================================================================
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"
set +e

COMPOSE=(docker compose -f "${HWDT_ROOT}/docker-compose.yml")
STATUS=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; STATUS=1; }
hdr()  { printf '\n\033[1m%s\033[0m\n' "$*"; }

command -v docker >/dev/null 2>&1 || die "docker CLI not found"

hdr "1. Container status"
for svc in postgres jira confluence nginx backup prometheus cadvisor node-exporter backend frontend; do
  cid="$("${COMPOSE[@]}" ps -q "$svc" 2>/dev/null)"
  if [[ -z "$cid" ]]; then bad "$svc: not created"; continue; fi
  state="$(docker inspect -f '{{.State.Status}}' "$cid")"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "$cid")"
  restarts="$(docker inspect -f '{{.RestartCount}}' "$cid")"
  if [[ "$state" == "running" && ( "$health" == "healthy" || "$health" == "n/a" ) ]]; then
    ok "$svc: state=$state health=$health restarts=$restarts"
  elif [[ "$health" == "starting" ]]; then
    printf '  \033[33m…\033[0m %s: state=%s health=starting (Atlassian apps need 3-5 min)\n' "$svc" "$state"
  else
    bad "$svc: state=$state health=$health restarts=$restarts"
  fi
done

hdr "2. CPU / memory per container"
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}' \
  $("${COMPOSE[@]}" ps -q) 2>/dev/null | sed 's/^/  /'

hdr "3. Disk usage"
df -h "${HWDT_ROOT}" | sed 's/^/  /'
docker system df 2>/dev/null | sed 's/^/  /'
for v in hwdt_postgres_data hwdt_jira_data hwdt_confluence_data hwdt_prometheus_data; do
  size="$(docker run --rm -v "$v":/v alpine:3.20 du -sh /v 2>/dev/null | cut -f1)"
  [[ -n "$size" ]] && ok "volume $v: $size" || bad "volume $v: missing"
done
PCT="$(df -P "${HWDT_ROOT}" | awk 'NR==2 {gsub("%","",$5); print $5}')"
[[ "$PCT" -lt 85 ]] && ok "host disk usage ${PCT}% (<85%)" || bad "host disk usage ${PCT}% (>=85%)"

hdr "4. Endpoints through the reverse proxy"
PORT="${NGINX_HTTP_PORT:-80}"
probe() {
  local host="$1" path="$2" expect="$3"
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: ${host}" "http://127.0.0.1:${PORT}${path}")"
  [[ "$code" =~ $expect ]] && ok "${host}${path} -> HTTP ${code}" || bad "${host}${path} -> HTTP ${code} (expected ${expect})"
}
probe localhost        /nginx-health '^200$'
probe jira.local       /status       '^(200|302|303)$'
probe confluence.local /status       '^(200|302|303)$'
probe monitoring.local /-/healthy    '^200$'
probe hwdt.local       /api/v1/health '^200$'
probe hwdt.local       /login         '^200$'

hdr "5. Database"
if psql_admin -Atc "SELECT datname FROM pg_database WHERE datname IN ('${JIRA_DB_NAME:-jira_db}','${CONFLUENCE_DB_NAME:-confluence_db}') ORDER BY 1" | tr '\n' ' ' | grep -q "confluence_db jira_db"; then
  ok "jira_db and confluence_db present"
else
  bad "application databases missing"
fi

hdr "6. Backups"
if [[ -f "${BACKUP_DIR}/.last_success" ]]; then
  AGE=$(( $(date +%s) - $(cat "${BACKUP_DIR}/.last_success") ))
  [[ "$AGE" -lt $(( ${BACKUP_INTERVAL_SECONDS:-86400} * 2 )) ]] && ok "last backup ${AGE}s ago" || bad "last backup ${AGE}s ago (stale)"
else
  bad "no successful backup recorded yet"
fi

echo
[[ "$STATUS" -eq 0 ]] && echo "OVERALL: HEALTHY" || echo "OVERALL: DEGRADED"
exit "$STATUS"
