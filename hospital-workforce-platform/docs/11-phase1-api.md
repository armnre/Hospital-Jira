# Phase 1 API Documentation

Base URL: `http://hwdt.local/api/v1` (Docker) or `/api/v1` (sandbox preview). The API speaks JSON only. Every endpoint except `health`, `auth/login` and `auth/demo-accounts` requires `Authorization: Bearer <JWT>`.

## Conventions

| Topic | Convention |
|---|---|
| Errors | `{"error": {"code": "VALIDATION_ERROR", "message": "…", "details": [{"field": "email", "message": "Enter a valid email"}]}}` |
| Status codes | 200 OK · 201 Created (+ `Location`) · 204 No Content · 401 missing/invalid/expired token · 403 missing permission · 404 not found · 409 conflict (duplicate, in use) · 422 validation / business rule · 429 rate limited |
| Dates | ISO `YYYY-MM-DD`, evaluated in UTC |
| IDs | employees/credentials: UUID; departments/skills: integer |
| PUT | accepts a full or partial representation; only supplied fields change |

## Permissions

| Permission | ADMIN | HR_MANAGER | COMPLIANCE_OFFICER | EMPLOYEE |
|---|---|---|---|---|
| employees:read | ✓ | ✓ | ✓ | own record only |
| employees:write / delete | ✓ | ✓ | | |
| credentials:read / write | ✓ | ✓ | ✓ | read own, submit own |
| credentials:verify / delete | ✓ | | ✓ | |
| reference:write | ✓ | ✓ | | |
| compliance:read (dashboard, expiring, expired) | ✓ | ✓ | ✓ | |

## Authentication

### POST /auth/login

```json
{ "email": "hr.manager@hwdt.local", "password": "••••••••" }
```

