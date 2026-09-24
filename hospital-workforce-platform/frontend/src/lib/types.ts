export type Role =
  | "ADMIN"
  | "HR_MANAGER"
  | "COMPLIANCE_OFFICER"
  | "EMPLOYEE"
  | "HOSPITAL_ADMIN"
  | "NURSING_MANAGER"
  | "SHIFT_SUPERVISOR"
  | "DEPARTMENT_HEAD";

export type CredentialStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "PENDING_VERIFICATION";
export type ComplianceStatus = "COMPLIANT" | "AT_RISK" | "NON_COMPLIANT" | "NOT_REQUIRED";
export type EmployeeCategory = "CLINICAL" | "NON_CLINICAL";
export type CredentialType = "PROFESSIONAL_LICENSE" | "REGISTRATION" | "CERTIFICATION" | "TRAINING" | "OTHER";

export const CREDENTIAL_TYPES: { value: CredentialType; label: string; professional: boolean }[] = [
  { value: "PROFESSIONAL_LICENSE", label: "پروانه حرفه‌ای / نظام پزشکی / نظام پرستاری", professional: true },
  { value: "REGISTRATION", label: "ثبت صلاحیت حرفه‌ای", professional: true },
  { value: "CERTIFICATION", label: "گواهینامه تخصصی (BLS, ACLS, ...)", professional: false },
  { value: "TRAINING", label: "دوره آموزشی مصوب", professional: false },
  { value: "OTHER", label: "سایر مدارک", professional: false },
];
export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "LOCUM", "INTERN"] as const;
export const EMPLOYEE_STATUSES = ["ACTIVE", "ON_LEAVE", "SUSPENDED", "TERMINATED"] as const;
export const SKILL_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"] as const;

export type SessionUser = { id: string; email: string; name: string; role: Role; employeeId: string | null; permissions: string[] };
export type LoginResponse = { accessToken: string; tokenType: "Bearer"; expiresIn: number; expiresAt: string; user: SessionUser };

export type CredentialSummary = { total: number; valid: number; expiring: number; expired: number; pending: number; activeLicenses: number };

export type Employee = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  nationalId: string;
  email: string;
  phone: string;
  department: { id: number; name: string; nameFa?: string };
  jobTitle: string;
  employmentType: string;
  employeeCategory: EmployeeCategory;
  status: string;
  hireDate: string | null;
  createdAt: string;
  updatedAt: string;
  credentialSummary: CredentialSummary;
  compliance: { status: ComplianceStatus; reasons: string[] };
};

export type EmployeeSkill = { skillId: number; name: string; category: string; level: string; yearsExperience: number };

