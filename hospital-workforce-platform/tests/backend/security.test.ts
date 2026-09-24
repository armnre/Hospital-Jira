/** HWDT-18 — security unit tests: password hashing, JWT expiration, RBAC, input validation. */
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { parse } from "../../backend/src/common/validate";
import { signAccessToken, verifyAccessToken, type AuthUser } from "../../backend/src/modules/auth/jwt";
import { hashPassword, passwordPolicy, verifyPassword } from "../../backend/src/modules/auth/password";
import { PERMISSIONS, ROLES, hasPermission, permissionsFor } from "../../backend/src/modules/auth/rbac";
import { createCredentialSchema } from "../../backend/src/modules/credentials/credential.schema";
import { createEmployeeSchema, updateEmployeeSchema } from "../../backend/src/modules/employees/employee.schema";

const cfg = { jwtSecret: "unit-test-secret-unit-test-secret-000000", jwtExpiresInSeconds: 3600, jwtIssuer: "hwdt-backend", jwtAudience: "hwdt-frontend" };
const user: AuthUser = { id: "7b0b3f1e-8d2c-4a55-9c8e-0f6a1d2b3c4d", email: "hr@hwdt.local", name: "HR", role: "HR_MANAGER", employeeId: null };

describe("password hashing (scrypt)", () => {
  it("hashes with a random salt and verifies", async () => {
    const secret = "Correct-Horse-9";
    const a = await hashPassword(secret);
    const b = await hashPassword(secret);
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(a).not.toContain(secret);
    expect(a).not.toBe(b);
    expect(await verifyPassword(secret, a)).toBe(true);
    expect(await verifyPassword("wrong-password", a)).toBe(false);
    expect(await verifyPassword(secret, "plaintext")).toBe(false);
  });

  it("enforces the password policy", () => {
    expect(passwordPolicy.safeParse("short").success).toBe(false);
    expect(passwordPolicy.safeParse("alllowercase123!").success).toBe(false);
    expect(passwordPolicy.safeParse("Str0ng!Passw0rd").success).toBe(true);
  });
});

describe("JWT", () => {
  it("round-trips claims", () => {
    const { token, expiresIn } = signAccessToken(user, cfg);
    expect(expiresIn).toBe(3600);
    expect(verifyAccessToken(token, cfg)).toEqual(user);
  });

  it("rejects expired tokens with TOKEN_EXPIRED", () => {
    const expired = jwt.sign({ email: user.email, name: user.name, role: user.role, emp: null, exp: Math.floor(Date.now() / 1000) - 10 }, cfg.jwtSecret, {
      subject: user.id, issuer: cfg.jwtIssuer, audience: cfg.jwtAudience,
    });
    expect(() => verifyAccessToken(expired, cfg)).toThrow(expect.objectContaining({ status: 401, code: "TOKEN_EXPIRED" }));
  });

  it("rejects tampered tokens, wrong secret and wrong audience", () => {
    const { token } = signAccessToken(user, cfg);
    const [h, p, s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), role: "ADMIN" })).toString("base64url");
    expect(() => verifyAccessToken(`${h}.${forged}.${s}`, cfg)).toThrow(expect.objectContaining({ code: "INVALID_TOKEN" }));
    expect(() => verifyAccessToken(token, { ...cfg, jwtSecret: "another-secret-another-secret-000000" })).toThrow(expect.objectContaining({ code: "INVALID_TOKEN" }));
    expect(() => verifyAccessToken(token, { ...cfg, jwtAudience: "other" })).toThrow(expect.objectContaining({ code: "INVALID_TOKEN" }));
  });

  it("rejects the 'none' algorithm", () => {
    const none = jwt.sign({ role: "ADMIN" }, "", { algorithm: "none", subject: user.id, issuer: cfg.jwtIssuer, audience: cfg.jwtAudience });
    expect(() => verifyAccessToken(none, cfg)).toThrow(expect.objectContaining({ status: 401 }));
  });
});

describe("role-based access preparation", () => {
  it("defines all hospital roles", () => {
    expect([...ROLES]).toEqual([
      "ADMIN",
      "HR_MANAGER",
      "COMPLIANCE_OFFICER",
      "EMPLOYEE",
      "HOSPITAL_ADMIN",
      "NURSING_MANAGER",
      "SHIFT_SUPERVISOR",
      "DEPARTMENT_HEAD",
    ]);
  });
  it("maps permissions to roles", () => {
    expect(hasPermission("HR_MANAGER", "employees:write")).toBe(true);
    expect(hasPermission("COMPLIANCE_OFFICER", "employees:write")).toBe(false);
    expect(hasPermission("COMPLIANCE_OFFICER", "credentials:verify")).toBe(true);
    expect(hasPermission("HR_MANAGER", "credentials:verify")).toBe(false);
    expect(hasPermission("NURSING_MANAGER", "shifts:approve")).toBe(true);
    expect(hasPermission("SHIFT_SUPERVISOR", "assignments:write")).toBe(true);
    expect(hasPermission("EMPLOYEE", "employees:read")).toBe(false);
    expect(permissionsFor("EMPLOYEE")).toEqual([
      "employees:read:self",
      "credentials:submit:self",
      "assignments:read:self",
      "availability:write:self",
    ]);
  });
});

describe("input validation", () => {
  const valid = {
    employeeNumber: "emp-004001", firstName: "Zoë", lastName: "O'Neil", nationalId: "NID-123456", email: " Zoe@Example.ORG ",
    departmentId: 1, jobTitle: "Staff Nurse", employmentType: "FULL_TIME", employeeCategory: "CLINICAL",
  };
  it("normalises valid employee input and applies defaults", () => {
    const r = parse(createEmployeeSchema, valid);
    expect(r.employeeNumber).toBe("EMP-004001");
    expect(r.email).toBe("zoe@example.org");
    expect(r.status).toBe("ACTIVE");
    expect(r.hireDate).toBeNull();
  });
  it("rejects invalid values with field-level details", () => {
    try {
      parse(createEmployeeSchema, { ...valid, email: "nope", employeeNumber: "123", employeeCategory: "DOCTOR", extra: 1 });
      expect.fail("should throw");
    } catch (e) {
      const err = e as { status: number; details: { field: string }[] };
      expect(err.status).toBe(422);
      const fields = err.details.map((d) => d.field);
      expect(fields).toEqual(expect.arrayContaining(["email", "employeeNumber", "employeeCategory"]));
    }
  });
  it("partial update does not inject defaults", () => {
    expect(parse(updateEmployeeSchema, { jobTitle: "Charge Nurse" })).toEqual({ jobTitle: "Charge Nurse" });
    expect(() => parse(updateEmployeeSchema, {})).toThrow();
  });
  it("rejects script injection in credential fields and invalid dates", () => {
    expect(createCredentialSchema.safeParse({ credentialType: "CERTIFICATION", credentialName: "BLS", issuer: "AHA", issueDate: "2026-02-30" }).success).toBe(false);
    expect(createCredentialSchema.safeParse({ credentialType: "CERTIFICATION", credentialName: "BLS", issuer: "AHA", issueDate: "2026-01-10", documentReference: "<script>alert(1)</script>" }).success).toBe(false);
  });
});
