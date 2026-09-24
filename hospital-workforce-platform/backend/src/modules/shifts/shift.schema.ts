import { z } from "zod";
import { isoDate, text } from "../../common/validate";
import { gregorianToJalali, jalaliToGregorian } from "../../common/jalali";

export const SHIFT_TYPES = ["MORNING", "AFTERNOON", "NIGHT", "ON_CALL", "EMERGENCY"] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];

// RUNNING is retained for existing installations; ACTIVE is the Phase 2 canonical label.
export const SHIFT_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ACTIVE", "RUNNING", "COMPLETED", "CANCELLED"] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export const ASSIGNMENT_STATUSES = ["PROPOSED", "PENDING_CONFIRMATION", "CONFIRMED", "REJECTED", "CANCELLED"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const AVAILABILITY_REASONS = ["AVAILABLE", "UNAVAILABLE", "VACATION", "SICK_LEAVE", "MEDICAL_LEAVE", "TRAINING"] as const;
export type AvailabilityReason = (typeof AVAILABILITY_REASONS)[number];

const timeFormat = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "فرمت زمان نامعتبر است (HH:MM)");

export const createShiftTemplateSchema = z.object({
  nameFa: text(2, 150),
  departmentId: z.coerce.number().int().positive(),
  shiftType: z.enum(SHIFT_TYPES),
  startTime: timeFormat,
  endTime: timeFormat,
  requiredStaffCount: z.coerce.number().int().min(1).default(1),
  requiredRole: z.string().trim().max(120).optional().nullable(),
  requiredSkill: z.string().trim().max(100).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
}).strict();

export const createShiftInstanceSchema = z.object({
  templateId: z.coerce.number().int().positive().optional().nullable(),
  departmentId: z.coerce.number().int().positive(),
  shiftType: z.enum(SHIFT_TYPES),
  nameFa: text(2, 150),
  gregorianDate: isoDate.optional(),
  jalaliDate: z.string().regex(/^\d{4}\/\d{2}\/\d{2}$/, "فرمت تاریخ جلالی YYYY/MM/DD باشد").optional(),
  startTime: timeFormat,
  endTime: timeFormat,
  requiredStaff: z.coerce.number().int().min(1).default(1),
  requiredRole: z.string().trim().max(120).optional().nullable(),
  requiredSkill: z.string().trim().max(100).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
}).refine((data) => data.gregorianDate || data.jalaliDate, {
  message: "حداقل یکی از تاریخ‌های شمسی یا میلادی باید وارد شود",
}).transform((data) => {
  let gDate = data.gregorianDate;
  let jDate = data.jalaliDate;
  if (!gDate && jDate) {
    gDate = jalaliToGregorian(jDate);
  } else if (gDate && !jDate) {
    jDate = gregorianToJalali(gDate);
  }
  return {
    ...data,
    gregorianDate: gDate!,
    jalaliDate: jDate!,
  };
});

export const updateShiftInstanceSchema = z.object({
  nameFa: text(2, 150).optional(),
  shiftType: z.enum(SHIFT_TYPES).optional(),
  startTime: timeFormat.optional(),
  endTime: timeFormat.optional(),
  requiredStaff: z.coerce.number().int().min(1).optional(),
  requiredRole: z.string().trim().max(120).optional().nullable(),
  requiredSkill: z.string().trim().max(100).optional().nullable(),
  status: z.enum(SHIFT_STATUSES).optional(),
  notes: z.string().trim().max(500).optional().nullable(),
}).strict().refine((o) => Object.keys(o).length > 0, "حداقل یک فیلد برای ویرایش ارسال شود");

export const assignEmployeeSchema = z.object({
  employeeId: z.string().uuid("شناسه پرسنل نامعتبر است"),
  status: z.enum(ASSIGNMENT_STATUSES).default("CONFIRMED"),
  notes: z.string().trim().max(500).optional(),
  forceOverride: z.boolean().default(false), // Supervisors can override warnings if needed
}).strict();

export const validateShiftSchema = z.object({
  employeeId: z.string().uuid("شناسه پرسنل نامعتبر است"),
}).strict();

export const setAvailabilitySchema = z.object({
  employeeId: z.string().uuid("شناسه پرسنل نامعتبر است"),
  date: isoDate.optional(),
  jalaliDate: z.string().regex(/^\d{4}\/\d{2}\/\d{2}$/, "فرمت تاریخ جلالی YYYY/MM/DD باشد").optional(),
  available: z.boolean(),
  reason: z.enum(AVAILABILITY_REASONS).default("AVAILABLE"),
  notes: z.string().trim().max(500).optional(),
}).refine((data) => data.date || data.jalaliDate, {
  message: "حداقل یکی از تاریخ‌های شمسی یا میلادی باید وارد شود",
}).transform((data) => {
  let gDate = data.date;
  let jDate = data.jalaliDate;
  if (!gDate && jDate) {
    gDate = jalaliToGregorian(jDate);
  } else if (gDate && !jDate) {
    jDate = gregorianToJalali(gDate);
  }
  return {
    ...data,
    date: gDate!,
    jalaliDate: jDate!,
  };
});

export const listShiftsQuery = z.object({
  departmentId: z.coerce.number().int().positive().optional(),
  status: z.enum(SHIFT_STATUSES).optional(),
  shiftType: z.enum(SHIFT_TYPES).optional(),
  date: isoDate.optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  jalaliDate: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export type CreateShiftTemplateInput = z.infer<typeof createShiftTemplateSchema>;
export type CreateShiftInstanceInput = z.infer<typeof createShiftInstanceSchema>;
export type UpdateShiftInstanceInput = z.infer<typeof updateShiftInstanceSchema>;
export type AssignEmployeeInput = z.infer<typeof assignEmployeeSchema>;
export type SetAvailabilityInput = z.infer<typeof setAvailabilitySchema>;
export type ListShiftsQuery = z.infer<typeof listShiftsQuery>;
