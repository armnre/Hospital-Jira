# Deployment Guide

## Prerequisites

- Docker Engine 24+ with Docker Compose v2
- 8 GB RAM free (Jira + Confluence ≈ 4-5 GB), 20 GB disk
- Ports 80/443 free

## One-command deployment

```bash
cd hospital-workforce-platform
./scripts/setup.sh
```

`setup.sh` generates `.env` with random secrets, adds `jira.local confluence.local monitoring.local` to `/etc/hosts`, pulls images and runs `docker compose up -d`.

## Manual deployment

```bash
cp .env.example .env              # or ./scripts/generate_env.sh
vi .env                           # replace every change_me value
echo "127.0.0.1 jira.local confluence.local monitoring.local" | sudo tee -a /etc/hosts
docker compose up -d
docker compose ps                 # wait until all services are healthy
```

## First start of Jira and Confluence

1. Open `http://jira.local` — the database step is skipped automatically; enter a licence (free trial from my.atlassian.com) and create the admin user.
2. Open `http://confluence.local` — same procedure (or set `CONFLUENCE_LICENSE_KEY`).
3. Put the admin credentials into `.env` (`JIRA_ADMIN_PASSWORD`, `CONFLUENCE_ADMIN_PASSWORD`).

## Provision project structure and documentation

```bash
docker compose --profile provision run --rm provisioner
```

Creates issue types, custom fields, project HWDT, epics, Confluence space and pages. Re-running is safe (idempotent).

Then in Jira admin:

1. Create missing statuses reported by the provisioner.
2. Import the rendered workflow XML (Admin → Issues → Workflows → Import from XML).
3. Create "HWDT Workflow Scheme" (default: Delivery, Bug/Incident: Bug workflow) and associate it with HWDT.
4. Create groups `hwdt-*` and apply "HWDT Permission Scheme".

## Validation

```bash
./scripts/validate_environment.sh      # writes docs/test-report-<ts>.md
./scripts/health_check.sh
```

## Operations

| Task | Command |
|---|---|
| Stop | `docker compose stop` |
| Start | `docker compose up -d` |
| Logs | `docker compose logs -f jira` |
| Upgrade | change version in `.env`, `docker compose pull && docker compose up -d` |
| Remove (keep data) | `docker compose down` |
| Remove everything | `docker compose down -v` (destroys volumes!) |
