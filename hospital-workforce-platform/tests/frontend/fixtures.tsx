import type { ReactNode } from "react";
import { AuthContext, type AuthState } from "../../frontend/src/lib/auth";
import type { Credential, Employee, EmployeeDetail, SessionUser } from "../../frontend/src/lib/types";

export const hrUser: SessionUser = {
  id: "u-hr", email: "hr.manager@hwdt.local", name: "Olivia Brown", role: "HR_MANAGER", employeeId: null,
  permissions: ["employees:read", "employees:write", "employees:delete", "employees:view-sensitive", "credentials:read", "credentials:write", "reference:write", "compliance:read"],
};
export const complianceUser: SessionUser = {
  id: "u-co", email: "compliance@hwdt.local", name: "Compliance Officer", role: "COMPLIANCE_OFFICER", employeeId: null,
  permissions: ["employees:read", "credentials:read", "credentials:write", "credentials:verify", "credentials:delete", "compliance:read"],
};

export function withAuth(ui: ReactNode, user: SessionUser = hrUser) {
  const value: AuthState = { user, expiresAt: new Date(Date.now() + 3600_000).toISOString(), ready: true, login: async () => user, logout: () => undefined, can: (p) => user.permissions.includes(p) };
  return <AuthContext.Provider value={value}>{ui}</AuthContext.Provider>;
}

export const employee = (over: Partial<Employee> = {}): Employee => ({
  id: "e1", employeeNumber: "EMP-001001", firstName: "Amira", lastName: "Haddad", fullName: "Amira Haddad", nationalId: "NID-784512001",
  email: "amira.haddad@hwdt.local", phone: "+1-555-0101", department: { id: 1, name: "ICU" }, jobTitle: "Critical Care Nurse",
  employmentType: "FULL_TIME", employeeCategory: "CLINICAL", status: "ACTIVE", hireDate: "2019-01-10", createdAt: "", updatedAt: "",
  credentialSummary: { total: 2, valid: 1, expiring: 1, expired: 0, pending: 0, activeLicenses: 1 },
  compliance: { status: "AT_RISK", reasons: ["1 credential expiring within 60 days"] },
  ...over,
});

export const credential = (over: Partial<Credential> = {}): Credential => ({
  id: "c1", employee: { id: "e1", employeeNumber: "EMP-001001", fullName: "Amira Haddad", category: "CLINICAL", department: { id: 1, name: "ICU" } },
  credentialType: "PROFESSIONAL_LICENSE", credentialName: "Registered Nurse License", credentialNumber: "RN-448812", issuer: "State Board of Nursing",
  issueDate: "2024-10-01", expiryDate: "2027-10-01", status: "VALID", isValid: true, daysUntilExpiry: 395, documentReference: "",
  verifiedBy: { id: "u-co", name: "Compliance Officer", email: "compliance@hwdt.local" }, verifiedAt: "2026-08-01T10:00:00Z", createdAt: "", updatedAt: "",
  ...over,
});

export const employeeDetail = (over: Partial<EmployeeDetail> = {}): EmployeeDetail => ({
  ...employee(),
  skills: [
    { skillId: 1, name: "ACLS", category: "Life Support", level: "ADVANCED", yearsExperience: 7 },
    { skillId: 7, name: "Ventilator Management", category: "Critical Care", level: "EXPERT", yearsExperience: 8 },
  ],
  credentials: [
    credential(),
    credential({ id: "c2", credentialType: "CERTIFICATION", credentialName: "ACLS Provider", status: "EXPIRING_SOON", daysUntilExpiry: 20, expiryDate: "2026-10-14" }),
  ],
  ...over,
});
