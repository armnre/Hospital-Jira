import type { Pool } from "pg";
import { audit } from "../../common/audit";
import { todayUtc } from "../../common/dates";
import { businessRule, notFound } from "../../common/errors";
import { withTransaction } from "../../db/pool";
import type { AuthUser } from "../auth/jwt";
import { conflictEngine } from "./conflict.engine";
import { shiftRepository } from "./shift.repository";
import type {
  AssignEmployeeInput,
  CreateShiftInstanceInput,
  CreateShiftTemplateInput,
  ListShiftsQuery,
  UpdateShiftInstanceInput,
} from "./shift.schema";

export const shiftService = {
  async list(pool: Pool, query: ListShiftsQuery) {
    const shifts = await shiftRepository.list(pool, query);
    return {
      count: shifts.length,
      data: shifts,
    };
  },

  async get(pool: Pool, id: string) {
    const shift = await shiftRepository.findById(pool, id);
    if (!shift) throw notFound("شیفت");
    const assignments = await shiftRepository.listAssignments(pool, id);
    return {
      ...shift,
      assignments,
      coveragePercent: shift.required_staff > 0 ? Math.min(100, Math.round((shift.assigned_staff_count / shift.required_staff) * 100)) : 100,
      isShortage: shift.assigned_staff_count < shift.required_staff,
    };
  },

  async create(pool: Pool, input: CreateShiftInstanceInput, user: AuthUser) {
    const id = await withTransaction(pool, async (tx) => {
      const shiftId = await shiftRepository.insert(tx, input, user.id);
      await audit(tx, user, "SHIFT_CREATED", "shift", shiftId, {
        nameFa: input.nameFa,
        shiftType: input.shiftType,
        gregorianDate: input.gregorianDate,
        jalaliDate: input.jalaliDate,
        departmentId: input.departmentId,
        requiredStaff: input.requiredStaff,
      });
      return shiftId;
    });
    return this.get(pool, id);
  },

  async update(pool: Pool, id: string, input: UpdateShiftInstanceInput, user: AuthUser) {
    const before = await shiftRepository.findById(pool, id);
    if (!before) throw notFound("شیفت");

    await withTransaction(pool, async (tx) => {
      await shiftRepository.update(tx, id, input);
      await audit(tx, user, "SHIFT_UPDATED", "shift", id, input);
    });
    return this.get(pool, id);
  },

  async approve(pool: Pool, id: string, user: AuthUser) {
    const before = await shiftRepository.findById(pool, id);
    if (!before) throw notFound("شیفت");

    await withTransaction(pool, async (tx) => {
      await shiftRepository.setStatus(tx, id, "APPROVED", user.id);
      await audit(tx, user, "SHIFT_APPROVED", "shift", id, { approvedBy: user.name });
    });
    return this.get(pool, id);
  },

  async delete(pool: Pool, id: string, user: AuthUser) {
    const before = await shiftRepository.findById(pool, id);
    if (!before) throw notFound("شیفت");

    await withTransaction(pool, async (tx) => {
      await shiftRepository.delete(tx, id);
      await audit(tx, user, "SHIFT_DELETED", "shift", id, { nameFa: before.name_fa });
    });
  },

  /**
   * Conflict Detection Engine Validation API (Rule 1, 2, 3, 4)
   */
  async validateCandidate(pool: Pool, shiftId: string, employeeId: string) {
    return conflictEngine.validateCandidate(pool, shiftId, employeeId);
  },

  /**
   * Assign employee to shift, enforcing the 4 Hard Business Rules.
   */
  async assignEmployee(pool: Pool, shiftId: string, input: AssignEmployeeInput, user: AuthUser) {
    const shift = await shiftRepository.findById(pool, shiftId);
    if (!shift) throw notFound("شیفت");

    // Run Conflict Detection Engine!
    const validation = await conflictEngine.validateCandidate(pool, shiftId, input.employeeId);

    if (!validation.valid && !input.forceOverride) {
      throw businessRule("ASSIGNMENT_CONFLICT", validation.errors.join(" | "));
    }

    const assignmentId = await withTransaction(pool, async (tx) => {
      const id = await shiftRepository.insertAssignment(
        tx,
        shiftId,
        input.employeeId,
        user.id,
        input.status,
        input.notes,
      );
      await audit(tx, user, "EMPLOYEE_ASSIGNED", "shift_assignment", id, {
        shiftId,
        employeeId: input.employeeId,
        status: input.status,
        overridden: !validation.valid && input.forceOverride,
        warnings: validation.warnings,
      });
      return id;
    });

    const assignment = await shiftRepository.findAssignmentById(pool, assignmentId);
    return {
      assignment,
      validation,
      shift: await this.get(pool, shiftId),
    };
  },

  async removeAssignment(pool: Pool, assignmentId: string, user: AuthUser) {
    const existing = await shiftRepository.findAssignmentById(pool, assignmentId);
    if (!existing) throw notFound("تخصیص شیفت");

    await withTransaction(pool, async (tx) => {
      await shiftRepository.deleteAssignment(tx, assignmentId);
      await audit(tx, user, "EMPLOYEE_REMOVED", "shift_assignment", assignmentId, {
        shiftId: existing.shift_id,
        employeeId: existing.employee_id,
      });
    });
  },

  async listAssignments(pool: Pool, shiftId: string) {
    return shiftRepository.listAssignments(pool, shiftId);
  },

  // ---------------------------------------------------------------------------
  // Recommendations / Candidates evaluation (Phase 3 AI Preparation)
  // ---------------------------------------------------------------------------
  async getEligibleCandidates(pool: Pool, shiftId: string) {
    const shift = await shiftRepository.findById(pool, shiftId);
    if (!shift) throw notFound("شیفت");

    // Query active employees in the department or matching role
    const { rows: employees } = await pool.query<{
      id: string;
      employee_number: string;
      first_name: string;
      last_name: string;
      employee_category: string;
      job_title: string;
      department_name_fa: string;
    }>(
      `SELECT e.id, e.employee_number, e.first_name, e.last_name, e.employee_category, e.job_title,
              COALESCE(d.name_fa, d.name) AS department_name_fa
         FROM workforce.employees e
         JOIN workforce.departments d ON d.id = e.department_id
        WHERE e.status = 'ACTIVE' AND e.deleted_at IS NULL
          AND (e.department_id = $1 OR e.employee_category = 'CLINICAL')
        ORDER BY (e.department_id = $1) DESC, e.last_name ASC`,
      [shift.department_id],
    );

    // Evaluate each candidate with the conflict detection engine
    const candidates = await Promise.all(
      employees.map(async (emp) => {
        const val = await conflictEngine.validateCandidate(pool, shiftId, emp.id);
        let score = 50; // base score
        if (val.valid) score += 30;
        if (val.details.rule1_credentials.passed) score += 10;
        if (val.details.rule4_skills.passed) score += 10;

        return {
          employee: {
            id: emp.id,
            employeeNumber: emp.employee_number,
            fullName: `${emp.first_name} ${emp.last_name}`,
            jobTitle: emp.job_title,
            category: emp.employee_category,
            department: emp.department_name_fa,
          },
          validation: val,
          score,
          eligible: val.valid,
        };
      }),
    );

    // Sort by eligible first, then score descending
    candidates.sort((a, b) => (b.eligible ? 1 : 0) - (a.eligible ? 1 : 0) || b.score - a.score);

    return {
      shiftId,
      shiftName: shift.name_fa,
      requiredRole: shift.required_role,
      requiredSkill: shift.required_skill,
      candidates,
    };
  },

  // ---------------------------------------------------------------------------
  // Templates
  // ---------------------------------------------------------------------------
  async listTemplates(pool: Pool, departmentId?: number) {
    return shiftRepository.listTemplates(pool, departmentId);
  },

  async createTemplate(pool: Pool, input: CreateShiftTemplateInput, user: AuthUser) {
    const id = await shiftRepository.insertTemplate(pool, input, user.id);
    const list = await shiftRepository.listTemplates(pool);
    return list.find((t) => t.id === id);
  },

  // ---------------------------------------------------------------------------
  // Supervisor Dashboard
  // ---------------------------------------------------------------------------
  async getSupervisorDashboard(pool: Pool, targetDate?: string) {
    const date = targetDate ?? todayUtc();
    return shiftRepository.getSupervisorDashboardData(pool, date);
  },
};
