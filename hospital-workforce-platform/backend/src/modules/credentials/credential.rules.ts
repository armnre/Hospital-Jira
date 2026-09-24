/**
 * HWDT-15 — Credential business rules (pure functions, no I/O).
 * The SQL function credential.compute_status() implements the identical rule for queries;
 * tests/backend/credential-rules.db.test.ts asserts both agree on every boundary date.
 */
import { addDays, daysBetween } from "../../common/dates";
import { businessRule } from "../../common/errors";

export const CREDENTIAL_STATUSES = ["VALID", "EXPIRING_SOON", "EXPIRED", "PENDING_VERIFICATION"] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

export const CREDENTIAL_TYPES = ["PROFESSIONAL_LICENSE", "REGISTRATION", "CERTIFICATION", "TRAINING", "OTHER"] as const;
export type CredentialType = (typeof CREDENTIAL_TYPES)[number];

/** Professional credentials (Rule 3) — only applicable to clinical employees. */
export const PROFESSIONAL_CREDENTIAL_TYPES: readonly CredentialType[] = ["PROFESSIONAL_LICENSE", "REGISTRATION"];

export const EMPLOYEE_CATEGORIES = ["CLINICAL", "NON_CLINICAL"] as const;
export type EmployeeCategory = (typeof EMPLOYEE_CATEGORIES)[number];

/** Rule 1 window. */
export const EXPIRING_SOON_WINDOW_DAYS = 60;
/** Compliance API buckets. */
export const EXPIRY_BUCKETS_DAYS = [30, 60] as const;

/**
 * Rule 1 — expiry calculation (date only):
 *   expiry_date <  today           -> EXPIRED
 *   expiry_date <= today + 60 days -> EXPIRING_SOON
 *   expiry_date >  today + 60 days -> VALID   (no expiry date = VALID)
 */
export function calculateExpiryStatus(expiryDate: string | null, today: string): "VALID" | "EXPIRING_SOON" | "EXPIRED" {
  if (!expiryDate) return "VALID";
  if (expiryDate < today) return "EXPIRED";
  if (expiryDate <= addDays(today, EXPIRING_SOON_WINDOW_DAYS)) return "EXPIRING_SOON";
  return "VALID";
}

/**
 * Full credential status:
 *   1. EXPIRED always wins (Rule 2 — an expired credential can never be shown as valid, verified or not)
 *   2. unverified -> PENDING_VERIFICATION
 *   3. otherwise the Rule 1 result
 */
export function computeCredentialStatus(c: { expiryDate: string | null; verifiedAt: string | Date | null }, today: string): CredentialStatus {
  const expiry = calculateExpiryStatus(c.expiryDate, today);
  if (expiry === "EXPIRED") return "EXPIRED";
  if (!c.verifiedAt) return "PENDING_VERIFICATION";
  return expiry;
}

/** Rule 2 — only verified, non-expired credentials count as valid for work. */
export function isCredentialValid(status: CredentialStatus): boolean {
  return status === "VALID" || status === "EXPIRING_SOON";
}

export function daysUntilExpiry(expiryDate: string | null, today: string): number | null {
  return expiryDate ? daysBetween(today, expiryDate) : null;
}

/** Rule 3 — professional licences / registrations only for clinical employees. */
export function assertCredentialTypeAllowed(category: EmployeeCategory, type: CredentialType): void {
  if (category === "NON_CLINICAL" && PROFESSIONAL_CREDENTIAL_TYPES.includes(type)) {
    throw businessRule(
      "PROFESSIONAL_CREDENTIAL_REQUIRES_CLINICAL",
      "Professional licences and registrations can only be recorded for clinical employees",
    );
  }
}

/** Rule 2 — an expired credential cannot be verified into a valid state. */
export function assertVerifiable(status: CredentialStatus): void {
  if (status === "EXPIRED") {
    throw businessRule("EXPIRED_CREDENTIAL_CANNOT_BE_VERIFIED", "Expired credentials cannot be verified — record the renewed credential instead");
  }
}

export function assertDates(issueDate: string, expiryDate: string | null, today: string): void {
  if (issueDate > today) throw businessRule("ISSUE_DATE_IN_FUTURE", "Issue date cannot be in the future");
  if (expiryDate && expiryDate < issueDate) throw businessRule("EXPIRY_BEFORE_ISSUE", "Expiry date must be on or after the issue date");
}

/** Fields whose change invalidates a previous verification (the underlying document changed). */
export const MATERIAL_FIELDS = ["credentialType", "credentialName", "credentialNumber", "issuer", "issueDate", "expiryDate", "documentReference"] as const;

// ------------------------------------------------------------------ employee compliance (Rule 3)
export const COMPLIANCE_STATUSES = ["COMPLIANT", "AT_RISK", "NON_COMPLIANT", "NOT_REQUIRED"] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export type CredentialCounts = {
  total: number;
  valid: number;
  expiring: number;
  expired: number;
  pending: number;
  activeLicenses: number; // verified, non-expired PROFESSIONAL_LICENSE / REGISTRATION
};

export function evaluateEmployeeCompliance(category: EmployeeCategory, c: CredentialCounts): { status: ComplianceStatus; reasons: string[] } {
  const reasons: string[] = [];
  if (c.expired > 0) reasons.push(`${c.expired} expired credential${c.expired > 1 ? "s" : ""}`);
  if (category === "CLINICAL" && c.activeLicenses === 0) reasons.push("No current verified professional licence or registration");
  if (reasons.length) return { status: "NON_COMPLIANT", reasons };
  if (c.expiring > 0) reasons.push(`${c.expiring} credential${c.expiring > 1 ? "s" : ""} expiring within ${EXPIRING_SOON_WINDOW_DAYS} days`);
  if (c.pending > 0) reasons.push(`${c.pending} credential${c.pending > 1 ? "s" : ""} pending verification`);
  if (reasons.length) return { status: "AT_RISK", reasons };
  if (category === "NON_CLINICAL" && c.total === 0) return { status: "NOT_REQUIRED", reasons: ["Non-clinical role — credentials optional"] };
  return { status: "COMPLIANT", reasons: [] };
}
