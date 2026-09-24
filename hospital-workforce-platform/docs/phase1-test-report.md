# Phase 1 Test Report

Generated 2026-09-24 12:38 UTC · node v22.22.1 · Linux · PostgreSQL integration database created and dropped per run

**Summary: 70 passed, 0 failed**

| Requirement | Covered by |
|---|---|
| Employee creation | api.integration › employee CRUD › creates an employee; rejects duplicates / invalid input |
| Employee update | api.integration › employee CRUD › updates an employee (partial PUT) |
| Credential creation | api.integration › credential management › creates a credential as PENDING_VERIFICATION |
| Expiry calculation | credential-rules › Rule 1 (8 boundary cases, leap year); api › 30/60-day buckets; SQL == TS boundary test |
| Expired credential detection | credential-rules › Rule 2; api › detects expired credentials and never marks them valid |
| Employee list rendering | components › Employee list (render, filters, debounced search) |
| Profile page | components › Employee profile page |
| Credential status display | components › Credential status display (4 statuses, expired row, days remaining) |
| Security (hashing, JWT expiry, RBAC, validation) | security.test.ts; api › authentication / RBAC |

## Backend (59/59 passed)

| Result | File | Group | Test | Time |
|---|---|---|---|---|
| PASS | `api.integration.test.ts` | database migrations | are recorded and idempotent | 7 ms |
| PASS | `api.integration.test.ts` | database migrations | seeded reference data | 10 ms |
| PASS | `api.integration.test.ts` | authentication | rejects bad credentials without revealing which part is wrong | 139 ms |
| PASS | `api.integration.test.ts` | authentication | requires a bearer token and validates it | 6 ms |
| PASS | `api.integration.test.ts` | authentication | returns the current user with permissions | 4 ms |
| PASS | `api.integration.test.ts` | employee CRUD | creates an employee | 21 ms |
| PASS | `api.integration.test.ts` | employee CRUD | rejects duplicates (409) and invalid input (422) | 9 ms |
| PASS | `api.integration.test.ts` | employee CRUD | updates an employee (partial PUT) | 11 ms |
| PASS | `api.integration.test.ts` | employee CRUD | lists with search and filters | 23 ms |
| PASS | `api.integration.test.ts` | employee CRUD | manages employee skills | 32 ms |
| PASS | `api.integration.test.ts` | employee CRUD | enforces RBAC | 8 ms |
| PASS | `api.integration.test.ts` | employee CRUD | soft-deletes an employee | 29 ms |
| PASS | `api.integration.test.ts` | credential management | creates a credential as PENDING_VERIFICATION | 8 ms |
| PASS | `api.integration.test.ts` | credential management | verification makes it VALID and records the verifier | 14 ms |
| PASS | `api.integration.test.ts` | credential management | changing a material field resets verification | 12 ms |
| PASS | `api.integration.test.ts` | credential management | detects expired credentials and never marks them valid | 17 ms |
| PASS | `api.integration.test.ts` | credential management | returns 30- and 60-day expiry buckets | 31 ms |
| PASS | `api.integration.test.ts` | credential management | enforces Rule 3 for non-clinical employees | 15 ms |
| PASS | `api.integration.test.ts` | credential management | lets an EMPLOYEE submit only their own credentials | 63 ms |
| PASS | `api.integration.test.ts` | credential management | deletes a credential and writes an audit trail | 12 ms |
| PASS | `api.integration.test.ts` | credential management | SQL status function and TypeScript rules agree on every boundary | 45 ms |
| PASS | `api.integration.test.ts` | credential management | dashboard summary is consistent with credential listings | 31 ms |
| PASS | `credential-rules.test.ts` | Rule 1 — expiry calculation | expiry today%+d days → 365 VALID | 1 ms |
| PASS | `credential-rules.test.ts` | Rule 1 — expiry calculation | expiry today%+d days → 61 VALID | 0 ms |
| PASS | `credential-rules.test.ts` | Rule 1 — expiry calculation | expiry today%+d days → 60 EXPIRING_SOON | 0 ms |
| PASS | `credential-rules.test.ts` | Rule 1 — expiry calculation | expiry today%+d days → 30 EXPIRING_SOON | 0 ms |
| PASS | `credential-rules.test.ts` | Rule 1 — expiry calculation | expiry today%+d days → 1 EXPIRING_SOON | 0 ms |
| PASS | `credential-rules.test.ts` | Rule 1 — expiry calculation | expiry today%+d days → 0 EXPIRING_SOON | 0 ms |
| PASS | `credential-rules.test.ts` | Rule 1 — expiry calculation | expiry today%+d days → -1 EXPIRED | 0 ms |
| PASS | `credential-rules.test.ts` | Rule 1 — expiry calculation | expiry today%+d days → -400 EXPIRED | 0 ms |
| PASS | `credential-rules.test.ts` | Rule 1 — expiry calculation | treats credentials without an expiry date as VALID | 0 ms |
| PASS | `credential-rules.test.ts` | Rule 1 — expiry calculation | handles month and leap-year boundaries | 0 ms |
| PASS | `credential-rules.test.ts` | Rule 1 — expiry calculation | computes days until expiry | 0 ms |
| PASS | `credential-rules.test.ts` | Rule 2 — expired credentials are never valid | EXPIRED overrides verification | 0 ms |
| PASS | `credential-rules.test.ts` | Rule 2 — expired credentials are never valid | unverified, non-expired credentials are PENDING_VERIFICATION | 0 ms |
| PASS | `credential-rules.test.ts` | Rule 2 — expired credentials are never valid | verified credentials follow Rule 1 | 0 ms |
| PASS | `credential-rules.test.ts` | Rule 2 — expired credentials are never valid | isCredentialValid is false for EXPIRED and PENDING | 0 ms |
| PASS | `credential-rules.test.ts` | Rule 2 — expired credentials are never valid | an expired credential cannot be verified | 0 ms |
| PASS | `credential-rules.test.ts` | Rule 3 — professional credentials for clinical employees | rejects professional licences for non-clinical employees | 0 ms |
| PASS | `credential-rules.test.ts` | Rule 3 — professional credentials for clinical employees | allows optional certifications/training for non-clinical employees | 0 ms |
| PASS | `credential-rules.test.ts` | employee compliance evaluation | non-clinical without credentials → NOT_REQUIRED | 0 ms |
| PASS | `credential-rules.test.ts` | employee compliance evaluation | clinical without an active licence → NON_COMPLIANT | 0 ms |
| PASS | `credential-rules.test.ts` | employee compliance evaluation | any expired credential → NON_COMPLIANT | 0 ms |
| PASS | `credential-rules.test.ts` | employee compliance evaluation | expiring or pending → AT_RISK | 0 ms |
| PASS | `credential-rules.test.ts` | employee compliance evaluation | clinical with active licence → COMPLIANT | 0 ms |
| PASS | `credential-rules.test.ts` | date validation | validates calendar dates | 0 ms |
| PASS | `credential-rules.test.ts` | date validation | rejects future issue dates and expiry before issue | 0 ms |
| PASS | `security.test.ts` | password hashing (scrypt) | hashes with a random salt and verifies | 193 ms |
| PASS | `security.test.ts` | password hashing (scrypt) | enforces the password policy | 3 ms |
| PASS | `security.test.ts` | JWT | round-trips claims | 7 ms |
| PASS | `security.test.ts` | JWT | rejects expired tokens with TOKEN_EXPIRED | 1 ms |
| PASS | `security.test.ts` | JWT | rejects tampered tokens, wrong secret and wrong audience | 1 ms |
| PASS | `security.test.ts` | JWT | rejects the 'none' algorithm | 0 ms |
| PASS | `security.test.ts` | role-based access preparation | defines the four Phase 1 roles | 0 ms |
| PASS | `security.test.ts` | role-based access preparation | maps permissions to roles | 0 ms |
| PASS | `security.test.ts` | input validation | normalises valid employee input and applies defaults | 4 ms |
| PASS | `security.test.ts` | input validation | rejects invalid values with field-level details | 2 ms |
| PASS | `security.test.ts` | input validation | partial update does not inject defaults | 2 ms |
| PASS | `security.test.ts` | input validation | rejects script injection in credential fields and invalid dates | 1 ms |

