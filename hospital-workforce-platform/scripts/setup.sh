#!/usr/bin/env bash
# =============================================================================
# HWDT — ONE-COMMAND BOOTSTRAP
#   ./scripts/setup.sh
# 1. checks prerequisites  2. generates .env with random secrets
# 3. adds *.local host entries (asks for sudo)  4. docker compose up -d
# 5. waits for health  6. prints next steps
# =============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v docker >/dev/null || { echo "Docker is required: https://docs.docker.com/get-docker/"; exit 1; }
docker compose version >/dev/null || { echo "Docker Compose v2 is required"; exit 1; }

./scripts/generate_env.sh

if ! grep -q "jira.local" /etc/hosts; then
  echo "Adding jira.local / confluence.local / monitoring.local to /etc/hosts (sudo)"
  echo "127.0.0.1 jira.local confluence.local monitoring.local hwdt.local" | sudo tee -a /etc/hosts >/dev/null || \
    echo "WARN: could not edit /etc/hosts — add the line manually"
fi

docker compose pull --ignore-buildable
docker compose up -d --build
# Existing Phase 0 volumes: make sure the Phase 1 database exists (idempotent)
docker compose exec -T postgres bash /docker-entrypoint-initdb.d/02-init-hwdt-app.sh || true

echo "Waiting for PostgreSQL, Nginx and the backup service..."
for i in $(seq 1 60); do
  healthy="$(docker compose ps --format '{{.Service}} {{.Health}}' | grep -cE '^(postgres|nginx) healthy' || true)"
  [[ "$healthy" -ge 2 ]] && break
  sleep 5
done
docker compose ps

cat <<'EOF'

HWDT Phase 0 stack is starting.
  Jira        http://jira.local         (first boot: 3-5 min, then setup wizard -> licence + admin)
  Confluence  http://confluence.local   (first boot: 3-5 min, then setup wizard)
  Monitoring  http://monitoring.local   (Prometheus)
  Workforce   http://hwdt.local          (Phase 1 app, demo login: admin@hwdt.local)

Next steps:
  1. Complete both setup wizards (database is pre-configured automatically).
  2. Put the admin credentials into .env (JIRA_ADMIN_*, CONFLUENCE_ADMIN_*).
  3. docker compose --profile provision run --rm provisioner
  4. ./scripts/validate_environment.sh
EOF
