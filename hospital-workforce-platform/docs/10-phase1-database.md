# Phase 1 Database Documentation

Database `hwdt_db` (owner `hwdt_app`, created by `postgres/init/02-init-hwdt-app.sh`). The schema is created by versioned migrations in `database/migrations`, which the backend applies at start-up. They are recorded in `platform.schema_migrations` with a SHA-256 checksum and protected by an advisory lock.

| Migration | Content |
|---|---|
| 001_platform_schemas.sql | schemas `platform`, `iam`, `workforce`, `credential`; `platform.audit_log`; `touch_updated_at()` trigger |
| 002_iam_users.sql | `iam.users` (roles ADMIN, HR_MANAGER, COMPLIANCE_OFFICER, EMPLOYEE) |
| 003_workforce_core.sql | `departments`, `employees`, `skills`, `employee_skills` |
| 004_credentials.sql | `credential.credentials`, `credential.compute_status()`, views `v_credentials`, `v_employee_compliance` |
| 005_reference_data.sql | departments (ICU, Emergency, Surgery, Pediatrics, NICU, Administration…) and skills (ACLS, BLS, Dialysis, NICU Care…) |

Demo data (`database/seeds/001_demo_workforce.sql`) contains 24 synthetic employees and 31 credentials. Its dates are relative to `CURRENT_DATE`. It is applied only when `HWDT_SEED_DEMO=true` and the employees table is empty.

## Entity-relationship diagram

```text
 workforce.departments 1 ──────< workforce.employees >────── 1 iam.users (optional, EMPLOYEE self-service)
   id (identity)                   id (uuid)                    id (uuid)
   name (unique, ci)               employee_number (EMP-…)      email (unique, ci)
   description                     first_name, last_name        password_hash (scrypt)
                                   national_id                  role
                                   email, phone                 employee_id → employees
                                   department_id → departments
                                   job_title (Role)
                                   employment_type
                                   employee_category (CLINICAL | NON_CLINICAL)
                                   status, hire_date, deleted_at
                                   created_at, updated_at
                                        │1                   │1
                                        │                    │
                                        ∧                    ∧
                      workforce.employee_skills        credential.credentials
                        employee_id → employees          id (uuid)
                        skill_id    → skills             employee_id → employees
                        level                            credential_type, credential_name, credential_number
                        years_experience                 issuer, issue_date, expiry_date
                                        ∨                status (stored snapshot)
                                        │1               document_reference
                          workforce.skills               verified_by → iam.users, verified_at
                            id, name, category           created_at, updated_at
```

## Tables

### workforce.employees

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| employee_number | varchar(20) | `^EMP-[0-9]{4,10}$`, unique among non-deleted |
| first_name, last_name | varchar(100) | required |
| national_id | varchar(30) | unique among non-deleted; masked in API for non-HR roles |
| email | varchar(255) | unique (case-insensitive) among non-deleted |
| phone | varchar(30) | optional |
| department_id | int FK → departments | `ON DELETE RESTRICT` |
| job_title | varchar(120) | the "Role" filter |
| employment_type | varchar(20) | FULL_TIME, PART_TIME, CONTRACT, LOCUM, INTERN |
| employee_category | varchar(20) | **CLINICAL, NON_CLINICAL** |
| status | varchar(20) | ACTIVE, ON_LEAVE, SUSPENDED, TERMINATED |
| hire_date | date | optional |
| deleted_at | timestamptz | soft delete |
| created_at, updated_at | timestamptz | `updated_at` maintained by trigger |

### workforce.departments · workforce.skills · workforce.employee_skills

| Table | Columns | Notes |
|---|---|---|
| departments | id, name, description, created_at | name unique (ci) |
| skills | id, name, category, created_at | name unique (ci) |
| employee_skills | employee_id, skill_id, level, years_experience | PK (employee_id, skill_id); level BEGINNER…EXPERT; years 0–60 |

### credential.credentials

| Column | Type | Rules |
|---|---|---|
| id | uuid PK | |
| employee_id | uuid FK → employees | cascade |
| credential_type | varchar(30) | PROFESSIONAL_LICENSE, REGISTRATION, CERTIFICATION, TRAINING, OTHER |
| credential_name, issuer | varchar(200) | required |
| credential_number | varchar(100) | licence number |
| issue_date | date | required, not in the future (API) |
| expiry_date | date | NULL = does not expire; `>= issue_date` (CHECK) |
| status | varchar(25) | VALID, EXPIRING_SOON, EXPIRED, PENDING_VERIFICATION (stored snapshot, refreshed every 6 h) |
| document_reference | varchar(500) | DMS link |
| verified_by | uuid FK → iam.users | set null on user delete |
| verified_at | timestamptz | |
| created_at, updated_at | timestamptz | |

### Views and functions

| Object | Purpose |
|---|---|
| `credential.compute_status(expiry, verified_at, today)` | SQL implementation of the status rule (see *Business Rules*) |
| `credential.v_credentials` | credentials + `computed_status` + `days_until_expiry`, always evaluated against `CURRENT_DATE` (UTC) |
| `workforce.v_employee_compliance` | per-employee counts of valid, expiring, expired and pending credentials, and active licences |
| `platform.audit_log` | append-only log of every create, update, delete and verify action (actor, entity, changed fields; no national IDs) |

## Indexes

Partial unique indexes on employee number, email and national ID (`WHERE deleted_at IS NULL`). Indexes also cover department, category, name, `credentials(employee_id)`, `credentials(expiry_date)`, `employee_skills(skill_id)` and `audit_log(entity_type, entity_id)`.

## Backup

`hwdt_db` is part of `BACKUP_DATABASES` in the Phase 0 backup service. It is dumped daily with a SHA-256 checksum and included in the weekly restore test.