## Frontend (11/11 passed)

| Result | File | Group | Test | Time |
|---|---|---|---|---|
| PASS | `components.test.tsx` | Employee list | renders employees returned by the API | 81 ms |
| PASS | `components.test.tsx` | Employee list | filters by department, role and category via the API | 61 ms |
| PASS | `components.test.tsx` | Employee list | debounces free-text search | 74 ms |
| PASS | `components.test.tsx` | Employee profile page | shows personal information, department, role, skills and credentials | 197 ms |
| PASS | `components.test.tsx` | Employee profile page | explains that non-clinical staff do not require credentials | 33 ms |
| PASS | `components.test.tsx` | Credential status display | VALID renders as 'Valid' | 4 ms |
| PASS | `components.test.tsx` | Credential status display | EXPIRING_SOON renders as 'Expiring soon' | 3 ms |
| PASS | `components.test.tsx` | Credential status display | EXPIRED renders as 'Expired' | 2 ms |
| PASS | `components.test.tsx` | Credential status display | PENDING_VERIFICATION renders as 'Pending verification' | 3 ms |
| PASS | `components.test.tsx` | Credential status display | flags expired credentials as not valid and hides the Verify action | 20 ms |
| PASS | `components.test.tsx` | Credential status display | shows days remaining for expiring credentials | 3 ms |

