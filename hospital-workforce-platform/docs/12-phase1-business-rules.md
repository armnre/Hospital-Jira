# Phase 1 Business Rules

The rules are implemented **once in TypeScript** (`backend/src/modules/credentials/credential.rules.ts`, pure functions) and **once in SQL** (`credential.compute_status()`, used by the `v_credentials` view for querying and filtering). An automated test checks every day from −3 to +65, verified and unverified, and asserts that both implementations return the same status.

"Today" is the current date in **UTC** for both the database session (`timezone=UTC`) and the backend.

## Rule 1: Credential expiry calculation

| Condition | Result |
|---|---|
| `expiry_date > today + 60 days` | **VALID** |
| `today ≤ expiry_date ≤ today + 60 days` | **EXPIRING_SOON** |
| `expiry_date < today` | **EXPIRED** |
| no expiry date (lifetime credential) | **VALID** |

Boundaries: a credential expiring exactly 60 days from today is EXPIRING_SOON; one expiring 61 days from today is VALID. A credential that expires *today* is still EXPIRING_SOON and becomes EXPIRED tomorrow.

## Rule 2: Expired credentials are never valid

- EXPIRED takes precedence over everything, verified or not.
- Every credential in the API carries `isValid`. It is `true` only for **VALID** and **EXPIRING_SOON**, which are verified and not expired. EXPIRED and PENDING_VERIFICATION are `false`.
- An expired credential **cannot be verified** (`422 EXPIRED_CREDENTIAL_CANNOT_BE_VERIFIED`). The renewed credential must be recorded instead.
- The UI shows expired credentials with a red badge, a "Not valid for work" label and a red row tint, and hides the Verify action.

## Verification lifecycle

```text
 create ──► PENDING_VERIFICATION ──verify (ADMIN / COMPLIANCE_OFFICER)──► VALID | EXPIRING_SOON
                 ▲                                                            │
                 └─────────── material change (type, name, number, issuer, ────┘
                               dates, document) resets verification
 any state ──(expiry date passes)──► EXPIRED   (terminal for this record)
```

Full status algorithm:

1. If `expiry_date < today`, the status is **EXPIRED**.
2. Otherwise, if not verified, the status is **PENDING_VERIFICATION**.
3. Otherwise the status is the Rule 1 result: **EXPIRING_SOON** or **VALID**.

## Rule 3: Clinical vs non-clinical employees

- `employee_category` is **CLINICAL** or **NON_CLINICAL**.
- Professional credentials (`PROFESSIONAL_LICENSE`, `REGISTRATION`) can only be recorded for clinical employees (`422 PROFESSIONAL_CREDENTIAL_REQUIRES_CLINICAL`).
- Non-clinical employees *may* hold optional credentials (certifications, mandatory training) but do not need any.

## Employee compliance status

| Status | Condition (evaluated in order) |
|---|---|
| NON_COMPLIANT | any EXPIRED credential, **or** a clinical employee without a verified, non-expired professional licence or registration |
| AT_RISK | any EXPIRING_SOON or PENDING_VERIFICATION credential |
| NOT_REQUIRED | non-clinical employee with no credentials |
| COMPLIANT | otherwise |

The reasons are returned with the status, for example `"1 expired credential"` or `"No current verified professional licence or registration"`.

## Compliance windows

| Endpoint | Returns |
|---|---|
| `GET /credentials/expiring` | `within30Days` (0–30 days) and `within60Days` (0–60 days, superset), non-expired |
| `GET /credentials/expired` | all credentials with `expiry_date < today` |

## Data integrity rules

- Issue date cannot be in the future. The expiry date must be on or after the issue date (API check plus a DB `CHECK` constraint).
- Employee number format is `EMP-` followed by 4–10 digits. Number, email and national ID are unique among active employees.
- Deleting an employee is a soft delete. Credentials remain for audit, and every change is written to `platform.audit_log`.
- The stored `credentials.status` column is a snapshot refreshed on every write and every 6 hours. Reads **always** use the computed status.
