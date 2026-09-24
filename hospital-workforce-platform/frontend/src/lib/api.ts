import type {
  Credential, CredentialInput, DashboardSummary, Department, Employee, EmployeeDetail, EmployeeInput,
  EmployeeSkill, ExpiringResponse, LoginResponse, Paged, SessionUser, Skill,
} from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api/v1";
const SESSION_KEY = "hwdt.session";

export type Session = { accessToken: string; expiresAt: string; user: SessionUser };

/** JWT session kept in sessionStorage (cleared when the tab closes); expired sessions are discarded. */
export const sessionStore = {
  get(): Session | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as Session;
      if (Date.parse(s.expiresAt) <= Date.now()) {
        window.sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
    } catch {
      return null;
    }
  },
  set(s: Session) {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  },
  clear() {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(SESSION_KEY);
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { field: string; message: string }[],
  ) {
    super(message);
  }
  fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.details ?? []).map((d) => [d.field, d.message]));
  }
}

type Query = Record<string, string | number | undefined | null>;

export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown; query?: Query } = {}): Promise<T> {
  const qs = init.query
    ? new URLSearchParams(Object.entries(init.query).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])).toString()
    : "";
  const session = sessionStore.get();
  const res = await fetch(`${API_BASE}${path}${qs ? `?${qs}` : ""}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401 && session) {
    sessionStore.clear();
    window.dispatchEvent(new Event("hwdt:unauthorized"));
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as { error?: { code: string; message: string; details?: { field: string; message: string }[] } } | null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? "HTTP_ERROR", data?.error?.message ?? `Request failed (${res.status})`, data?.error?.details);
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) => apiFetch<LoginResponse>("/auth/login", { method: "POST", body: { email, password } }),
  demoAccounts: () => apiFetch<{ enabled: boolean; password?: string; accounts: { email: string; name: string; role: string }[] }>("/auth/demo-accounts"),

  dashboard: () => apiFetch<DashboardSummary>("/dashboard/summary"),

  listEmployees: (q: Query) => apiFetch<Paged<Employee>>("/employees", { query: q }),
  jobTitles: () => apiFetch<{ data: string[] }>("/employees/job-titles"),
  getEmployee: (id: string) => apiFetch<EmployeeDetail>(`/employees/${id}`),
  createEmployee: (body: EmployeeInput) => apiFetch<EmployeeDetail>("/employees", { method: "POST", body }),
  updateEmployee: (id: string, body: Partial<EmployeeInput>) => apiFetch<EmployeeDetail>(`/employees/${id}`, { method: "PUT", body }),
  deleteEmployee: (id: string) => apiFetch<void>(`/employees/${id}`, { method: "DELETE" }),
  addSkill: (id: string, body: { skillId: number; level: string; yearsExperience: number }) =>
    apiFetch<{ data: EmployeeSkill[] }>(`/employees/${id}/skills`, { method: "POST", body }),
  removeSkill: (id: string, skillId: number) => apiFetch<void>(`/employees/${id}/skills/${skillId}`, { method: "DELETE" }),

  listCredentials: (q: Query) => apiFetch<{ asOf: string; count: number; data: Credential[] }>("/credentials", { query: q }),
  employeeCredentials: (employeeId: string) => apiFetch<{ count: number; data: Credential[] }>(`/employees/${employeeId}/credentials`),
  createCredential: (employeeId: string, body: CredentialInput) => apiFetch<Credential>(`/employees/${employeeId}/credentials`, { method: "POST", body }),
  updateCredential: (id: string, body: Partial<CredentialInput>) => apiFetch<Credential>(`/credentials/${id}`, { method: "PUT", body }),
  verifyCredential: (id: string) => apiFetch<Credential>(`/credentials/${id}/verify`, { method: "POST" }),
  deleteCredential: (id: string) => apiFetch<void>(`/credentials/${id}`, { method: "DELETE" }),
  expiring: () => apiFetch<ExpiringResponse>("/credentials/expiring"),
  expired: () => apiFetch<{ asOf: string; count: number; data: Credential[] }>("/credentials/expired"),

  departments: () => apiFetch<{ data: Department[] }>("/departments"),
  createDepartment: (body: { name: string; description: string }) => apiFetch<Department>("/departments", { method: "POST", body }),
  deleteDepartment: (id: number) => apiFetch<void>(`/departments/${id}`, { method: "DELETE" }),
  skills: () => apiFetch<{ data: Skill[] }>("/skills"),
  createSkill: (body: { name: string; category: string }) => apiFetch<Skill>("/skills", { method: "POST", body }),
  deleteSkill: (id: number) => apiFetch<void>(`/skills/${id}`, { method: "DELETE" }),

  // ---------------------------------------------------------------------------
  // Phase 2: Shift Management & Assignments
  // ---------------------------------------------------------------------------
  listShifts: (q?: Query) => apiFetch<{ count: number; data: import("./types").ShiftInstance[] }>("/shifts", { query: q }),
  getShift: (id: string) => apiFetch<import("./types").ShiftInstance>(`/shifts/${id}`),
  createShift: (body: any) => apiFetch<import("./types").ShiftInstance>("/shifts", { method: "POST", body }),
  updateShift: (id: string, body: any) => apiFetch<import("./types").ShiftInstance>(`/shifts/${id}`, { method: "PUT", body }),
  deleteShift: (id: string) => apiFetch<void>(`/shifts/${id}`, { method: "DELETE" }),
  approveShift: (id: string) => apiFetch<import("./types").ShiftInstance>(`/shifts/${id}/approve`, { method: "POST" }),
  validateShift: (id: string, employeeId: string) =>
    apiFetch<import("./types").ConflictValidationResponse>(`/shifts/${id}/validate`, { method: "POST", body: { employeeId } }),
  candidatesForShift: (id: string) =>
    apiFetch<import("./types").CandidateRecommendationsResponse>(`/shifts/${id}/candidates`),
  assignEmployee: (shiftId: string, body: { employeeId: string; status?: string; notes?: string; forceOverride?: boolean }) =>
    apiFetch<{ assignment: import("./types").ShiftAssignment; validation: import("./types").ConflictValidationResponse; shift: import("./types").ShiftInstance }>(
      `/shifts/${shiftId}/assign`,
      { method: "POST", body },
    ),
  removeAssignment: (assignmentId: string) => apiFetch<void>(`/assignments/${assignmentId}`, { method: "DELETE" }),
  shiftAssignments: (shiftId: string) => apiFetch<{ data: import("./types").ShiftAssignment[] }>(`/shifts/${shiftId}/assignments`),

  shiftTemplates: (deptId?: number) => apiFetch<{ data: import("./types").ShiftTemplate[] }>("/shift-templates", { query: { departmentId: deptId } }),
  createShiftTemplate: (body: any) => apiFetch<import("./types").ShiftTemplate>("/shift-templates", { method: "POST", body }),

  supervisorDashboard: (date?: string) => apiFetch<import("./types").SupervisorDashboardData>("/supervisor/dashboard", { query: { date } }),

  setAvailability: (body: { employeeId: string; date?: string; jalaliDate?: string; available: boolean; reason?: string; notes?: string }) =>
    apiFetch<import("./types").EmployeeAvailability>("/availability", { method: "POST", body }),
  employeeAvailability: (empId: string, startDate?: string, endDate?: string) =>
    apiFetch<{ employeeId: string; count: number; data: import("./types").EmployeeAvailability[] }>(`/employees/${empId}/availability`, { query: { startDate, endDate } }),
  listAvailability: (startDate?: string, endDate?: string, deptId?: number) =>
    apiFetch<{ startDate: string; endDate: string; count: number; data: import("./types").EmployeeAvailability[] }>("/availability", { query: { startDate, endDate, departmentId: deptId } }),
};
