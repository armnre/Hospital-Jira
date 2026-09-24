# HWDT Platform Validation Report (Phase 0 + Phase 1)

Run #6 · 2026-09-24T12:39:43.414Z · **28 passed, 0 failed, 4 blocked** (blocked = requires a Docker daemon, which the build sandbox does not have)

Environment: e2b.local · linux 6.1.158 · node v22.22.1 · docker not available · PostgreSQL 127.0.0.1:5432

| ID | Area | Test | Result | Details |
|---|---|---|---|---|
| DOC-01 | Docker | Compose file parses and declares all core services | PASS | 11 services: postgres, jira, confluence, nginx, backup, prometheus, cadvisor, node-exporter, backend, frontend, provisioner |
| DOC-02 | Docker | Every long-running service has a restart policy | PASS | All services use restart: unless-stopped |
| DOC-03 | Docker | Every long-running service has a health check | PASS | 10/10 services have health checks |
| DOC-04 | Docker | Stateful services use declared persistent volumes | PASS | Named volumes: postgres_data, jira_data, confluence_data, prometheus_data, nginx_logs |
| DOC-05 | Docker | .env.example defines every variable referenced by docker-compose.yml | PASS | 49 variables referenced, all defined in .env.example |
| DOC-06 | Docker | Containers start (docker compose up -d) | BLOCKED | Docker runtime is not available in this sandbox. This check runs on a Docker host via ./scripts/validate_environment.sh. |
| SCR-01 | Scripts | All shell scripts pass bash -n and Python provisioners compile | PASS | 15 files verified |
| DB-01 | Database | PostgreSQL accepts connections | PASS | PostgreSQL 15.16 (Debian 15.16-0+deb12u1) reachable at 127.0.0.1:5432 |
| DB-02 | Database | Init script creates jira_db, confluence_db, jira_user, confluence_user (idempotent) | PASS | Databases and roles present after two consecutive runs |
| DB-03 | Database | Ownership, encoding and collation match Atlassian requirements | PASS | jira_db: C collation/UTF8; confluence_db: UTF8 |
| DB-04 | Database | Credential isolation: each role can only access its own database | PASS | Least-privilege roles verified |
| P1-01 | Phase 1 | 02-init-hwdt-app.sh creates hwdt_db owned by least-privilege hwdt_app (idempotent) | PASS | hwdt_db owned by hwdt_app (NOSUPERUSER, NOCREATEDB); no access to jira_db |
| P1-02 | Phase 1 | Backend migrations + seed apply to hwdt_db as hwdt_app and are idempotent | PASS | 5 migrations, 8 tables, idempotent re-run (0 applied) |
| P1-03 | Phase 1 | Credential status rule: SQL compute_status() == TypeScript rules (-3…+65 days) | PASS | 138 boundary cases identical (60-day window, Rule 2 precedence) |
| P1-04 | Phase 1 | Compose runs backend + frontend with health checks; nginx routes hwdt.local | PASS | backend:4000 → postgres/hwdt_db, frontend:3000 → backend, hwdt.local vhost (/api/v1 → backend) |
| BAK-01 | Backup | backup_database.sh creates checksummed dumps of jira_db and confluence_db | PASS | Created jira_db/jira_db_20260924T123945Z.dump, confluence_db/confluence_db_20260924T123945Z.dump, hwdt_db/hwdt_db_20260924T123945Z.dump (+ .sha256, globals) |
| RST-01 | Restore | test_restore.sh restores into scratch DBs and row counts match | PASS | Scratch restore verified for jira_db, confluence_db and hwdt_db |
| RST-02 | Restore | Disaster-recovery drill: data loss in jira_db recovered from backup | PASS | 500/500 rows recovered; collation C and jira_user ownership preserved |
| JIR-01 | Jira | Project HWDT and the 8 required issue types are defined | PASS | HWDT — Hospital Workforce Digital Twin; 8 issue types |
| JIR-02 | Jira | The 7 required custom fields are defined with valid Jira types | PASS | All 7 custom fields defined |
| JIR-03 | Jira | Delivery and Bug workflows follow the required status sequence | PASS | Both workflows valid and rendered to OSWorkflow XML |
| JIR-04 | Jira | Epics EPIC-001 … EPIC-008 are defined | PASS | 8 epics defined |
| JIR-05 | Jira | Jira accessible (http://jira.local/status) | BLOCKED | Docker runtime is not available in this sandbox. This check runs on a Docker host via ./scripts/validate_environment.sh. |
| CNF-01 | Confluence | Space and the 8 documentation pages are defined and convert to storage format | PASS | Space HWDT: 12 pages converted (Phase 0 + Phase 1) |
| CNF-02 | Confluence | Confluence accessible (http://confluence.local/status) | BLOCKED | Docker runtime is not available in this sandbox. This check runs on a Docker host via ./scripts/validate_environment.sh. |
| NET-01 | Networking | Nginx routes jira.local / confluence.local to the correct internal service:port | PASS | Host-based routing table consistent with compose services |
| NET-02 | Networking | Security headers applied to every virtual host; SSL-ready | PASS | 4 security headers on 3 vhosts, TLS config staged |
| NET-03 | Networking | Live internal routing through Nginx (Host header → container) | BLOCKED | Docker runtime is not available in this sandbox. This check runs on a Docker host via ./scripts/validate_environment.sh. |
| MON-01 | Monitoring | Prometheus scrapes containers + host; alert rules cover status/CPU/memory/disk | PASS | 2 scrape jobs + 6 alert rules |
| MON-02 | Monitoring | Host metrics collection (CPU, memory, disk) in this environment | PASS | CPU, memory and disk metrics collected |
| GIT-01 | Version Control | Git repository with README, .gitignore, .env.example and deployment docs | PASS | 145 tracked files |
| GIT-02 | Version Control | No secrets inside the repository | PASS | 145 tracked files scanned; only change_me placeholders / ${VAR} references found |

## Errors found and fixes

| Error | Fix |
|---|---|
| `CREATE DATABASE confluence_db ... en_US.UTF-8` failed: locale missing on minimal hosts | Init script falls back to C.UTF-8 with a warning (the official postgres:15-bookworm image ships en_US.UTF-8) |
| Nginx would exit at boot when `jira`/`confluence` were not yet resolvable | Lazy DNS via `resolver 127.0.0.11` + variables; 503 page while upstream boots |
| Restored objects owned by the superuser | `pg_restore --no-owner --role=<app role>`; verified in RST-02 |
| **Found by the suite (run #2):** an in-place restore (`restore_database.sh latest:jira_db jira_db --force`) recreated jira_db with the server default collation `C.UTF-8` instead of Jira's required `C` (DB-03 failed) | `restore_database.sh` now captures encoding/collation of the existing target *before* dropping it (fallback: source DB, then per-application defaults); RST-02 now asserts collation `C` and table ownership after restore |
| Secret scanner false positive on empty `CONFLUENCE_LICENSE_KEY=` | Regex restricted to same-line values |

## Blocked checks — run on a Docker host

```bash
./scripts/setup.sh && ./scripts/validate_environment.sh
```
