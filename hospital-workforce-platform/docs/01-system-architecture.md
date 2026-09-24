# System Architecture

> Phase 0 delivers the technical foundation only. No business modules (Employee, Credential, Shift, AI) are implemented yet.

## 1. Overview

The Hospital Workforce Digital Twin (HWDT) Phase 0 environment is a fully containerised, single-host stack orchestrated by Docker Compose. It provides project management (Jira), documentation (Confluence), a shared database layer (PostgreSQL), a reverse proxy (Nginx), automated backups and a monitoring foundation.

## 2. Deployment diagram

```text
                        Developer workstation / browser
                 http://jira.local  http://confluence.local  http://monitoring.local
                                        |
                                   :80 / :443
+---------------------------------------|-------------------------------------------+
| Docker Compose project "hwdt"         |                                           |
|                                       v                                           |
|   [hwdt_frontend]            +------------------+                                 |
|                              |  nginx (proxy)   |  security headers, 444 default  |
|                              +------------------+                                 |
|   [hwdt_backend]        jira:8080 |      | confluence:8090   | prometheus:9090   |
|                                   v      v                   v                   |
|                     +-----------+  +-------------+   +-------------+             |
|                     |   jira    |  | confluence  |   | prometheus  |<-- cadvisor  |
|                     +-----------+  +-------------+   +-------------+<-- node-exp  |
|                          | JDBC          | JDBC                                   |
|                          v               v                                        |
|                     +-----------------------------+      +----------------+       |
|                     | postgres 15                 |<-----| backup service |       |
|                     |  jira_db  / confluence_db   |  pg_dump (daily)     |       |
|                     +-----------------------------+      +----------------+       |
|                                                               |                   |
|  Volumes: hwdt_postgres_data, hwdt_jira_data, hwdt_confluence_data,               |
|           hwdt_prometheus_data, hwdt_nginx_logs     Bind: ./postgres/backups      |
+-----------------------------------------------------------------------------------+
```

## 3. Components

| Component | Image | Purpose | Internal port | Persistence |
|---|---|---|---|---|
| postgres | postgres:15-bookworm | jira_db + confluence_db | 5432 | hwdt_postgres_data |
| jira | atlassian/jira-software:10.3 | Project & issue management | 8080 | hwdt_jira_data |
| confluence | atlassian/confluence:9.2 | Documentation | 8090 / 8091 | hwdt_confluence_data |
| nginx | nginx:1.27-alpine | Reverse proxy, TLS termination point | 80 / 443 (published) | hwdt_nginx_logs |
| backup | postgres:15-bookworm | Scheduled pg_dump + retention + weekly restore test | none | ./postgres/backups |
| prometheus | prom/prometheus:v2.54.1 | Metrics store + alert rules | 9090 | hwdt_prometheus_data |
| cadvisor | gcr.io/cadvisor/cadvisor:v0.49.1 | Container CPU / memory / status | 8080 | none |
| node-exporter | prom/node-exporter:v1.8.2 | Host CPU / memory / disk | 9100 | none |
| provisioner (profile) | python:3.12-alpine | Jira + Confluence configuration-as-code | none | none |

## 4. Data flow

1. The browser resolves `*.local` to 127.0.0.1 and calls Nginx on port 80.
2. Nginx selects the virtual host by `Host` header and proxies to `jira:8080`, `confluence:8090` or `prometheus:9090` over the internal `hwdt_backend` network using Docker DNS (lazy resolution).
3. Jira and Confluence persist data via JDBC to their own database with their own least-privilege role (`jira_user`, `confluence_user`). Cross-database access is revoked.
4. The backup service connects as the PostgreSQL superuser, writes compressed custom-format dumps + SHA-256 checksums to `./postgres/backups`, applies retention and records the last success timestamp.
5. cAdvisor and node-exporter expose metrics; Prometheus scrapes them every 15 s and evaluates alert rules (container down, CPU, memory, disk).

## 5. Networks

- `hwdt_frontend` — only Nginx; the only network with published ports.
- `hwdt_backend` — all services; PostgreSQL is **not** published to the host.

## 6. Extensibility for future phases

- New business services (Employee Profile API, Credential service, Matching engine) join `hwdt_backend` and get their own database + role via a new init script `postgres/init/02-*.sh`.
- New public endpoints = one new file in `nginx/config/conf.d/`.
- New metrics targets = one new job in `monitoring/prometheus/prometheus.yml`.
