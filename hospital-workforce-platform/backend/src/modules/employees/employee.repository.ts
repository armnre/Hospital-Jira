import type { Db } from "../../db/pool";
import type { CreateEmployeeInput, EmployeeSkillInput, ListEmployeesQuery, UpdateEmployeeInput } from "./employee.schema";

export type EmployeeRow = {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  national_id: string;
  email: string;
  phone: string;
  department_id: number;
  department_name: string;
  job_title: string;
  employment_type: string;
  employee_category: "CLINICAL" | "NON_CLINICAL";
  status: string;
  hire_date: string | null;
  created_at: Date;
  updated_at: Date;
  total_credentials: number;
  valid_count: number;
  expiring_count: number;
  expired_count: number;
  pending_count: number;
  active_license_count: number;
};

const SELECT = `
  SELECT e.id, e.employee_number, e.first_name, e.last_name, e.national_id, e.email, e.phone,
         e.department_id, d.name AS department_name, e.job_title, e.employment_type, e.employee_category,
         e.status, e.hire_date, e.created_at, e.updated_at,
         c.total_credentials, c.valid_count, c.expiring_count, c.expired_count, c.pending_count, c.active_license_count
    FROM workforce.employees e
    JOIN workforce.departments d ON d.id = e.department_id
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS total_credentials,
             count(*) FILTER (WHERE vc.computed_status = 'VALID')::int                AS valid_count,
             count(*) FILTER (WHERE vc.computed_status = 'EXPIRING_SOON')::int        AS expiring_count,
             count(*) FILTER (WHERE vc.computed_status = 'EXPIRED')::int              AS expired_count,
             count(*) FILTER (WHERE vc.computed_status = 'PENDING_VERIFICATION')::int AS pending_count,
             count(*) FILTER (WHERE vc.credential_type IN ('PROFESSIONAL_LICENSE','REGISTRATION')
                                AND vc.computed_status IN ('VALID','EXPIRING_SOON'))::int AS active_license_count
        FROM credential.v_credentials vc WHERE vc.employee_id = e.id
    ) c ON TRUE
   WHERE e.deleted_at IS NULL`;

const SORT: Record<ListEmployeesQuery["sort"], string> = {
  name: "lower(e.last_name) %d, lower(e.first_name) %d",
  employeeNumber: "e.employee_number %d",
  department: "lower(d.name) %d, lower(e.last_name) ASC",
  jobTitle: "lower(e.job_title) %d, lower(e.last_name) ASC",
  createdAt: "e.created_at %d",
};

const COLUMNS: Record<keyof UpdateEmployeeInput, string> = {
  employeeNumber: "employee_number",
  firstName: "first_name",
  lastName: "last_name",
  nationalId: "national_id",
  email: "email",
  phone: "phone",
  departmentId: "department_id",
  jobTitle: "job_title",
  employmentType: "employment_type",
  employeeCategory: "employee_category",
  status: "status",
  hireDate: "hire_date",
};

export const employeeRepository = {
  async list(db: Db, q: ListEmployeesQuery): Promise<{ rows: EmployeeRow[]; total: number }> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      where.push(sql.replaceAll("$?", `$${params.length}`));
    };
    if (q.search) {
      add(
        `(e.first_name || ' ' || e.last_name ILIKE $? OR e.employee_number ILIKE $? OR e.email ILIKE $? OR e.job_title ILIKE $?)`,
        `%${q.search.replace(/[%_\\]/g, (m) => `\\${m}`)}%`,
      );
    }
    if (q.departmentId) add("e.department_id = $?", q.departmentId);
    if (q.jobTitle) add("lower(e.job_title) = lower($?)", q.jobTitle);
    if (q.category) add("e.employee_category = $?", q.category);
    if (q.status) add("e.status = $?", q.status);
    const filter = where.length ? ` AND ${where.join(" AND ")}` : "";
    const order = SORT[q.sort].replaceAll("%d", q.order === "desc" ? "DESC" : "ASC");
    const total = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM workforce.employees e WHERE e.deleted_at IS NULL${filter}`, params)).rows[0].n;
    const rows = (
      await db.query<EmployeeRow>(`${SELECT}${filter} ORDER BY ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [
        ...params,
        q.pageSize,
        (q.page - 1) * q.pageSize,
      ])
    ).rows;
    return { rows, total };
  },

  async findById(db: Db, id: string): Promise<EmployeeRow | undefined> {
    return (await db.query<EmployeeRow>(`${SELECT} AND e.id = $1`, [id])).rows[0];
  },

  async insert(db: Db, input: CreateEmployeeInput): Promise<string> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO workforce.employees
         (employee_number, first_name, last_name, national_id, email, phone, department_id, job_title,
          employment_type, employee_category, status, hire_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        input.employeeNumber, input.firstName, input.lastName, input.nationalId, input.email, input.phone,
        input.departmentId, input.jobTitle, input.employmentType, input.employeeCategory, input.status, input.hireDate,
      ],
    );
    return r.rows[0].id;
  },

  async update(db: Db, id: string, input: UpdateEmployeeInput): Promise<void> {
    const entries = Object.entries(input).filter(([, v]) => v !== undefined) as [keyof UpdateEmployeeInput, unknown][];
    if (!entries.length) return;
    const sets = entries.map(([k], i) => `${COLUMNS[k]} = $${i + 2}`);
    await db.query(`UPDATE workforce.employees SET ${sets.join(", ")} WHERE id = $1 AND deleted_at IS NULL`, [id, ...entries.map(([, v]) => v)]);
  },

  async softDelete(db: Db, id: string): Promise<boolean> {
    const r = await db.query(
      "UPDATE workforce.employees SET deleted_at = now(), status = 'TERMINATED' WHERE id = $1 AND deleted_at IS NULL",
      [id],
    );
    return (r.rowCount ?? 0) > 0;
  },

  async jobTitles(db: Db): Promise<string[]> {
    return (await db.query<{ job_title: string }>("SELECT DISTINCT job_title FROM workforce.employees WHERE deleted_at IS NULL ORDER BY job_title")).rows.map((r) => r.job_title);
  },

  async skills(db: Db, employeeId: string) {
    return (
      await db.query<{ skill_id: number; name: string; category: string; level: string; years_experience: number }>(
        `SELECT es.skill_id, s.name, s.category, es.level, es.years_experience
           FROM workforce.employee_skills es JOIN workforce.skills s ON s.id = es.skill_id
          WHERE es.employee_id = $1 ORDER BY s.category, s.name`,
        [employeeId],
      )
    ).rows;
  },

  async upsertSkill(db: Db, employeeId: string, s: EmployeeSkillInput): Promise<void> {
    await db.query(
      `INSERT INTO workforce.employee_skills (employee_id, skill_id, level, years_experience) VALUES ($1,$2,$3,$4)
       ON CONFLICT (employee_id, skill_id) DO UPDATE SET level = EXCLUDED.level, years_experience = EXCLUDED.years_experience`,
      [employeeId, s.skillId, s.level, s.yearsExperience],
    );
  },

  async removeSkill(db: Db, employeeId: string, skillId: number): Promise<boolean> {
    return ((await db.query("DELETE FROM workforce.employee_skills WHERE employee_id = $1 AND skill_id = $2", [employeeId, skillId])).rowCount ?? 0) > 0;
  },
};
