# Hospital Workforce Digital Twin Platform

| Phase | Scope | Status |
|---|---|---|
| 0 | Jira, Confluence, PostgreSQL, Nginx, backups, monitoring (Docker Compose) | ✅ |
| 1 | **Employee Digital Twin + Credential Management**: React/TypeScript frontend, Node.js/Express API, JWT/RBAC, PostgreSQL migrations | ✅ |
| 2+ | Shift management, workforce matching engine, AI recommendations | planned |

## Phase 1: Workforce application

```text
Browser ──► nginx (hwdt.local) ──► frontend  (React + TypeScript, Next.js)  :3000
                              └──► backend   (Node.js 22 + Express 5 + TS)  :4000 /api/v1 ──► PostgreSQL hwdt_db
```

| Part | Location |
|---|---|
| Frontend (Login, HR Dashboard, Employee list/profile/forms, Credential management, Departments & Skills) | `frontend/src/views`, `frontend/src/components`, `frontend/src/lib` |
| Backend modules (auth, employees, credentials, reference, compliance) | `backend/src/modules/*` (routes → service → rules → repository) |
| Migrations + demo seed | `database/migrations/001…005_*.sql`, `database/seeds/` |
| Tests (59 backend incl. PostgreSQL integration, 11 frontend) | `tests/backend`, `tests/frontend`; run `scripts/run_phase1_tests.sh` |
| Docs (Confluence) | `docs/09-phase1-architecture.md` … `docs/12-phase1-business-rules.md` |
| Jira backlog (HWDT-9 … HWDT-20) | `jira/configuration/phase1-backlog.json` |

Credential status rule: **EXPIRED** if past expiry (always wins, never valid) → **PENDING_VERIFICATION** if unverified → **EXPIRING_SOON** if ≤ 60 days → **VALID**.

Roles: `ADMIN`, `HR_MANAGER`, `COMPLIANCE_OFFICER`, `EMPLOYEE` (permission matrix in `backend/src/modules/auth/rbac.ts`).
Demo users (only when `HWDT_SEED_DEMO=true` and `HWDT_SEED_PASSWORD` is empty): `admin@hwdt.local`, `hr.manager@hwdt.local`, `compliance@hwdt.local`, `amira.haddad@hwdt.local`, password `Hwdt!Demo2026`. **Disable demo seeding in shared environments.**

Commits must reference Jira: `HWDT-XXX: description` (enforced by `scripts/git-hooks/commit-msg`; enable with `git config core.hooksPath scripts/git-hooks`).

## Phase 0: Infrastructure foundation

Containerised technical foundation: **Jira, Confluence, PostgreSQL, Nginx reverse proxy, backup service and monitoring**, fully reproducible with Docker Compose.

## Quick start (one command)

```bash
cd hospital-workforce-platform
./scripts/setup.sh
```

Equivalent manual steps:

```bash
./scripts/generate_env.sh                 # .env with random secrets (never committed)
echo "127.0.0.1 jira.local confluence.local monitoring.local hwdt.local" | sudo tee -a /etc/hosts
docker compose up -d
```

| URL | Service |
|---|---|
| http://jira.local | Jira Software 10.3 LTS |
| http://confluence.local | Confluence 9.2 LTS |
| http://monitoring.local | Prometheus |
| http://hwdt.local | **Phase 1 Workforce app** (frontend + `/api/v1`) |

After the Jira/Confluence setup wizards (licence + admin user; the database is pre-configured):

```bash
docker compose --profile provision run --rm provisioner   # project HWDT, issue types, fields, epics, docs space
./scripts/validate_environment.sh                          # full validation + Markdown test report
```

## Services

| Service | Container | Restart | Health check | Persistent storage |
|---|---|---|---|---|
| postgres | hwdt-postgres | unless-stopped | pg_isready + select 1 | hwdt_postgres_data |
| jira | hwdt-jira | unless-stopped | /status | hwdt_jira_data |
| confluence | hwdt-confluence | unless-stopped | /status | hwdt_confluence_data |
| nginx | hwdt-nginx | unless-stopped | /nginx-health | hwdt_nginx_logs |
| backup | hwdt-backup | unless-stopped | last backup age | ./postgres/backups |
| prometheus | hwdt-prometheus | unless-stopped | /-/healthy | hwdt_prometheus_data |
| cadvisor | hwdt-cadvisor | unless-stopped | /healthz | — |
| node-exporter | hwdt-node-exporter | unless-stopped | /metrics | — |
| backend | hwdt-backend | unless-stopped | /api/v1/health | hwdt_db (postgres) |
| frontend | hwdt-frontend | unless-stopped | /login | — |
| provisioner | (profile `provision`) | no | — | — |

## Directory structure

```text
hospital-workforce-platform/
├── docker-compose.yml          # full stack
├── .env.example                # environment template (no secrets)
├── README.md
├── jira/configuration/         # hwdt-project.json + workflow XML
├── confluence/configuration/   # space.json (pages sourced from docs/)
├── postgres/
│   ├── init/                   # 01-init-databases.sh (jira_db, confluence_db, roles)
│   ├── config/                 # postgresql.conf
│   └── backups/                # dumps (git-ignored)
├── nginx/config/               # nginx.conf, conf.d vhosts, snippets, ssl/
├── monitoring/prometheus/      # prometheus.yml, alerts.yml
├── backend/                    # Phase 1 Express API (TypeScript) + Dockerfile
├── frontend/                   # Phase 1 React/Next.js app + Dockerfile
├── database/                   # Phase 1 migrations + seeds
├── tests/                      # Phase 1 automated tests (vitest)
├── scripts/                    # setup, backup, restore, test_restore, health_check, validate, provision/, git-hooks/
└── docs/                       # architecture, decisions, guides (= Confluence pages)
```

## Existing Phase 0 volume

Init scripts only run on a fresh volume. Create the Phase 1 database once (setup.sh does this automatically):

```bash
docker compose exec postgres bash /docker-entrypoint-initdb.d/02-init-hwdt-app.sh
docker compose up -d --build backend frontend
```

## Key scripts

| Script | Purpose |
|---|---|
| `scripts/setup.sh` | One-command bootstrap |
| `scripts/backup_database.sh [db...]` | Backup (custom-format dump + sha256 + retention) |
| `scripts/restore_database.sh <file\|latest:db> [target] [--force]` | Restore with checksum verification |
| `scripts/test_restore.sh` | Non-destructive restore test with row-count comparison |
| `scripts/health_check.sh` | Container status, CPU, memory, disk, endpoints, backups |
| `scripts/validate_environment.sh` | Phase 0 acceptance tests → `docs/test-report-*.md` |
| `scripts/generate_dev_certs.sh` | Self-signed TLS for *.local |

## Documentation

See `docs/` — System Architecture, Technical Decisions, Development Guidelines, Database Design, API Documentation, Deployment Guide, Security Guidelines, Backup Strategy, Health Check. The same files are published to the Confluence space **Hospital Workforce Digital Twin Documentation** by the provisioner.

## Security

No secrets are committed. `.env`, certificates and backups are git-ignored. PostgreSQL is not exposed outside the Docker network.
