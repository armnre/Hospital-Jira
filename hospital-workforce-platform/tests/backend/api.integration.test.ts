/**
 * HWDT-18 — API integration tests: real Express app + real PostgreSQL (throwaway database).
 * Covers employee CRUD, credential CRUD, verification, expiry detection, RBAC and migrations.
 */
import "dotenv/config";
import { Client, type Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../backend/src/app";
import { bootstrap } from "../../backend/src/bootstrap";
import { loadConfig, type Config } from "../../backend/src/config/env";
import { addDays, todayUtc } from "../../backend/src/common/dates";
import { createPool } from "../../backend/src/db/pool";
import { computeCredentialStatus } from "../../backend/src/modules/credentials/credential.rules";

const adminUrl = new URL(process.env.HWDT_TEST_ADMIN_URL ?? process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/postgres");
const dbName = `hwdt_test_${process.pid}`;
const testUrl = new URL(adminUrl.toString());
testUrl.pathname = `/${dbName}`;

let pool: Pool;
let config: Config;
let app: ReturnType<typeof createApp>;
const tokens: Record<string, string> = {};
const demo = "Hwdt!Demo2026";
const today = todayUtc();

async function admin(sql: string) {
  const c = new Client({ connectionString: adminUrl.toString() });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}
const auth = (role: string) => ({ Authorization: `Bearer ${tokens[role]}` });

const employeeBody = (n: string, overrides: Record<string, unknown> = {}) => ({
  employeeNumber: `EMP-9${n}`, firstName: "Test", lastName: `Employee${n.replace(/\d/g, (d) => "ABCDEFGHIJ"[Number(d)])}`, nationalId: `NID-T${n}`, email: `test${n}@hwdt.local`,
  phone: "+1-555-0000", departmentId: 1, jobTitle: "Staff Nurse", employmentType: "FULL_TIME", employeeCategory: "CLINICAL", ...overrides,
});
const credentialBody = (overrides: Record<string, unknown> = {}) => ({
  credentialType: "PROFESSIONAL_LICENSE", credentialName: "Registered Nurse License", credentialNumber: "RN-1", issuer: "State Board",
  issueDate: addDays(today, -300), expiryDate: addDays(today, 400), ...overrides,
});

beforeAll(async () => {
  await admin(`DROP DATABASE IF EXISTS ${dbName}`);
  await admin(`CREATE DATABASE ${dbName}`);
  config = { ...loadConfig({ NODE_ENV: "test", HWDT_DATABASE_URL: testUrl.toString(), JWT_SECRET: "integration-secret-integration-secret-01", HWDT_SEED_DEMO: "true" }), seedDemo: true };
  pool = createPool(config);
  await pool.query("SELECT 1");
  // bootstrap with seeds disabled for deterministic data, but demo users enabled
  await bootstrap(pool, { ...config, seedDemo: false }, () => undefined);
  const { ensureSeedUsers } = await import("../../backend/src/modules/auth/auth.service");
  await ensureSeedUsers(pool, config, () => undefined);
  app = createApp({ pool, config });
  for (const [role, email] of Object.entries({ admin: "admin@hwdt.local", hr: "hr.manager@hwdt.local", compliance: "compliance@hwdt.local", employee: "amira.haddad@hwdt.local" })) {
    const r = await request(app).post("/api/v1/auth/login").send({ email, password: demo });
    expect(r.status).toBe(200);
    tokens[role] = r.body.accessToken;
  }
});

afterAll(async () => {
  await pool?.end();
  await admin(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
});

describe("database migrations", () => {
  it("are recorded and idempotent", async () => {
    const { rows } = await pool.query("SELECT version FROM platform.schema_migrations ORDER BY version");
    expect(rows.map((r) => r.version)).toEqual(["001", "002", "003", "004", "005", "006", "007", "008"]);
    const again = await bootstrap(pool, { ...config, seedDemo: false }, () => undefined);
    expect(again.migrations.applied).toEqual([]);
    expect(again.migrations.drift).toEqual([]);
  });
  it("seeded reference data", async () => {
    const r = await request(app).get("/api/v1/departments").set(auth("hr"));
    expect(r.body.data.map((d: { name: string }) => d.name)).toEqual(expect.arrayContaining(["ICU", "Emergency", "Surgery", "Pediatrics", "Administration"]));
    const s = await request(app).get("/api/v1/skills").set(auth("hr"));
    expect(s.body.data.map((d: { name: string }) => d.name)).toEqual(expect.arrayContaining(["ACLS", "BLS", "Dialysis", "NICU Care"]));
  });
});

describe("authentication", () => {
  it("rejects bad credentials without revealing which part is wrong", async () => {
    const a = await request(app).post("/api/v1/auth/login").send({ email: "admin@hwdt.local", password: "wrong" });
    const b = await request(app).post("/api/v1/auth/login").send({ email: "nobody@hwdt.local", password: "wrong" });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });
  it("requires a bearer token and validates it", async () => {
    expect((await request(app).get("/api/v1/employees")).status).toBe(401);
    expect((await request(app).get("/api/v1/employees").set({ Authorization: "Bearer garbage" })).body.error.code).toBe("INVALID_TOKEN");
  });
  it("returns the current user with permissions", async () => {
    const r = await request(app).get("/api/v1/auth/me").set(auth("compliance"));
    expect(r.body.role).toBe("COMPLIANCE_OFFICER");
    expect(r.body.permissions).toContain("credentials:verify");
  });
});

describe("employee CRUD", () => {
  let id: string;
  it("creates an employee", async () => {
    const r = await request(app).post("/api/v1/employees").set(auth("hr")).send(employeeBody("0001"));
    expect(r.status).toBe(201);
    expect(r.headers.location).toBe(`/api/v1/employees/${r.body.id}`);
    expect(r.body).toMatchObject({ employeeNumber: "EMP-90001", fullName: "Test EmployeeAAAB", employeeCategory: "CLINICAL", status: "ACTIVE", department: { id: 1, name: "ICU" } });
    expect(r.body.compliance.status).toBe("NON_COMPLIANT"); // clinical, no licence yet
    id = r.body.id;
  });
  it("rejects duplicates (409) and invalid input (422)", async () => {
    const dup = await request(app).post("/api/v1/employees").set(auth("hr")).send(employeeBody("0001"));
    expect(dup.status).toBe(409);
    const bad = await request(app).post("/api/v1/employees").set(auth("hr")).send({ ...employeeBody("0002"), email: "x", departmentId: "abc" });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details.map((d: { field: string }) => d.field)).toEqual(expect.arrayContaining(["email", "departmentId"]));
  });
  it("updates an employee (partial PUT)", async () => {
    const r = await request(app).put(`/api/v1/employees/${id}`).set(auth("hr")).send({ jobTitle: "Charge Nurse", departmentId: 2, status: "ON_LEAVE" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ jobTitle: "Charge Nurse", status: "ON_LEAVE", department: { id: 2, name: "Emergency" }, firstName: "Test" });
  });
  it("lists with search and filters", async () => {
    await request(app).post("/api/v1/employees").set(auth("hr")).send(employeeBody("0003", { employeeCategory: "NON_CLINICAL", jobTitle: "Ward Clerk", departmentId: 10 }));
    const clinical = await request(app).get("/api/v1/employees").query({ category: "CLINICAL" }).set(auth("hr"));
    expect(clinical.body.data.every((e: { employeeCategory: string }) => e.employeeCategory === "CLINICAL")).toBe(true);
    const byRole = await request(app).get("/api/v1/employees").query({ jobTitle: "ward clerk" }).set(auth("compliance"));
    expect(byRole.body.total).toBe(1);
    expect(byRole.body.data[0].nationalId).toMatch(/^•+/); // masked for non-HR roles
    const search = await request(app).get("/api/v1/employees").query({ search: "EmployeeAAAD" }).set(auth("hr"));
    expect(search.body.data[0].nationalId).toBe("NID-T0003");
    expect(search.body.data[0].compliance.status).toBe("NOT_REQUIRED");
  });
  it("manages employee skills", async () => {
    const r = await request(app).post(`/api/v1/employees/${id}/skills`).set(auth("hr")).send({ skillId: 1, level: "ADVANCED", yearsExperience: 4.5 });
    expect(r.status).toBe(201);
    const emp = await request(app).get(`/api/v1/employees/${id}`).set(auth("hr"));
    expect(emp.body.skills).toEqual([expect.objectContaining({ name: "ACLS", level: "ADVANCED", yearsExperience: 4.5 })]);
    const holders = await request(app).get("/api/v1/skills/1/employees").set(auth("compliance"));
    expect(holders.body).toMatchObject({ skill: { name: "ACLS" }, count: 1, data: [expect.objectContaining({ employeeId: id, level: "ADVANCED" })] });
    expect((await request(app).get("/api/v1/skills/1/employees").set(auth("employee"))).status).toBe(403);
    expect((await request(app).delete(`/api/v1/employees/${id}/skills/1`).set(auth("hr"))).status).toBe(204);
    await request(app).post(`/api/v1/employees/${id}/skills`).set(auth("hr")).send({ skillId: 1, level: "ADVANCED", yearsExperience: 4.5 });
  });
  it("enforces RBAC", async () => {
    expect((await request(app).post("/api/v1/employees").set(auth("compliance")).send(employeeBody("0004"))).status).toBe(403);
    expect((await request(app).get("/api/v1/employees").set(auth("employee"))).status).toBe(403);
    expect((await request(app).get(`/api/v1/employees/${id}`).set(auth("employee"))).status).toBe(403);
  });
  it("soft-deletes an employee", async () => {
    const tmp = await request(app).post("/api/v1/employees").set(auth("hr")).send(employeeBody("0005"));
    expect((await request(app).delete(`/api/v1/employees/${tmp.body.id}`).set(auth("hr"))).status).toBe(204);
    expect((await request(app).get(`/api/v1/employees/${tmp.body.id}`).set(auth("hr"))).status).toBe(404);
    const row = await pool.query("SELECT deleted_at, status FROM workforce.employees WHERE id = $1", [tmp.body.id]);
    expect(row.rows[0].deleted_at).not.toBeNull();
    expect(row.rows[0].status).toBe("TERMINATED");
    expect((await request(app).get("/api/v1/employees/not-a-uuid").set(auth("hr"))).status).toBe(422);
  });
});

describe("credential management", () => {
  let empId: string;
  let credId: string;
  beforeAll(async () => {
    const r = await request(app).post("/api/v1/employees").set(auth("hr")).send(employeeBody("0100"));
    empId = r.body.id;
  });

  it("creates a credential as PENDING_VERIFICATION", async () => {
    const r = await request(app).post(`/api/v1/employees/${empId}/credentials`).set(auth("hr")).send(credentialBody());
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: "PENDING_VERIFICATION", isValid: false, daysUntilExpiry: 400, verifiedBy: null });
    credId = r.body.id;
  });

  it("verification makes it VALID and records the verifier", async () => {
    expect((await request(app).post(`/api/v1/credentials/${credId}/verify`).set(auth("hr"))).status).toBe(403); // HR cannot verify
    const r = await request(app).post(`/api/v1/credentials/${credId}/verify`).set(auth("compliance"));
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("VALID");
    expect(r.body.isValid).toBe(true);
    expect(r.body.verifiedBy.name).toBeTruthy();
    const emp = await request(app).get(`/api/v1/employees/${empId}`).set(auth("hr"));
    expect(emp.body.compliance.status).toBe("COMPLIANT");
  });

  it("changing a material field resets verification", async () => {
    const r = await request(app).put(`/api/v1/credentials/${credId}`).set(auth("compliance")).send({ expiryDate: addDays(today, 20) });
    expect(r.body).toMatchObject({ status: "PENDING_VERIFICATION", verifiedAt: null, daysUntilExpiry: 20 });
    const v = await request(app).post(`/api/v1/credentials/${credId}/verify`).set(auth("admin"));
    expect(v.body.status).toBe("EXPIRING_SOON"); // Rule 1: ≤ 60 days
  });

  it("detects expired credentials and never marks them valid", async () => {
    const r = await request(app).post(`/api/v1/employees/${empId}/credentials`).set(auth("compliance"))
      .send(credentialBody({ credentialType: "CERTIFICATION", credentialName: "BLS Provider", issueDate: addDays(today, -800), expiryDate: addDays(today, -1) }));
    expect(r.body).toMatchObject({ status: "EXPIRED", isValid: false, daysUntilExpiry: -1 });
    const verify = await request(app).post(`/api/v1/credentials/${r.body.id}/verify`).set(auth("compliance"));
    expect(verify.status).toBe(422);
    expect(verify.body.error.code).toBe("EXPIRED_CREDENTIAL_CANNOT_BE_VERIFIED");
    const expired = await request(app).get("/api/v1/credentials/expired").set(auth("compliance"));
    expect(expired.body.data.map((c: { id: string }) => c.id)).toContain(r.body.id);
    expect(expired.body.data.every((c: { status: string; isValid: boolean }) => c.status === "EXPIRED" && !c.isValid)).toBe(true);
    const emp = await request(app).get(`/api/v1/employees/${empId}`).set(auth("hr"));
    expect(emp.body.compliance.status).toBe("NON_COMPLIANT");
  });

  it("returns 30- and 60-day expiry buckets", async () => {
    for (const d of [5, 30, 31, 60, 61]) {
      await request(app).post(`/api/v1/employees/${empId}/credentials`).set(auth("compliance"))
        .send(credentialBody({ credentialType: "TRAINING", credentialName: `Training D${d}`, expiryDate: addDays(today, d) }));
    }
    const r = await request(app).get("/api/v1/credentials/expiring").set(auth("hr"));
    const names30 = r.body.within30Days.data.map((c: { credentialName: string }) => c.credentialName);
    const names60 = r.body.within60Days.data.map((c: { credentialName: string }) => c.credentialName);
    expect(names30).toEqual(expect.arrayContaining(["Training D5", "Training D30"]));
    expect(names30).not.toContain("Training D31");
    expect(names60).toEqual(expect.arrayContaining(["Training D5", "Training D30", "Training D31", "Training D60"]));
    expect(names60).not.toContain("Training D61");
    expect(r.body.within60Days.data.every((c: { daysUntilExpiry: number }) => c.daysUntilExpiry >= 0 && c.daysUntilExpiry <= 60)).toBe(true);
  });

  it("enforces Rule 3 for non-clinical employees", async () => {
    const nc = await request(app).post("/api/v1/employees").set(auth("hr")).send(employeeBody("0101", { employeeCategory: "NON_CLINICAL", jobTitle: "Clerk" }));
    const r = await request(app).post(`/api/v1/employees/${nc.body.id}/credentials`).set(auth("hr")).send(credentialBody());
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("PROFESSIONAL_CREDENTIAL_REQUIRES_CLINICAL");
    const ok = await request(app).post(`/api/v1/employees/${nc.body.id}/credentials`).set(auth("hr")).send(credentialBody({ credentialType: "TRAINING", credentialName: "Fire Safety" }));
    expect(ok.status).toBe(201);
  });

  it("lets an EMPLOYEE submit only their own credentials", async () => {
    await pool.query("UPDATE iam.users SET employee_id = $1 WHERE email = 'amira.haddad@hwdt.local'", [empId]);
    const login = await request(app).post("/api/v1/auth/login").send({ email: "amira.haddad@hwdt.local", password: demo });
    const own = { Authorization: `Bearer ${login.body.accessToken}` };
    expect((await request(app).get(`/api/v1/employees/${empId}`).set(own)).status).toBe(200);
    const sub = await request(app).post(`/api/v1/employees/${empId}/credentials`).set(own).send(credentialBody({ credentialType: "CERTIFICATION", credentialName: "PALS" }));
    expect(sub.status).toBe(201);
    expect(sub.body.status).toBe("PENDING_VERIFICATION");
    const other = await pool.query("SELECT id FROM workforce.employees WHERE id <> $1 AND deleted_at IS NULL LIMIT 1", [empId]);
    expect((await request(app).post(`/api/v1/employees/${other.rows[0].id}/credentials`).set(own).send(credentialBody())).status).toBe(403);
    expect((await request(app).delete(`/api/v1/credentials/${sub.body.id}`).set(own)).status).toBe(403);
  });

  it("deletes a credential and writes an audit trail", async () => {
    const tmp = await request(app).post(`/api/v1/employees/${empId}/credentials`).set(auth("admin")).send(credentialBody({ credentialType: "OTHER", credentialName: "Temp" }));
    expect((await request(app).delete(`/api/v1/credentials/${tmp.body.id}`).set(auth("admin"))).status).toBe(204);
    expect((await request(app).delete(`/api/v1/credentials/${tmp.body.id}`).set(auth("admin"))).status).toBe(404);
    const a = await pool.query("SELECT action FROM platform.audit_log WHERE entity_id = $1 ORDER BY id", [tmp.body.id]);
    expect(a.rows.map((r) => r.action)).toEqual(["CREDENTIAL_CREATED", "CREDENTIAL_DELETED"]);
  });

  it("SQL status function and TypeScript rules agree on every boundary", async () => {
    for (const verified of [true, false]) {
      for (let offset = -3; offset <= 65; offset++) {
        const expiry = addDays(today, offset);
        const { rows } = await pool.query("SELECT credential.compute_status($1::date, $2::timestamptz, CURRENT_DATE) AS s", [expiry, verified ? new Date() : null]);
        expect(rows[0].s, `offset ${offset} verified=${verified}`).toBe(computeCredentialStatus({ expiryDate: expiry, verifiedAt: verified ? new Date() : null }, today));
      }
    }
  });

  it("dashboard summary is consistent with credential listings", async () => {
    const d = await request(app).get("/api/v1/dashboard/summary").set(auth("hr"));
    const expired = await request(app).get("/api/v1/credentials/expired").set(auth("hr"));
    const expiring = await request(app).get("/api/v1/credentials/expiring").set(auth("hr"));
    expect(d.status).toBe(200);
    expect(d.body.credentials.expired).toBe(expired.body.count);
    expect(d.body.credentials.expiring30).toBe(expiring.body.within30Days.count);
    expect(d.body.credentials.expiring60).toBe(expiring.body.within60Days.count);
    expect(d.body.employees.total).toBeGreaterThan(0);
    expect((await request(app).get("/api/v1/dashboard/summary").set(auth("employee"))).status).toBe(403);
  });
});
