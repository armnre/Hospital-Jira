# Phase 1 Architecture

> Phase 1 covers the Employee Digital Twin and the Credential Management core. It is built on the Phase 0 foundation (PostgreSQL, Nginx, backups, monitoring, Jira, Confluence). Shift management, the matching engine and AI are **not** in scope.

## 1. Component diagram

```text
                   Browser (HR manager · Compliance officer · Employee)
                                   │  http://hwdt.local
                                   ▼
                     ┌──────────────────────────────┐
                     │ nginx (Phase 0)               │  security headers, login rate limit
                     └───────┬──────────────┬───────┘
                   /*        │              │  /api/v1/*
                             ▼              ▼
 ┌────────────────────────────────┐   ┌──────────────────────────────────────────────┐
 │ frontend (React + TypeScript)  │   │ backend (Node.js 22 + Express 5 + TypeScript) │
 │ Next.js App Router, port 3000  │──▶│ port 4000 · /api/v1                            │
 │  views/  Login · Dashboard     │   │  modules/                                      │
 │          Employees · Profile   │   │   auth        JWT, scrypt, RBAC permissions    │
 │          Credentials · Ref data│   │   employees   CRUD, skills, search             │
 │  lib/api.ts  (Bearer JWT)      │   │   credentials CRUD, verify, expiry rules       │
 │  lib/auth.tsx (session, expiry)│   │   reference   departments, skills              │
 └────────────────────────────────┘   │   compliance  dashboard summary                │
                                      │  db/migrate   versioned SQL migrations         │
                                      └───────────────────────┬──────────────────────┘
                                                              │ pg (pool, UTC)
                                                              ▼
                                      ┌──────────────────────────────────────────────┐
                                      │ PostgreSQL 15 (Phase 0) · database hwdt_db    │
                                      │  schemas: platform · iam · workforce · credential │
                                      └──────────────────────────────────────────────┘
                                       ▲ backup service dumps hwdt_db daily (Phase 0)
```

## 2. Layering inside the backend

| Layer | Responsibility | Example |
|---|---|---|
| Routes | HTTP, authorisation (`authorize(permission)`), input parsing (zod) | `employee.routes.ts` |
| Service | Use cases, business rules, transactions, audit | `credential.service.ts` |
| Rules | Pure domain functions (no I/O), unit-tested | `credential.rules.ts` |
| Repository | SQL only (parameterised queries) | `credential.repository.ts` |
| DB | Pool, transactions, migrations | `db/pool.ts`, `db/migrate.ts` |

Each module depends only on `common/`, `auth/` and its own files. Modules share no tables across schemas, apart from read-only joins. That makes it possible to extract a module into a microservice (own database, own deployment) later without changing the other modules.

## 3. API structure

```text
/api/v1
├── health                         GET   (public)
├── auth/login                     POST  (public, rate limited)
├── auth/me                        GET
├── auth/demo-accounts             GET   (public; sandbox only)
├── employees                      GET  POST
│   ├── job-titles                 GET
│   └── {id}                       GET  PUT  DELETE
│       ├── skills                 POST
│       │   └── {skillId}          DELETE
│       └── credentials            GET  POST
├── credentials                    GET
│   ├── expiring                   GET   (30 / 60 day buckets)
│   ├── expired                    GET
│   └── {id}                       PUT  DELETE
│       └── verify                 POST
├── departments                    GET  POST   · {id} PUT DELETE
├── skills                         GET  POST   · {id} PUT DELETE · {id}/employees GET
└── dashboard/summary              GET
```

## 4. Request flow

1. The user signs in. `POST /auth/login` returns an HS256 JWT (1 h expiry by default) plus a permission list.
2. The frontend keeps the session in `sessionStorage`, signs out automatically at `exp`, and sends `Authorization: Bearer`.
3. The backend `authenticate` middleware verifies signature, issuer, audience and expiry. `authorize()` then checks the permission.
4. The service applies business rules, writes inside a transaction, and appends an audit record to `platform.audit_log`.
5. Reads go through `credential.v_credentials`, so the credential status is always evaluated against *today*.

## 5. Deployment topology

| Environment | Frontend | Backend | Database |
|---|---|---|---|
| Docker (`docker compose up -d`) | `frontend` container :3000 | `backend` container :4000 (runs migrations on start) | `postgres` container, `hwdt_db` / `hwdt_app` |
| Sandbox preview | Next.js app (same React views) | Same Express app started in-process on 127.0.0.1:4100, proxied at `/api/v1` | Local PostgreSQL, same migrations |

## 6. Prepared for future phases

- **Shift Management:** `workforce.employees.id` (UUID) and `departments` are the planned foreign keys. The status and employment type are already modelled.
- **Matching engine:** `employee_skills` (level, years) plus `credential.v_credentials.computed_status` give a competency signal. `isValid` makes Rule 2 explicit for any consumer.
- **AI layer:** `platform.audit_log` provides a history of changes. Every schema can be exported separately.
- **Microservices:** one module maps to one schema, with dependency injection through `Deps`, and the API is versioned under `/api/v1`.
