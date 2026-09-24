import type { Pool } from "pg";
import { audit } from "../../common/audit";
import { todayUtc } from "../../common/dates";
import { withTransaction } from "../../db/pool";
import type { AuthUser } from "../auth/jwt";
import { availabilityRepository } from "./availability.repository";
import type { SetAvailabilityInput } from "./shift.schema";

export const availabilityService = {
  async setAvailability(pool: Pool, input: SetAvailabilityInput, user: AuthUser) {
    const id = await withTransaction(pool, async (tx) => {
      const availId = await availabilityRepository.upsert(tx, input);
      await audit(tx, user, "AVAILABILITY_SET", "employee_availability", availId, {
        employeeId: input.employeeId,
        date: input.date,
        jalaliDate: input.jalaliDate,
        available: input.available,
        reason: input.reason,
      });
      return availId;
    });

    const rows = await availabilityRepository.getForEmployee(pool, input.employeeId, input.date, input.date);
    return rows[0] ?? { id, ...input };
  },

  async getEmployeeAvailability(pool: Pool, employeeId: string, startDate?: string, endDate?: string) {
    const rows = await availabilityRepository.getForEmployee(pool, employeeId, startDate, endDate);
    return {
      employeeId,
      count: rows.length,
      data: rows,
    };
  },

  async listAvailability(pool: Pool, startDate?: string, endDate?: string, departmentId?: number) {
    const start = startDate ?? todayUtc();
    const end = endDate ?? todayUtc();
    const rows = await availabilityRepository.list(pool, start, end, departmentId);
    return {
      startDate: start,
      endDate: end,
      count: rows.length,
      data: rows,
    };
  },
};
