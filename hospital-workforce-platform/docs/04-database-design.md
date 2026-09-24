# Database Design

## Phase 0 scope

Phase 0 provisions the database **infrastructure** only. Business schemas (employee, credential, shift, matching) are designed in later phases.

## Cluster

| Property | Value |
|---|---|
| Engine | PostgreSQL 15 (postgres:15-bookworm) |
| Initialisation | `postgres/init/01-init-databases.sh` (idempotent) |
| Config | `postgres/config/postgresql.conf` |
| Authentication | scram-sha-256 |
| Exposure | internal network only (no published port) |
| Data volume | `hwdt_postgres_data` |

## Databases and roles

| Database | Owner role | Encoding | Collation | Used by |
|---|---|---|---|---|
| jira_db | jira_user | UNICODE | C | Jira |
| confluence_db | confluence_user | UTF8 | en_US.UTF-8 (fallback C.UTF-8) | Confluence |

Privileges:

- `REVOKE ALL ON DATABASE ... FROM PUBLIC` — roles cannot connect to each other's database.
- Each owner receives `CONNECT, TEMPORARY, CREATE` on its own database and owns the `public` schema.
- Application roles are `NOSUPERUSER NOCREATEDB NOCREATEROLE`.
- The superuser (`POSTGRES_SUPERUSER`) is used only for initialisation and backups.

## Naming conventions for future schemas

- One schema per bounded context: `employee`, `credential`, `shift`, `matching`, `reporting`.
- Tables: `snake_case`, plural (`employees`, `licenses`).
- Primary keys: `id uuid default gen_random_uuid()`.
- Audit columns on every table: `created_at`, `created_by`, `updated_at`, `updated_by`.
- Soft delete via `deleted_at` where regulatory retention applies.

## Adding a new service database

Create `postgres/init/02-<service>.sh` reusing the `ensure_role` / `create_database` pattern and add the database to `BACKUP_DATABASES`.