export type Credential = {
  id: string;
  employee: { id: string; employeeNumber: string; fullName: string; category: EmployeeCategory; department: { id: number; name: string } };
  credentialType: CredentialType;
  credentialName: string;
  credentialNumber: string;
  issuer: string;
  issueDate: string;
  expiryDate: string | null;
  status: CredentialStatus;
  isValid: boolean;
  daysUntilExpiry: number | null;
  documentReference: string;
  verifiedBy: { id: string; name: string | null; email: string | null } | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeDetail = Employee & { skills: EmployeeSkill[]; credentials: Credential[] };
export type Paged<T> = { data: T[]; total: number; page: number; pageSize: number; totalPages: number };
export type Department = { id: number; name: string; name_fa?: string; nameFa?: string; description: string; code?: string; headcount: number; clinicalCount: number };
export type Skill = { id: number; name: string; category: string; employeeCount: number };

export type EmployeeInput = {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  nationalId: string;
  email: string;
  phone: string;
  departmentId: number;
  jobTitle: string;
  employmentType: string;
  employeeCategory: EmployeeCategory;
  status: string;
  hireDate: string | null;
};

export type CredentialInput = {
  credentialType: CredentialType;
  credentialName: string;
  credentialNumber: string;
  issuer: string;
  issueDate: string;
  expiryDate: string | null;
  documentReference: string;
};

export type DashboardSummary = {
  asOf: string;
  employees: { total: number; clinical: number; nonClinical: number; active: number };
  credentials: { total: number; active: number; valid: number; expiringSoon: number; expiring30: number; expiring60: number; expired: number; pendingVerification: number };
  compliance: Record<ComplianceStatus, number>;
  departments: { id: number; name: string; nameFa?: string; headcount: number; clinical: number; expiring: number; expired: number }[];
  upcomingExpiries: Credential[];
  nonCompliantEmployees: { id: string; employeeNumber: string; fullName: string; jobTitle: string; department: string; reasons: string[] }[];
};

export type ExpiringResponse = {
  asOf: string;
  within30Days: { days: number; count: number; data: Credential[] };
  within60Days: { days: number; count: number; data: Credential[] };
};

// =============================================================================
// PHASE 2: SHIFT MANAGEMENT & WORKFORCE ASSIGNMENT TYPES
// =============================================================================

export type ShiftType = "MORNING" | "AFTERNOON" | "NIGHT" | "ON_CALL" | "EMERGENCY";
export type ShiftStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "RUNNING" | "COMPLETED" | "CANCELLED";
export type AssignmentStatus = "PROPOSED" | "PENDING_CONFIRMATION" | "CONFIRMED" | "REJECTED" | "CANCELLED";
export type AvailabilityReason = "AVAILABLE" | "UNAVAILABLE" | "VACATION" | "MEDICAL_LEAVE" | "TRAINING";

export type ShiftTemplate = {
  id: number;
  name_fa: string;
  department_id: number;
  department_name: string;
  department_name_fa: string;
  shift_type: ShiftType;
  start_time: string;
  end_time: string;
  required_staff_count: number;
  required_role: string | null;
  required_skill: string | null;
  description: string | null;
  active: boolean;
};

export type ShiftAssignment = {
  id: string;
  shift_id: string;
  employee_id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  full_name: string;
  job_title: string;
  employee_category: EmployeeCategory;
  assigned_by: string | null;
  assigned_by_name: string | null;
  status: AssignmentStatus;
  notes: string | null;
  rejection_reason: string | null;
  confirmed_at: string | null;
  created_at: string;
};

export type ShiftInstance = {
  id: string;
  template_id: number | null;
  jalali_date: string;
  gregorian_date: string;
  department_id: number;
  department_name: string;
  department_name_fa: string;
  department_code: string;
  shift_type: ShiftType;
  name_fa: string;
  start_time: string;
  end_time: string;
  status: ShiftStatus;
  required_staff: number;
  assigned_staff_count: number;
  required_role: string | null;
  required_skill: string | null;
  notes: string | null;
  created_by: string | null;
  created_by_name: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  assignments?: ShiftAssignment[];
  coveragePercent?: number;
  isShortage?: boolean;
};

export type EmployeeAvailability = {
  id: string;
  employee_id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  full_name: string;
  department_id: number;
  department_name_fa: string;
  date: string;
  jalali_date: string;
  available: boolean;
  reason: AvailabilityReason;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ConflictValidationResponse = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  details: {
    rule1_credentials: { passed: boolean; expiredCount: number; activeLicense: boolean; message?: string };
    rule2_overlap: { passed: boolean; overlappingShiftId?: string; message?: string };
    rule3_availability: { passed: boolean; reason?: string; notes?: string; message?: string };
    rule4_skills: { passed: boolean; requiredSkill?: string; employeeSkills: string[]; message?: string };
  };
};

export type CandidateRecommendation = {
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    jobTitle: string;
    category: EmployeeCategory;
    department: string;
  };
  validation: ConflictValidationResponse;
  score: number;
  eligible: boolean;
};

export type CandidateRecommendationsResponse = {
  shiftId: string;
  shiftName: string;
  requiredRole: string | null;
  requiredSkill: string | null;
  candidates: CandidateRecommendation[];
};

export type SupervisorDashboardData = {
  targetDate: string;
  todayShifts: ShiftInstance[];
  shortageCount: number;
  pendingApprovalCount: number;
  departmentCoverage: {
    departmentId: number;
    departmentNameFa: string;
    code: string;
    totalShifts: number;
    requiredStaff: number;
    assignedStaff: number;
    coveragePercent: number;
    isShortage: boolean;
  }[];
  staffOnDuty: {
    employee_id: string;
    full_name: string;
    job_title: string;
    shift_name: string;
    department_name_fa: string;
  }[];
};
