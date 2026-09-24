import type { Db } from "../../db/pool";
import type {
  CreateShiftInstanceInput,
  CreateShiftTemplateInput,
  ListShiftsQuery,
  ShiftStatus,
  UpdateShiftInstanceInput,
} from "./shift.schema";

export type ShiftInstanceRow = {
  id: string;
  template_id: number | null;
  jalali_date: string;
  gregorian_date: string;
  department_id: number;
  department_name: string;
  department_name_fa: string;
  department_code: string;
  shift_type: string;
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
  approved_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type ShiftAssignmentRow = {
  id: string;
  shift_id: string;
  employee_id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  full_name: string;
  job_title: string;
  employee_category: string;
  assigned_by: string | null;
  assigned_by_name: string | null;
  status: string;
  notes: string | null;
  rejection_reason: string | null;
  confirmed_at: Date | null;
  created_at: Date;
};

export type ShiftTemplateRow = {
  id: number;
  name_fa: string;
  department_id: number;
  department_name: string;
  department_name_fa: string;
  shift_type: string;
  start_time: string;
  end_time: string;
  required_staff_count: number;
  required_role: string | null;
  required_skill: string | null;
  description: string | null;
  active: boolean;
};

const SHIFT_SELECT = `
  SELECT si.id, si.template_id, si.jalali_date, si.gregorian_date::text AS gregorian_date,
         si.department_id, d.name AS department_name, COALESCE(d.name_fa, d.name) AS department_name_fa,
         COALESCE(d.code, '') AS department_code,
         si.shift_type, si.name_fa, si.start_time::text AS start_time, si.end_time::text AS end_time,
         si.status, si.required_staff, si.assigned_staff_count,
         si.required_role, si.required_skill, si.notes,
         si.created_by, uc.full_name AS created_by_name,
         si.approved_by, ua.full_name AS approved_by_name,
         si.approved_at, si.created_at, si.updated_at
    FROM shift.shift_instances si
    JOIN workforce.departments d ON d.id = si.department_id
    LEFT JOIN iam.users uc ON uc.id = si.created_by
    LEFT JOIN iam.users ua ON ua.id = si.approved_by`;

export const shiftRepository = {
  async findById(db: Db, id: string): Promise<ShiftInstanceRow | undefined> {
    const { rows } = await db.query<ShiftInstanceRow>(`${SHIFT_SELECT} WHERE si.id = $1`, [id]);
    return rows[0];
  },

  async list(db: Db, q: ListShiftsQuery): Promise<ShiftInstanceRow[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, val: unknown) => {
      params.push(val);
      where.push(sql.replaceAll("$?", `$${params.length}`));
    };

    if (q.departmentId) add("si.department_id = $?", q.departmentId);
    if (q.status) add("si.status = $?", q.status);
    if (q.shiftType) add("si.shift_type = $?", q.shiftType);
    if (q.date) add("si.gregorian_date = $?", q.date);
    if (q.startDate) add("si.gregorian_date >= $?", q.startDate);
    if (q.endDate) add("si.gregorian_date <= $?", q.endDate);
    if (q.jalaliDate) add("si.jalali_date = $?", q.jalaliDate);

    params.push(q.limit);
    const filter = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const sql = `${SHIFT_SELECT}${filter} ORDER BY si.gregorian_date DESC, si.start_time ASC LIMIT $${params.length}`;
    return (await db.query<ShiftInstanceRow>(sql, params)).rows;
  },

  async insert(db: Db, input: CreateShiftInstanceInput, userId: string | null): Promise<string> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO shift.shift_instances
         (template_id, jalali_date, gregorian_date, department_id, shift_type, name_fa,
          start_time, end_time, status, required_staff, required_role, required_skill, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::time, $8::time, 'DRAFT', $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        input.templateId ?? null,
        input.jalaliDate,
        input.gregorianDate,
        input.departmentId,
        input.shiftType,
        input.nameFa,
        input.startTime,
        input.endTime,
        input.requiredStaff,
        input.requiredRole ?? null,
        input.requiredSkill ?? null,
        input.notes ?? null,
        userId,
      ],
    );
    return r.rows[0].id;
  },

  async update(db: Db, id: string, input: UpdateShiftInstanceInput): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [id];
    let idx = 2;

    if (input.nameFa !== undefined) { sets.push(`name_fa = $${idx++}`); params.push(input.nameFa); }
    if (input.shiftType !== undefined) { sets.push(`shift_type = $${idx++}`); params.push(input.shiftType); }
    if (input.startTime !== undefined) { sets.push(`start_time = $${idx++}::time`); params.push(input.startTime); }
    if (input.endTime !== undefined) { sets.push(`end_time = $${idx++}::time`); params.push(input.endTime); }
    if (input.requiredStaff !== undefined) { sets.push(`required_staff = $${idx++}`); params.push(input.requiredStaff); }
    if (input.requiredRole !== undefined) { sets.push(`required_role = $${idx++}`); params.push(input.requiredRole); }
    if (input.requiredSkill !== undefined) { sets.push(`required_skill = $${idx++}`); params.push(input.requiredSkill); }
    if (input.status !== undefined) { sets.push(`status = $${idx++}`); params.push(input.status); }
    if (input.notes !== undefined) { sets.push(`notes = $${idx++}`); params.push(input.notes); }

    if (!sets.length) return;
    await db.query(`UPDATE shift.shift_instances SET ${sets.join(", ")} WHERE id = $1`, params);
  },

  async setStatus(db: Db, id: string, status: ShiftStatus, approvedBy: string | null = null): Promise<void> {
    if (status === "APPROVED") {
      await db.query(
        "UPDATE shift.shift_instances SET status = $2, approved_by = $3, approved_at = now() WHERE id = $1",
        [id, status, approvedBy],
      );
    } else {
      await db.query(
        "UPDATE shift.shift_instances SET status = $2 WHERE id = $1",
        [id, status],
      );
    }
  },

  async delete(db: Db, id: string): Promise<boolean> {
    const r = await db.query("DELETE FROM shift.shift_instances WHERE id = $1", [id]);
    return (r.rowCount ?? 0) > 0;
  },

  // ---------------------------------------------------------------------------
  // Assignments
  // ---------------------------------------------------------------------------
  async listAssignments(db: Db, shiftId: string): Promise<ShiftAssignmentRow[]> {
    const sql = `
      SELECT sa.id, sa.shift_id, sa.employee_id, e.employee_number, e.first_name, e.last_name,
             (e.first_name || ' ' || e.last_name) AS full_name, e.job_title, e.employee_category,
             sa.assigned_by, u.full_name AS assigned_by_name,
             sa.status, sa.notes, sa.rejection_reason, sa.confirmed_at, sa.created_at
        FROM shift.shift_assignments sa
        JOIN workforce.employees e ON e.id = sa.employee_id
        LEFT JOIN iam.users u ON u.id = sa.assigned_by
       WHERE sa.shift_id = $1
       ORDER BY sa.created_at ASC`;
    return (await db.query<ShiftAssignmentRow>(sql, [shiftId])).rows;
  },

  async findAssignmentById(db: Db, assignmentId: string): Promise<ShiftAssignmentRow | undefined> {
    const sql = `
      SELECT sa.id, sa.shift_id, sa.employee_id, e.employee_number, e.first_name, e.last_name,
             (e.first_name || ' ' || e.last_name) AS full_name, e.job_title, e.employee_category,
             sa.assigned_by, u.full_name AS assigned_by_name,
             sa.status, sa.notes, sa.rejection_reason, sa.confirmed_at, sa.created_at
        FROM shift.shift_assignments sa
        JOIN workforce.employees e ON e.id = sa.employee_id
        LEFT JOIN iam.users u ON u.id = sa.assigned_by
       WHERE sa.id = $1`;
    const { rows } = await db.query<ShiftAssignmentRow>(sql, [assignmentId]);
    return rows[0];
  },

  async insertAssignment(
    db: Db,
    shiftId: string,
    employeeId: string,
    assignedBy: string | null,
    status = "CONFIRMED",
    notes: string | null = null,
  ): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO shift.shift_assignments (shift_id, employee_id, assigned_by, status, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (shift_id, employee_id) DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes
       RETURNING id`,
      [shiftId, employeeId, assignedBy, status, notes],
    );
    return rows[0].id;
  },

  async deleteAssignment(db: Db, assignmentId: string): Promise<boolean> {
    const r = await db.query("DELETE FROM shift.shift_assignments WHERE id = $1", [assignmentId]);
    return (r.rowCount ?? 0) > 0;
  },

  // ---------------------------------------------------------------------------
  // Shift Templates
  // ---------------------------------------------------------------------------
  async listTemplates(db: Db, departmentId?: number): Promise<ShiftTemplateRow[]> {
    const where = departmentId ? "WHERE st.department_id = $1 AND st.active = TRUE" : "WHERE st.active = TRUE";
    const params = departmentId ? [departmentId] : [];
    const sql = `
      SELECT st.id, st.name_fa, st.department_id, d.name AS department_name,
             COALESCE(d.name_fa, d.name) AS department_name_fa,
             st.shift_type, st.start_time::text AS start_time, st.end_time::text AS end_time,
             st.required_staff_count, st.required_role, st.required_skill, st.description, st.active
        FROM shift.shift_templates st
        JOIN workforce.departments d ON d.id = st.department_id
       ${where}
       ORDER BY d.name_fa, st.start_time ASC`;
    return (await db.query<ShiftTemplateRow>(sql, params)).rows;
  },

  async insertTemplate(db: Db, input: CreateShiftTemplateInput, userId: string | null): Promise<number> {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO shift.shift_templates
         (name_fa, department_id, shift_type, start_time, end_time, required_staff_count, required_role, required_skill, description, created_by)
       VALUES ($1, $2, $3, $4::time, $5::time, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        input.nameFa,
        input.departmentId,
        input.shiftType,
        input.startTime,
        input.endTime,
        input.requiredStaffCount,
        input.requiredRole ?? null,
        input.requiredSkill ?? null,
        input.description ?? null,
        userId,
      ],
    );
    return rows[0].id;
  },

  // ---------------------------------------------------------------------------
  // Supervisor Dashboard aggregates
  // ---------------------------------------------------------------------------
  async getSupervisorDashboardData(db: Db, targetDate: string) {
    const [todayShiftsRes, shortageRes, pendingApprovalRes, deptCoverageRes, staffOnDutyRes] = await Promise.all([
      db.query<ShiftInstanceRow>(
        `${SHIFT_SELECT} WHERE si.gregorian_date = $1 ORDER BY si.start_time ASC`,
        [targetDate],
      ),
      db.query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM shift.shift_instances
          WHERE gregorian_date >= $1
            AND status NOT IN ('CANCELLED', 'COMPLETED')
            AND assigned_staff_count < required_staff`,
        [targetDate],
      ),
      db.query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM shift.shift_instances
          WHERE status = 'PENDING_APPROVAL'`,
      ),
      db.query<{
        department_id: number;
        department_name_fa: string;
        department_code: string;
        total_shifts: number;
        required_sum: number;
        assigned_sum: number;
      }>(
        `SELECT d.id AS department_id, COALESCE(d.name_fa, d.name) AS department_name_fa,
                COALESCE(d.code, '') AS department_code,
                count(si.id)::int AS total_shifts,
                COALESCE(sum(si.required_staff), 0)::int AS required_sum,
                COALESCE(sum(si.assigned_staff_count), 0)::int AS assigned_sum
           FROM workforce.departments d
           LEFT JOIN shift.shift_instances si ON si.department_id = d.id
                 AND si.gregorian_date = $1
                 AND si.status <> 'CANCELLED'
          WHERE d.active = TRUE
          GROUP BY d.id, d.name_fa, d.name, d.code
          ORDER BY total_shifts DESC, d.id ASC`,
        [targetDate],
      ),
      db.query<{
        employee_id: string;
        full_name: string;
        job_title: string;
        shift_name: string;
        department_name_fa: string;
      }>(
        `SELECT e.id AS employee_id, (e.first_name || ' ' || e.last_name) AS full_name,
                e.job_title, si.name_fa AS shift_name, COALESCE(d.name_fa, d.name) AS department_name_fa
           FROM shift.shift_assignments sa
           JOIN shift.shift_instances si ON si.id = sa.shift_id
           JOIN workforce.employees e ON e.id = sa.employee_id
           JOIN workforce.departments d ON d.id = si.department_id
          WHERE si.gregorian_date = $1
            AND sa.status IN ('CONFIRMED', 'PROPOSED')
            AND si.status IN ('APPROVED', 'RUNNING')
          ORDER BY si.start_time ASC
          LIMIT 10`,
        [targetDate],
      ),
    ]);

    return {
      targetDate,
      todayShifts: todayShiftsRes.rows,
      shortageCount: shortageRes.rows[0]?.count ?? 0,
      pendingApprovalCount: pendingApprovalRes.rows[0]?.count ?? 0,
      departmentCoverage: deptCoverageRes.rows.map((d) => {
        const pct = d.required_sum > 0 ? Math.min(100, Math.round((d.assigned_sum / d.required_sum) * 100)) : 100;
        return {
          departmentId: d.department_id,
          departmentNameFa: d.department_name_fa,
          code: d.department_code,
          totalShifts: d.total_shifts,
          requiredStaff: d.required_sum,
          assignedStaff: d.assigned_sum,
          coveragePercent: pct,
          isShortage: d.assigned_sum < d.required_sum,
        };
      }),
      staffOnDuty: staffOnDutyRes.rows,
    };
  },
};
