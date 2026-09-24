import type { Pool } from "pg";
import { audit } from "../../common/audit";
import { forbidden, notFound } from "../../common/errors";
import { withTransaction } from "../../db/pool";
import type { AuthUser } from "../auth/jwt";
import { hasPermission } from "../auth/rbac";
import { evaluateEmployeeCompliance } from "../credentials/credential.rules";
import { credentialService } from "../credentials/credential.service";
import { employeeRepository, type EmployeeRow } from "./employee.repository";
import type { CreateEmployeeInput, EmployeeSkillInput, ListEmployeesQuery, UpdateEmployeeInput } from "./employee.schema";

export function maskNationalId(value: string): string {
  return value.length <= 4 ? "••••" : `${"•".repeat(Math.min(6, value.length - 4))}${value.slice(-4)}`;
}

export function toEmployeeDto(row: EmployeeRow, viewer: AuthUser) {
  const counts = {
    total: row.total_credentials ?? 0,
    valid: row.valid_count ?? 0,
    expiring: row.expiring_count ?? 0,
    expired: row.expired_count ?? 0,
    pending: row.pending_count ?? 0,
    activeLicenses: row.active_license_count ?? 0,
  };
  const sensitive = hasPermission(viewer.role, "employees:view-sensitive") || viewer.employeeId === row.id;
  return {
    id: row.id,
    employeeNumber: row.employee_number,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: `${row.first_name} ${row.last_name}`,
    nationalId: sensitive ? row.national_id : maskNationalId(row.national_id),
    email: row.email,
    phone: row.phone,
    department: { id: row.department_id, name: row.department_name },
    jobTitle: row.job_title,
    employmentType: row.employment_type,
    employeeCategory: row.employee_category,
    status: row.status,
    hireDate: row.hire_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    credentialSummary: counts,
    compliance: evaluateEmployeeCompliance(row.employee_category, counts),
  };
}

/** EMPLOYEE role may only access its own record. */
export function assertCanReadEmployee(user: AuthUser, employeeId: string): void {
  if (hasPermission(user.role, "employees:read")) return;
  if (hasPermission(user.role, "employees:read:self") && user.employeeId === employeeId) return;
  throw forbidden("You can only access your own employee record");
}

export const employeeService = {
  async list(pool: Pool, q: ListEmployeesQuery, user: AuthUser) {
    const { rows, total } = await employeeRepository.list(pool, q);
    return { data: rows.map((r) => toEmployeeDto(r, user)), total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
  },

  async get(pool: Pool, id: string, user: AuthUser) {
    assertCanReadEmployee(user, id);
    const row = await employeeRepository.findById(pool, id);
    if (!row) throw notFound("Employee");
    const [skills, credentials] = await Promise.all([employeeRepository.skills(pool, id), credentialService.listForEmployee(pool, id, user)]);
    return {
      ...toEmployeeDto(row, user),
      skills: skills.map((s: { skill_id: number; name: string; category: string; level: string; years_experience: number }) => ({ skillId: s.skill_id, name: s.name, category: s.category, level: s.level, yearsExperience: s.years_experience })),
      credentials,
    };
  },

  async create(pool: Pool, input: CreateEmployeeInput, user: AuthUser) {
    const id = await withTransaction(pool, async (tx) => {
      const newId = await employeeRepository.insert(tx, input);
      await audit(tx, user, "EMPLOYEE_CREATED", "employee", newId, { employeeNumber: input.employeeNumber });
      return newId;
    });
    return this.get(pool, id, user);
  },

  async update(pool: Pool, id: string, input: UpdateEmployeeInput, user: AuthUser) {
    await withTransaction(pool, async (tx) => {
      const before = await employeeRepository.findById(tx, id);
      if (!before) throw notFound("Employee");
      await employeeRepository.update(tx, id, input);
      const changed = Object.keys(input).filter((k) => k !== "nationalId");
      await audit(tx, user, "EMPLOYEE_UPDATED", "employee", id, { fields: changed, ...(input.nationalId ? { nationalId: "changed" } : {}) });
    });
    return this.get(pool, id, user);
  },

  async remove(pool: Pool, id: string, user: AuthUser) {
    await withTransaction(pool, async (tx) => {
      if (!(await employeeRepository.softDelete(tx, id))) throw notFound("Employee");
      await audit(tx, user, "EMPLOYEE_DELETED", "employee", id, { mode: "soft-delete" });
    });
  },

  async upsertSkill(pool: Pool, id: string, input: EmployeeSkillInput, user: AuthUser) {
    if (!(await employeeRepository.findById(pool, id))) throw notFound("Employee");
    await employeeRepository.upsertSkill(pool, id, input);
    await audit(pool, user, "EMPLOYEE_SKILL_SET", "employee", id, { ...input });
    return employeeRepository.skills(pool, id);
  },

  async removeSkill(pool: Pool, id: string, skillId: number, user: AuthUser) {
    if (!(await employeeRepository.removeSkill(pool, id, skillId))) throw notFound("Employee skill");
    await audit(pool, user, "EMPLOYEE_SKILL_REMOVED", "employee", id, { skillId });
  },
};