Response `200`:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "expiresAt": "2026-09-24T13:34:37.000Z",
  "user": { "id": "3f0c…", "email": "hr.manager@hwdt.local", "name": "Olivia Brown", "role": "HR_MANAGER",
            "employeeId": "a41e…", "permissions": ["employees:read", "employees:write", "…"] }
}
```

Invalid credentials: `401 INVALID_CREDENTIALS`, with the same message for an unknown email or a wrong password. Expired token: `401 TOKEN_EXPIRED`.

### GET /auth/me

Returns the token's user and permissions.

## Employees

### GET /employees

Query: `search`, `departmentId`, `jobTitle` (role), `category` (CLINICAL | NON_CLINICAL), `status`, `page` (1), `pageSize` (20, max 100), `sort` (name | employeeNumber | department | jobTitle | createdAt), `order`.

```http
GET /api/v1/employees?category=CLINICAL&departmentId=1&pageSize=2
```

```json
{
  "data": [{
    "id": "8d7e…", "employeeNumber": "EMP-001001", "firstName": "Amira", "lastName": "Haddad", "fullName": "Amira Haddad",
    "nationalId": "NID-784512001", "email": "amira.haddad@hwdt.local", "phone": "+1-555-0101",
    "department": { "id": 1, "name": "ICU" }, "jobTitle": "Critical Care Nurse",
    "employmentType": "FULL_TIME", "employeeCategory": "CLINICAL", "status": "ACTIVE", "hireDate": "2018-10-16",
    "credentialSummary": { "total": 2, "valid": 1, "expiring": 1, "expired": 0, "pending": 0, "activeLicenses": 1 },
    "compliance": { "status": "AT_RISK", "reasons": ["1 credential expiring within 60 days"] }
  }],
  "total": 3, "page": 1, "pageSize": 2, "totalPages": 2
}
```

`nationalId` is masked (`••••••2001`) for roles without `employees:view-sensitive`.

### GET /employees/{id}

Returns the list shape plus `skills[]` and `credentials[]`.

### POST /employees

```json
{
  "employeeNumber": "EMP-002001", "firstName": "Nadia", "lastName": "Karim", "nationalId": "NID-999000111",
  "email": "nadia.karim@hwdt.local", "phone": "+1-555-0199", "departmentId": 1, "jobTitle": "ICU Nurse",
  "employmentType": "FULL_TIME", "employeeCategory": "CLINICAL", "status": "ACTIVE", "hireDate": "2026-09-01"
}
```

Response `201` with the employee detail and a `Location` header. Duplicate number, email or national ID returns `409 CONFLICT`. Invalid fields return `422 VALIDATION_ERROR` with `details`.

### PUT /employees/{id}

```json
{ "jobTitle": "Senior ICU Nurse", "status": "ON_LEAVE" }
```

Response `200` with the updated detail.

### DELETE /employees/{id}

Response `204`. This is a soft delete: `deleted_at` is set and the status becomes TERMINATED. The record is kept for audit.

### POST /employees/{id}/skills · DELETE /employees/{id}/skills/{skillId}

```json
{ "skillId": 1, "level": "ADVANCED", "yearsExperience": 4.5 }
```

## Credentials

### GET /employees/{id}/credentials

```json
{ "count": 1, "data": [ {
  "id": "c9a2…",
  "employee": { "id": "8d7e…", "employeeNumber": "EMP-001001", "fullName": "Amira Haddad", "category": "CLINICAL", "department": { "id": 1, "name": "ICU" } },
  "credentialType": "PROFESSIONAL_LICENSE", "credentialName": "Registered Nurse License", "credentialNumber": "RN-448812",
  "issuer": "State Board of Nursing", "issueDate": "2024-10-25", "expiryDate": "2027-10-24",
  "status": "VALID", "isValid": true, "daysUntilExpiry": 395,
  "documentReference": "dms://credentials/EMP-001001/registered-nurse-license.pdf",
  "verifiedBy": { "id": "…", "name": "Compliance Officer", "email": "compliance@hwdt.local" }, "verifiedAt": "2026-08-25T12:00:00.000Z"
} ] }
```

### POST /employees/{id}/credentials

```json
{
  "credentialType": "PROFESSIONAL_LICENSE", "credentialName": "Registered Nurse License", "credentialNumber": "RN-551203",
  "issuer": "State Board of Nursing", "issueDate": "2025-01-01", "expiryDate": "2027-01-01",
  "documentReference": "dms://credentials/EMP-002001/rn.pdf"
}
```

Response `201`. New credentials always start as `PENDING_VERIFICATION`, unless they are already `EXPIRED`.
- A non-clinical employee with a professional type gets `422 PROFESSIONAL_CREDENTIAL_REQUIRES_CLINICAL`.
- An issue date in the future gets `422 ISSUE_DATE_IN_FUTURE`.
- An expiry date before the issue date gets `422 EXPIRY_BEFORE_ISSUE`.

### PUT /credentials/{id}

Partial update. Changing a material field (type, name, number, issuer, dates or document) **resets verification**.

### POST /credentials/{id}/verify

Available to ADMIN and COMPLIANCE_OFFICER. Response `200` with the updated credential (`status` recomputed; `verifiedBy`/`verifiedAt` set). An expired credential gets `422 EXPIRED_CREDENTIAL_CANNOT_BE_VERIFIED`.

### DELETE /credentials/{id}

Response `204`.

### GET /credentials

Query: `status`, `type`, `departmentId`, `search`, `limit` (200, max 500).

## Compliance

### GET /credentials/expiring

```json
{
  "asOf": "2026-09-24",
  "within30Days": { "days": 30, "count": 4, "data": [ { "credentialName": "ACLS Provider", "daysUntilExpiry": 9, "status": "EXPIRING_SOON", "…": "…" } ] },
  "within60Days": { "days": 60, "count": 6, "data": [ "…" ] }
}
```

`within60Days` is a superset of `within30Days` (0 ≤ days ≤ 60, not expired).

### GET /credentials/expired

```json
{ "asOf": "2026-09-24", "count": 6, "data": [ { "credentialName": "Certified Dialysis Nurse", "daysUntilExpiry": -3, "status": "EXPIRED", "isValid": false, "…": "…" } ] }
```

### GET /dashboard/summary

```json
{
  "asOf": "2026-09-24",
  "employees": { "total": 24, "clinical": 19, "nonClinical": 5, "active": 22 },
  "credentials": { "total": 31, "active": 22, "valid": 16, "expiringSoon": 6, "expiring30": 4, "expiring60": 6, "expired": 6, "pendingVerification": 3 },
  "compliance": { "COMPLIANT": 7, "AT_RISK": 6, "NON_COMPLIANT": 9, "NOT_REQUIRED": 2 },
  "departments": [ { "id": 2, "name": "Emergency", "headcount": 4, "clinical": 4, "expiring": 1, "expired": 2 } ],
  "upcomingExpiries": [ "…credential…" ],
  "nonCompliantEmployees": [ { "fullName": "Sofia Marquez", "department": "Emergency", "reasons": ["1 expired credential"] } ]
}
```

## Reference data

| Endpoint | Body |
|---|---|
| `GET /departments` | returns `id, name, description, headcount, clinicalCount` |
| `POST /departments`, `PUT /departments/{id}` | `{ "name": "Oncology", "description": "Cancer care" }` |
| `DELETE /departments/{id}` | `409 DEPARTMENT_IN_USE` if employees are assigned |
| `GET /skills` | returns `id, name, category, employeeCount` |
| `POST /skills`, `PUT /skills/{id}` | `{ "name": "ECMO", "category": "Critical Care" }` |
| `GET /skills/{id}/employees` | employees holding the skill, ordered by level then years: `{ skill, count, data: [{ employeeId, fullName, department, level, yearsExperience }] }` (the lookup Phase 2 matching will build on) |

## curl walkthrough

```bash
B=http://hwdt.local/api/v1
T=$(curl -s -X POST $B/auth/login -H 'content-type: application/json' \
      -d '{"email":"compliance@hwdt.local","password":"<password>"}' | jq -r .accessToken)
curl -s "$B/credentials/expiring" -H "authorization: Bearer $T" | jq '.within30Days.count'
curl -s -X POST "$B/credentials/<id>/verify" -H "authorization: Bearer $T" | jq '.status'
```
