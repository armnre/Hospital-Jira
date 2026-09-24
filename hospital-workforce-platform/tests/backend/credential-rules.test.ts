/** HWDT-15 / HWDT-18 — unit tests for credential business rules (Rules 1, 2, 3). */
import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isValidIsoDate } from "../../backend/src/common/dates";
import { AppError } from "../../backend/src/common/errors";
import {
  assertCredentialTypeAllowed,
  assertDates,
  assertVerifiable,
  calculateExpiryStatus,
  computeCredentialStatus,
  daysUntilExpiry,
  evaluateEmployeeCompliance,
  isCredentialValid,
} from "../../backend/src/modules/credentials/credential.rules";

const TODAY = "2026-03-15";

describe("Rule 1 — expiry calculation", () => {
  it.each([
    [365, "VALID"],
    [61, "VALID"],
    [60, "EXPIRING_SOON"],
    [30, "EXPIRING_SOON"],
    [1, "EXPIRING_SOON"],
    [0, "EXPIRING_SOON"],
    [-1, "EXPIRED"],
    [-400, "EXPIRED"],
  ])("expiry today%+d days → %s", (offset, expected) => {
    expect(calculateExpiryStatus(addDays(TODAY, offset), TODAY)).toBe(expected);
  });

  it("treats credentials without an expiry date as VALID", () => {
    expect(calculateExpiryStatus(null, TODAY)).toBe("VALID");
  });

  it("handles month and leap-year boundaries", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(calculateExpiryStatus("2028-04-29", "2028-02-29")).toBe("EXPIRING_SOON"); // exactly 60 days
    expect(calculateExpiryStatus("2028-04-30", "2028-02-29")).toBe("VALID"); // 61 days
  });

  it("computes days until expiry", () => {
    expect(daysUntilExpiry(addDays(TODAY, 12), TODAY)).toBe(12);
    expect(daysUntilExpiry(addDays(TODAY, -3), TODAY)).toBe(-3);
    expect(daysUntilExpiry(null, TODAY)).toBeNull();
  });
});

describe("Rule 2 — expired credentials are never valid", () => {
  it("EXPIRED overrides verification", () => {
    expect(computeCredentialStatus({ expiryDate: addDays(TODAY, -1), verifiedAt: "2025-01-01T00:00:00Z" }, TODAY)).toBe("EXPIRED");
    expect(computeCredentialStatus({ expiryDate: addDays(TODAY, -1), verifiedAt: null }, TODAY)).toBe("EXPIRED");
  });

  it("unverified, non-expired credentials are PENDING_VERIFICATION", () => {
    expect(computeCredentialStatus({ expiryDate: addDays(TODAY, 200), verifiedAt: null }, TODAY)).toBe("PENDING_VERIFICATION");
    expect(computeCredentialStatus({ expiryDate: addDays(TODAY, 10), verifiedAt: null }, TODAY)).toBe("PENDING_VERIFICATION");
  });

  it("verified credentials follow Rule 1", () => {
    const v = new Date();
    expect(computeCredentialStatus({ expiryDate: addDays(TODAY, 200), verifiedAt: v }, TODAY)).toBe("VALID");
    expect(computeCredentialStatus({ expiryDate: addDays(TODAY, 45), verifiedAt: v }, TODAY)).toBe("EXPIRING_SOON");
  });

  it("isCredentialValid is false for EXPIRED and PENDING", () => {
    expect(isCredentialValid("EXPIRED")).toBe(false);
    expect(isCredentialValid("PENDING_VERIFICATION")).toBe(false);
    expect(isCredentialValid("VALID")).toBe(true);
    expect(isCredentialValid("EXPIRING_SOON")).toBe(true);
  });

  it("an expired credential cannot be verified", () => {
    expect(() => assertVerifiable("EXPIRED")).toThrow(AppError);
    expect(() => assertVerifiable("PENDING_VERIFICATION")).not.toThrow();
  });
});

describe("Rule 3 — professional credentials for clinical employees", () => {
  it("rejects professional licences for non-clinical employees", () => {
    expect(() => assertCredentialTypeAllowed("NON_CLINICAL", "PROFESSIONAL_LICENSE")).toThrow(/clinical employees/);
    expect(() => assertCredentialTypeAllowed("NON_CLINICAL", "REGISTRATION")).toThrow(AppError);
  });
  it("allows optional certifications/training for non-clinical employees", () => {
    expect(() => assertCredentialTypeAllowed("NON_CLINICAL", "TRAINING")).not.toThrow();
    expect(() => assertCredentialTypeAllowed("CLINICAL", "PROFESSIONAL_LICENSE")).not.toThrow();
  });
});

describe("employee compliance evaluation", () => {
  const base = { total: 0, valid: 0, expiring: 0, expired: 0, pending: 0, activeLicenses: 0 };
  it("non-clinical without credentials → NOT_REQUIRED", () => {
    expect(evaluateEmployeeCompliance("NON_CLINICAL", base).status).toBe("NOT_REQUIRED");
  });
  it("clinical without an active licence → NON_COMPLIANT", () => {
    const r = evaluateEmployeeCompliance("CLINICAL", { ...base, total: 1, valid: 1 });
    expect(r.status).toBe("NON_COMPLIANT");
    expect(r.reasons.join()).toMatch(/professional licence/);
  });
  it("any expired credential → NON_COMPLIANT", () => {
    expect(evaluateEmployeeCompliance("CLINICAL", { ...base, total: 2, valid: 1, expired: 1, activeLicenses: 1 }).status).toBe("NON_COMPLIANT");
  });
  it("expiring or pending → AT_RISK", () => {
    expect(evaluateEmployeeCompliance("CLINICAL", { ...base, total: 1, expiring: 1, activeLicenses: 1 }).status).toBe("AT_RISK");
    expect(evaluateEmployeeCompliance("NON_CLINICAL", { ...base, total: 1, pending: 1 }).status).toBe("AT_RISK");
  });
  it("clinical with active licence → COMPLIANT", () => {
    expect(evaluateEmployeeCompliance("CLINICAL", { ...base, total: 1, valid: 1, activeLicenses: 1 }).status).toBe("COMPLIANT");
  });
});

describe("date validation", () => {
  it("validates calendar dates", () => {
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(daysBetween("2026-01-01", "2026-03-02")).toBe(60);
  });
  it("rejects future issue dates and expiry before issue", () => {
    expect(() => assertDates(addDays(TODAY, 1), null, TODAY)).toThrow(/future/);
    expect(() => assertDates(TODAY, addDays(TODAY, -1), TODAY)).toThrow(/Expiry/);
    expect(() => assertDates(TODAY, TODAY, TODAY)).not.toThrow();
  });
});
