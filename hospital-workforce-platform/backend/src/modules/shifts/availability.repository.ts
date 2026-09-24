import type { Db } from "../../db/pool";
import type { SetAvailabilityInput } from "./shift.schema";

export type AvailabilityRow = {
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
  reason: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

export const availabilityRepository = {
  async upsert(db: Db, input: SetAvailabilityInput): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO shift.employee_availability
         (employee_id, date, jalali_date, available, reason, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (employee_id, date)
       DO UPDATE SET available = EXCLUDED.available,
                     reason = EXCLUDED.reason,
                     notes = EXCLUDED.notes,
                     jalali_date = EXCLUDED.jalali_date
       RETURNING id`,
      [input.employeeId, input.date, input.jalaliDate, input.available, input.reason, input.notes ?? null],
    );
    return rows[0].id;
  },

  async getForEmployee(db: Db, employeeId: string, startDate?: string, endDate?: string): Promise<AvailabilityRow[]> {
    const where = ["ea.employee_id = $1"];
    const params: unknown[] = [employeeId];

    if (startDate) {
      params.push(startDate);
      where.push(`ea.date >= $${params.length}`);
    }
    if (endDate) {
      params.push(endDate);
      where.push(`ea.date <= $${params.length}`);
    }

    const sql = `
      SELECT ea.id, ea.employee_id, e.employee_number, e.first_name, e.last_name,
             (e.first_name || ' ' || e.last_name) AS full_name,
             e.department_id, COALESCE(d.name_fa, d.name) AS department_name_fa,
             ea.date::text AS date, ea.jalali_date, ea.available, ea.reason, ea.notes,
             ea.created_at, ea.updated_at
        FROM shift.employee_availability ea
        JOIN workforce.employees e ON e.id = ea.employee_id
        JOIN workforce.departments d ON d.id = e.department_id
       WHERE ${where.join(" AND ")}
       ORDER BY ea.date ASC`;

    return (await db.query<AvailabilityRow>(sql, params)).rows;
  },

  async list(db: Db, startDate: string, endDate: string, departmentId?: number): Promise<AvailabilityRow[]> {
    const where = ["ea.date >= $1", "ea.date <= $2"];
    const params: unknown[] = [startDate, endDate];

    if (departmentId) {
      params.push(departmentId);
      where.push(`e.department_id = $${params.length}`);
    }

    const sql = `
      SELECT ea.id, ea.employee_id, e.employee_number, e.first_name, e.last_name,
             (e.first_name || ' ' || e.last_name) AS full_name,
             e.department_id, COALESCE(d.name_fa, d.name) AS department_name_fa,
             ea.date::text AS date, ea.jalali_date, ea.available, ea.reason, ea.notes,
             ea.created_at, ea.updated_at
        FROM shift.employee_availability ea
        JOIN workforce.employees e ON e.id = ea.employee_id AND e.deleted_at IS NULL
        JOIN workforce.departments d ON d.id = e.department_id
       WHERE ${where.join(" AND ")}
       ORDER BY ea.date ASC, e.last_name ASC`;

    return (await db.query<AvailabilityRow>(sql, params)).rows;
  },
};
