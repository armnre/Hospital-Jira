/**
 * HWDT Phase 2 — Shift Management & Conflict Detection Automated Integration Tests
 * Tests the 4 Hard Business Rules:
 *   1. Expired credential rejection
 *   2. Shift time overlap rejection
 *   3. Employee availability / leave rejection
 *   4. Required skill match rejection
 * plus supervisor approval workflow and dashboard.
 */
import "dotenv/config";
import { Client, type Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../backend/src/app";
import { bootstrap } from "../../backend/src/bootstrap";
import { loadConfig, type Config } from "../../backend/src/config/env";
import { addDays, todayUtc } from "../../backend/src/common/dates";
import { gregorianToJalali } from "../../backend/src/common/jalali";
import { createPool } from "../../backend/src/db/pool";

const adminUrl = new URL(
  process.env.HWDT_TEST_ADMIN_URL ?? process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
);
const dbName = `hwdt_shift_test_${process.pid}`;
const testUrl = new URL(adminUrl.toString());
testUrl.pathname = `/${dbName}`;

let pool: Pool;
let config: Config;
let app: ReturnType<typeof createApp>;
const tokens: Record<string, string> = {};
const demo = "Hwdt!Demo2026";
const today = todayUtc();
const jalaliToday = gregorianToJalali(today);

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

let testEmpId: string;
let expiredEmpId: string;
let noSkillEmpId: string;
let morningShiftId: string;
let overlapShiftId: string;
let skillShiftId: string;

beforeAll(async () => {
  await admin(`DROP DATABASE IF EXISTS ${dbName}`);
  await admin(`CREATE DATABASE ${dbName}`);
  config = {
    ...loadConfig({
      NODE_ENV: "test",
      HWDT_DATABASE_URL: testUrl.toString(),
      JWT_SECRET: "phase2-secret-phase2-secret-0000000000",
      HWDT_SEED_DEMO: "false",
    }),
    seedDemo: false,
  };
  pool = createPool(config);
  await pool.query("SELECT 1");

  // Bootstrap migrations
  await bootstrap(pool, config, () => undefined);

  // Ensure demo accounts exist
  const { ensureSeedUsers } = await import("../../backend/src/modules/auth/auth.service");
  await ensureSeedUsers(pool, { ...config, seedDemo: true }, () => undefined);

  app = createApp({ pool, config });

  // Login as roles
  for (const [role, email] of Object.entries({
    admin: "admin@hwdt.local",
    supervisor: "supervisor@hwdt.local",
    metron: "metron@hwdt.local",
    hr: "hr.manager@hwdt.local",
  })) {
    const r = await request(app).post("/api/v1/auth/login").send({ email, password: demo });
    expect(r.status).toBe(200);
    tokens[role] = r.body.accessToken;
  }

  // 1. Create a fully compliant clinical employee with valid license and ACLS/Ventilator skill
  const emp1 = await request(app)
    .post("/api/v1/employees")
    .set(auth("hr"))
    .send({
      employeeNumber: "EMP-007001",
      firstName: "سارا",
      lastName: "احمدی",
      nationalId: "NID-7001",
      email: "sara.ahmadi@hwdt.local",
      phone: "+98-912-0001",
      departmentId: 1, // ICU
      jobTitle: "Critical Care Nurse",
      employmentType: "FULL_TIME",
      employeeCategory: "CLINICAL",
      status: "ACTIVE",
    });
  expect(emp1.status).toBe(201);
  testEmpId = emp1.body.id;

  // Add valid professional license
  const lic1 = await request(app)
    .post(`/api/v1/employees/${testEmpId}/credentials`)
    .set(auth("hr"))
    .send({
      credentialType: "PROFESSIONAL_LICENSE",
      credentialName: "پروانه کارشناسی پرستاری",
      issuer: "سازمان نظام پرستاری",
      issueDate: addDays(today, -300),
      expiryDate: addDays(today, 400),
    });
  // Verify license
  await pool.query("UPDATE credential.credentials SET verified_at = now() WHERE id = $1", [lic1.body.id]);

  // Add required skill: Ventilator Management (id=7 from migration 005)
  await request(app)
    .post(`/api/v1/employees/${testEmpId}/skills`)
    .set(auth("hr"))
    .send({ skillId: 7, level: "EXPERT", yearsExperience: 6 });

  // 2. Create employee with EXPIRED license
  const emp2 = await request(app)
    .post("/api/v1/employees")
    .set(auth("hr"))
    .send({
      employeeNumber: "EMP-007002",
      firstName: "مهدی",
      lastName: "کریمی",
      nationalId: "NID-7002",
      email: "mehdi.karimi@hwdt.local",
      phone: "+98-912-0002",
      departmentId: 1,
      jobTitle: "Critical Care Nurse",
      employmentType: "FULL_TIME",
      employeeCategory: "CLINICAL",
      status: "ACTIVE",
    });
  expiredEmpId = emp2.body.id;

  // Add expired license
  await pool.query(
    `INSERT INTO credential.credentials
       (employee_id, credential_type, credential_name, issuer, issue_date, expiry_date, status, verified_at)
     VALUES ($1, 'PROFESSIONAL_LICENSE', 'پروانه منقضی', 'سازمان نظام پرستاری', $2, $3, 'EXPIRED', now())`,
    [expiredEmpId, addDays(today, -800), addDays(today, -10)],
  );

  // 3. Create employee WITHOUT the required skill
  const emp3 = await request(app)
    .post("/api/v1/employees")
    .set(auth("hr"))
    .send({
      employeeNumber: "EMP-007003",
      firstName: "نگار",
      lastName: "رضایی",
      nationalId: "NID-7003",
      email: "negar.rezaei@hwdt.local",
      phone: "+98-912-0003",
      departmentId: 1,
      jobTitle: "Critical Care Nurse",
      employmentType: "FULL_TIME",
      employeeCategory: "CLINICAL",
      status: "ACTIVE",
    });
  noSkillEmpId = emp3.body.id;
  // Give valid license but NO skill
  await pool.query(
    `INSERT INTO credential.credentials
       (employee_id, credential_type, credential_name, issuer, issue_date, expiry_date, status, verified_at)
     VALUES ($1, 'PROFESSIONAL_LICENSE', 'پروانه پرستاری', 'نظام پرستاری', $2, $3, 'VALID', now())`,
    [noSkillEmpId, addDays(today, -200), addDays(today, 500)],
  );

  // Create Shift 1: Morning 07:30 - 14:00
  const s1 = await request(app)
    .post("/api/v1/shifts")
    .set(auth("supervisor"))
    .send({
      nameFa: "شیفت صبح ICU تست",
      departmentId: 1,
      shiftType: "MORNING",
      gregorianDate: today,
      jalaliDate: jalaliToday,
      startTime: "07:30",
      endTime: "14:00",
      requiredStaff: 2,
    });
  morningShiftId = s1.body.id;

  // Create Shift 2: Overlapping Afternoon 13:30 - 20:00 (overlaps from 13:30 to 14:00!)
  const s2 = await request(app)
    .post("/api/v1/shifts")
    .set(auth("supervisor"))
    .send({
      nameFa: "شیفت عصر ICU تداخل",
      departmentId: 1,
      shiftType: "AFTERNOON",
      gregorianDate: today,
      jalaliDate: jalaliToday,
      startTime: "13:30",
      endTime: "20:00",
      requiredStaff: 2,
    });
  overlapShiftId = s2.body.id;

  // Create Shift 3: Requires specific skill "Ventilator Management"
  const s3 = await request(app)
    .post("/api/v1/shifts")
    .set(auth("supervisor"))
    .send({
      nameFa: "شیفت ویژه ICU با مهارت ونتیلاتور",
      departmentId: 1,
      shiftType: "NIGHT",
      gregorianDate: today,
      jalaliDate: jalaliToday,
      startTime: "20:00",
      endTime: "07:30",
      requiredStaff: 2,
      requiredSkill: "Ventilator Management",
    });
  skillShiftId = s3.body.id;
});

afterAll(async () => {
  await pool?.end();
  await admin(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
});

describe("Phase 2: Conflict Detection Engine (4 Hard Rules)", () => {
  it("Rule 1: Rejects assignment if employee credential is expired", async () => {
    // Validate API check
    const val = await request(app)
      .post(`/api/v1/shifts/${morningShiftId}/validate`)
      .set(auth("supervisor"))
      .send({ employeeId: expiredEmpId });

    expect(val.status).toBe(200);
    expect(val.body.valid).toBe(false);
    expect(val.body.errors.some((e: string) => e.includes("قانون ۱") || e.includes("منقضی"))).toBe(true);

    // Assignment attempt must fail with 422
    const res = await request(app)
      .post(`/api/v1/shifts/${morningShiftId}/assign`)
      .set(auth("supervisor"))
      .send({ employeeId: expiredEmpId });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("ASSIGNMENT_CONFLICT");
    expect(res.body.error.message).toMatch(/منقضی/);
  });

  it("Rule 2: Rejects assignment if employee has overlapping shift", async () => {
    // Assign valid employee to morning shift (07:30 - 14:00) -> should succeed
    const asg1 = await request(app)
      .post(`/api/v1/shifts/${morningShiftId}/assign`)
      .set(auth("supervisor"))
      .send({ employeeId: testEmpId });

    expect(asg1.status).toBe(201);
    expect(asg1.body.assignment.employee_id).toBe(testEmpId);

    // Now try to assign same employee to overlapping shift (13:30 - 20:00) -> must fail!
    const val = await request(app)
      .post(`/api/v1/shifts/${overlapShiftId}/validate`)
      .set(auth("supervisor"))
      .send({ employeeId: testEmpId });

    expect(val.status).toBe(200);
    expect(val.body.valid).toBe(false);
    expect(val.body.errors.some((e: string) => e.includes("قانون ۲") || e.includes("تداخل"))).toBe(true);

    const asg2 = await request(app)
      .post(`/api/v1/shifts/${overlapShiftId}/assign`)
      .set(auth("supervisor"))
      .send({ employeeId: testEmpId });

    expect(asg2.status).toBe(422);
    expect(asg2.body.error.code).toBe("ASSIGNMENT_CONFLICT");
    expect(asg2.body.error.message).toMatch(/تداخل/);
  });

  it("Rule 3: Rejects assignment if employee is unavailable or on leave", async () => {
    // Record employee availability as VACATION today
    await request(app)
      .post("/api/v1/availability")
      .set(auth("supervisor"))
      .send({
        employeeId: testEmpId,
        date: today,
        available: false,
        reason: "VACATION",
        notes: "مرخصی استحقاقی اضطراری",
      });

    // Remove previous assignment to isolate availability rule
    const asgList = await request(app).get(`/api/v1/shifts/${morningShiftId}/assignments`).set(auth("supervisor"));
    for (const a of asgList.body.data) {
      await request(app).delete(`/api/v1/assignments/${a.id}`).set(auth("supervisor"));
    }

    // Now validate against morning shift
    const val = await request(app)
      .post(`/api/v1/shifts/${morningShiftId}/validate`)
      .set(auth("supervisor"))
      .send({ employeeId: testEmpId });

    expect(val.status).toBe(200);
    expect(val.body.valid).toBe(false);
    expect(val.body.errors.some((e: string) => e.includes("قانون ۳") || e.includes("مرخصی"))).toBe(true);

    const asg = await request(app)
      .post(`/api/v1/shifts/${morningShiftId}/assign`)
      .set(auth("supervisor"))
      .send({ employeeId: testEmpId });

    expect(asg.status).toBe(422);
    expect(asg.body.error.code).toBe("ASSIGNMENT_CONFLICT");

    // Reset availability to AVAILABLE
    await request(app)
      .post("/api/v1/availability")
      .set(auth("supervisor"))
      .send({
        employeeId: testEmpId,
        date: today,
        available: true,
        reason: "AVAILABLE",
      });
  });

  it("Rule 4: Rejects assignment if employee lacks the required skill", async () => {
    // shift 3 requires "Ventilator Management"
    // emp3 does not have Ventilator Management
    const val = await request(app)
      .post(`/api/v1/shifts/${skillShiftId}/validate`)
      .set(auth("supervisor"))
      .send({ employeeId: noSkillEmpId });

    expect(val.status).toBe(200);
    expect(val.body.valid).toBe(false);
    expect(val.body.errors.some((e: string) => e.includes("قانون ۴") || e.includes("مهارت"))).toBe(true);

    const asgFail = await request(app)
      .post(`/api/v1/shifts/${skillShiftId}/assign`)
      .set(auth("supervisor"))
      .send({ employeeId: noSkillEmpId });

    expect(asgFail.status).toBe(422);
    expect(asgFail.body.error.code).toBe("ASSIGNMENT_CONFLICT");

    // Employee 1 (testEmpId) has the skill -> should succeed!
    const asgSuccess = await request(app)
      .post(`/api/v1/shifts/${skillShiftId}/assign`)
      .set(auth("supervisor"))
      .send({ employeeId: testEmpId });

    expect(asgSuccess.status).toBe(201);
    expect(asgSuccess.body.assignment.employee_id).toBe(testEmpId);
  });
});

describe("Supervisor Approval Workflow & Dashboard", () => {
  it("allows Metron (Nursing Manager) to approve shifts and writes audit log", async () => {
    // Approve morningShiftId
    const res = await request(app)
      .post(`/api/v1/shifts/${morningShiftId}/approve`)
      .set(auth("metron"));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("APPROVED");
    expect(res.body.approved_by_name).toBe("مریم حسینی (مدیر پرستاری / مترون)");

    const auditRes = await pool.query(
      "SELECT action, entity_id FROM platform.audit_log WHERE action = 'SHIFT_APPROVED' AND entity_id = $1",
      [morningShiftId],
    );
    expect(auditRes.rows.length).toBeGreaterThan(0);
  });

  it("returns supervisor dashboard with today shifts, shortage, and coverage", async () => {
    const dash = await request(app)
      .get("/api/v1/supervisor/dashboard")
      .set(auth("supervisor"));

    expect(dash.status).toBe(200);
    expect(dash.body.todayShifts.length).toBeGreaterThanOrEqual(2);
    expect(typeof dash.body.shortageCount).toBe("number");
    expect(Array.isArray(dash.body.departmentCoverage)).toBe(true);
    expect(dash.body.departmentCoverage.some((d: { departmentNameFa: string }) => d.departmentNameFa.includes("ICU"))).toBe(true);
  });

  it("recommends ranked candidates for a shift (Phase 3 AI preparation)", async () => {
    const rec = await request(app)
      .get(`/api/v1/shifts/${morningShiftId}/candidates`)
      .set(auth("supervisor"));

    expect(rec.status).toBe(200);
    expect(Array.isArray(rec.body.candidates)).toBe(true);
    expect(rec.body.candidates.length).toBeGreaterThan(0);
    expect(rec.body.candidates[0].score).toBeGreaterThan(0);
  });
});
