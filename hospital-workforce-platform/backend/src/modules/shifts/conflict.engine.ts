import type { Db } from "../../db/pool";

export type ConflictValidationResult = {
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

/** Convert time string e.g. "07:30" or "07:30:00" to minutes from midnight */
export function timeStringToMinutes(timeStr: string): number {
  const [h, m] = timeStr.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

/**
 * Check if two shift time windows on the same date overlap.
 * Handles shifts spanning midnight (e.g. 19:30 - 08:00 next day, end < start).
 */
export function intervalsOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
  let s1 = timeStringToMinutes(start1);
  let e1 = timeStringToMinutes(end1);
  let s2 = timeStringToMinutes(start2);
  let e2 = timeStringToMinutes(end2);

  // If shift spans past midnight, adjust end time by adding 24 hours (1440 mins)
  if (e1 <= s1) e1 += 1440;
  if (e2 <= s2) e2 += 1440;

  return s1 < e2 && s2 < e1;
}

export const conflictEngine = {
  /**
   * Validate assignment of an employee to a shift instance against the 4 Hard Business Rules:
   * 1. Credential expiration check
   * 2. Shift time overlap check
   * 3. Availability check
   * 4. Required skill match check
   */
  async validateCandidate(
    db: Db,
    shiftId: string,
    employeeId: string,
  ): Promise<ConflictValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Fetch shift details
    const shiftRes = await db.query<{
      id: string;
      gregorian_date: string;
      start_time: string;
      end_time: string;
      department_id: number;
      required_role: string | null;
      required_skill: string | null;
      name_fa: string;
    }>(
      `SELECT id, gregorian_date::text AS gregorian_date, start_time::text AS start_time,
              end_time::text AS end_time, department_id, required_role, required_skill, name_fa
         FROM shift.shift_instances
        WHERE id = $1`,
      [shiftId],
    );

    if (!shiftRes.rows[0]) {
      return {
        valid: false,
        errors: ["شیفت مورد نظر یافت نشد"],
        warnings: [],
        details: {
          rule1_credentials: { passed: false, expiredCount: 0, activeLicense: false },
          rule2_overlap: { passed: false },
          rule3_availability: { passed: false },
          rule4_skills: { passed: false },
          employeeSkills: [],
        } as any,
      };
    }
    const targetShift = shiftRes.rows[0];

    // 2. Fetch employee details
    const empRes = await db.query<{
      id: string;
      employee_number: string;
      first_name: string;
      last_name: string;
      employee_category: "CLINICAL" | "NON_CLINICAL";
      job_title: string;
      status: string;
    }>(
      `SELECT id, employee_number, first_name, last_name, employee_category, job_title, status
         FROM workforce.employees
        WHERE id = $1 AND deleted_at IS NULL`,
      [employeeId],
    );

    if (!empRes.rows[0]) {
      return {
        valid: false,
        errors: ["پرسنل مورد نظر در سیستم فعال نیست یا حذف شده است"],
        warnings: [],
        details: {
          rule1_credentials: { passed: false, expiredCount: 0, activeLicense: false },
          rule2_overlap: { passed: false },
          rule3_availability: { passed: false },
          rule4_skills: { passed: false, employeeSkills: [] },
        },
      };
    }
    const emp = empRes.rows[0];

    // -------------------------------------------------------------------------
    // RULE 1: Credential expiration check
    // -------------------------------------------------------------------------
    const credRes = await db.query<{
      total_credentials: number;
      expired_count: number;
      expiring_count: number;
      active_license_count: number;
    }>(
      `SELECT count(*)::int AS total_credentials,
              count(*) FILTER (WHERE computed_status = 'EXPIRED')::int AS expired_count,
              count(*) FILTER (WHERE computed_status = 'EXPIRING_SOON')::int AS expiring_count,
              count(*) FILTER (WHERE credential_type IN ('PROFESSIONAL_LICENSE', 'REGISTRATION')
                                 AND computed_status IN ('VALID', 'EXPIRING_SOON'))::int AS active_license_count
         FROM credential.v_credentials
        WHERE employee_id = $1`,
      [employeeId],
    );
    const credStats = credRes.rows[0] ?? { total_credentials: 0, expired_count: 0, expiring_count: 0, active_license_count: 0 };

    let rule1Passed = true;
    let rule1Message = "پروانه و صلاحیت‌های بالینی معتبر است";

    if (credStats.expired_count > 0) {
      rule1Passed = false;
      const msg = `خطای انقضای مدرک (قانون ۱): پرسنل دارای ${credStats.expired_count} مدرک یا پروانه منقضی‌شده است`;
      errors.push(msg);
      rule1Message = msg;
    } else if (emp.employee_category === "CLINICAL" && credStats.active_license_count === 0) {
      rule1Passed = false;
      const msg = "خطای صلاحیت حرفه‌ای (قانون ۱): پرسنل بالینی فاقد پروانه نظام پزشکی یا نظام پرستاری معتبر است";
      errors.push(msg);
      rule1Message = msg;
    } else if (credStats.expiring_count > 0) {
      warnings.push(`هشدار: ${credStats.expiring_count} مدرک پرسنل ظرف ۶۰ روز آینده منقضی می‌شود`);
    }

    // -------------------------------------------------------------------------
    // RULE 2: Shift Overlap Conflict check
    // -------------------------------------------------------------------------
    const overlapRes = await db.query<{
      shift_id: string;
      name_fa: string;
      start_time: string;
      end_time: string;
    }>(
      `SELECT si.id AS shift_id, si.name_fa, si.start_time::text, si.end_time::text
         FROM shift.shift_assignments sa
         JOIN shift.shift_instances si ON si.id = sa.shift_id
        WHERE sa.employee_id = $1
          AND sa.shift_id <> $2
          AND sa.status IN ('PROPOSED', 'PENDING_CONFIRMATION', 'CONFIRMED')
          AND si.gregorian_date = $3
          AND si.status <> 'CANCELLED'`,
      [employeeId, shiftId, targetShift.gregorian_date],
    );

    let rule2Passed = true;
    let rule2Message = "تداخل زمانی با سایر شیفت‌های امروز وجود ندارد";
    let overlappingShiftId: string | undefined;

    for (const otherShift of overlapRes.rows) {
      if (intervalsOverlap(targetShift.start_time, targetShift.end_time, otherShift.start_time, otherShift.end_time)) {
        rule2Passed = false;
        overlappingShiftId = otherShift.shift_id;
        const msg = `تداخل شیفت (قانون ۲): پرسنل در این تاریخ با شیفت «${otherShift.name_fa}» (${otherShift.start_time.slice(0, 5)} الی ${otherShift.end_time.slice(0, 5)}) تداخل زمانی دارد`;
        errors.push(msg);
        rule2Message = msg;
        break;
      }
    }

    // -------------------------------------------------------------------------
    // RULE 3: Employee Availability check
    // -------------------------------------------------------------------------
    const availRes = await db.query<{
      available: boolean;
      reason: string;
      notes: string | null;
    }>(
      `SELECT available, reason, notes
         FROM shift.employee_availability
        WHERE employee_id = $1 AND date = $2`,
      [employeeId, targetShift.gregorian_date],
    );

    let rule3Passed = true;
    let rule3Message = "پرسنل در تاریخ مورد نظر در دسترس است";
    let unavailReason: string | undefined;
    let unavailNotes: string | undefined;

    if (availRes.rows[0] && !availRes.rows[0].available) {
      rule3Passed = false;
      unavailReason = availRes.rows[0].reason;
      unavailNotes = availRes.rows[0].notes ?? undefined;

      const reasonTranslations: Record<string, string> = {
        UNAVAILABLE: "عدم امکان حضور",
        VACATION: "مرخصی استحقاقی",
        MEDICAL_LEAVE: "مرخصی استعلاجی / پزشکی",
        TRAINING: "دوره آموزشی",
      };
      const translated = reasonTranslations[availRes.rows[0].reason] ?? availRes.rows[0].reason;
      const msg = `عدم دسترسی پرسنل (قانون ۳): پرسنل در این تاریخ ثبت وضعیت «${translated}» دارد${unavailNotes ? ` (${unavailNotes})` : ""}`;
      errors.push(msg);
      rule3Message = msg;
    }

    // -------------------------------------------------------------------------
    // RULE 4: Required Skills match
    // -------------------------------------------------------------------------
    const skillsRes = await db.query<{ name: string; level: string; years_experience: number }>(
      `SELECT s.name, es.level, es.years_experience
         FROM workforce.employee_skills es
         JOIN workforce.skills s ON s.id = es.skill_id
        WHERE es.employee_id = $1`,
      [employeeId],
    );
    const empSkills = skillsRes.rows.map((s) => s.name);

    let rule4Passed = true;
    let rule4Message = "مهارت‌های الزامی شیفت احراز شده است";

    if (targetShift.required_skill) {
      const requiredSkillLower = targetShift.required_skill.trim().toLowerCase();
      const hasSkill = empSkills.some((s) => s.trim().toLowerCase() === requiredSkillLower);
      if (!hasSkill) {
        rule4Passed = false;
        const msg = `عدم تطابق مهارت (قانون ۴): این شیفت نیازمند مهارت «${targetShift.required_skill}» است که در سوابق پرسنل ثبت نشده است`;
        errors.push(msg);
        rule4Message = msg;
      }
    }

    const isValid = rule1Passed && rule2Passed && rule3Passed && rule4Passed;

    return {
      valid: isValid,
      errors,
      warnings,
      details: {
        rule1_credentials: {
          passed: rule1Passed,
          expiredCount: credStats.expired_count,
          activeLicense: credStats.active_license_count > 0,
          message: rule1Message,
        },
        rule2_overlap: {
          passed: rule2Passed,
          overlappingShiftId,
          message: rule2Message,
        },
        rule3_availability: {
          passed: rule3Passed,
          reason: unavailReason,
          notes: unavailNotes,
          message: rule3Message,
        },
        rule4_skills: {
          passed: rule4Passed,
          requiredSkill: targetShift.required_skill ?? undefined,
          employeeSkills: empSkills,
          message: rule4Message,
        },
      },
    };
  },
};
