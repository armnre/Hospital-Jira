# Technical Decisions

Architecture Decision Records (ADR) for Phase 0.

| ID | Decision | Status |
|---|---|---|
| ADR-001 | Docker Compose as the orchestration layer | Accepted |
| ADR-002 | Single PostgreSQL 15 instance, one database + role per application | Accepted |
| ADR-003 | Atlassian Data Center images with DB pre-configured through env vars | Accepted |
| ADR-004 | Nginx reverse proxy with host-based routing | Accepted |
| ADR-005 | pg_dump custom format + checksum + automated restore test | Accepted |
| ADR-006 | Prometheus + cAdvisor + node-exporter as monitoring foundation | Accepted |
| ADR-007 | Configuration-as-code for Jira and Confluence | Accepted |

## ADR-001 Docker Compose

**Context:** Phase 0 needs a reproducible environment on a single developer host.
**Decision:** Docker Compose v2 with pinned image versions, health checks, restart policies and named volumes.
**Consequences:** One-command start (`docker compose up -d`). Kubernetes/Helm can be introduced later without changing service contracts.

## ADR-002 PostgreSQL 15, isolated databases

**Decision:** One PostgreSQL 15 cluster; `jira_db` (UNICODE, collation C — Atlassian requirement) and `confluence_db` (UTF8, en_US.UTF-8). Each database is owned by a dedicated role; `CONNECT` is revoked from `PUBLIC`.
**Why 15:** supported by both Jira 10.3 LTS and Confluence 9.2 LTS.

## ADR-003 Atlassian DC images

**Decision:** Use `atlassian/jira-software` and `atlassian/confluence`. `ATL_JDBC_*` variables pre-write `dbconfig.xml` / `confluence.cfg.xml`, so the setup wizard skips the database step. `ATL_PROXY_*` variables make Tomcat aware of the reverse proxy.
**Consequence:** A licence (free trial or developer licence) is still required in the setup wizard — this is a vendor constraint that cannot be automated legally.

## ADR-004 Nginx

**Decision:** Host-based virtual hosts (`jira.local`, `confluence.local`, `monitoring.local`), lazy DNS resolution (`resolver 127.0.0.11`), security headers snippet, commented TLS server blocks, unknown hosts closed with `444`.

## ADR-005 Backups

**Decision:** `pg_dump --format=custom` per database, SHA-256 checksum, globals dump without passwords, 7-day retention, `.last_success` heartbeat for health checks, weekly automated restore test into a scratch database with row-count fingerprint comparison.

## ADR-006 Monitoring

**Decision:** Prometheus (15-day retention) scraping cAdvisor (containers) and node-exporter (host) with baseline alert rules. Grafana and Alertmanager are deferred to a later phase.

## ADR-007 Configuration-as-code

**Decision:** `jira/configuration/hwdt-project.json` and `confluence/configuration/space.json` are the single source of truth. An idempotent Python provisioner (standard library only) applies them via the REST APIs. Workflow XML is rendered from the same JSON.
