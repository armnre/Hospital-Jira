import { z } from "zod";
import { isoDate, text } from "../../common/validate";
import { EMPLOYEE_CATEGORIES } from "../credentials/credential.rules";

export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "LOCUM", "INTERN"] as const;
export const EMPLOYEE_STATUSES = ["ACTIVE", "ON_LEAVE", "SUSPENDED", "TERMINATED"] as const;
export const SKILL_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"] as const;

const personName = text(1, 100).refine((v) => /^[\p{L}\p{M}' .-]+$/u.test(v), "Only letters, spaces, apostrophes, dots and hyphens");

const fields = {
  employeeNumber: z.string().trim().toUpperCase().regex(/^EMP-\d{4,10}$/, "Format: EMP-000000"),
  firstName: personName,
  lastName: personName,
  nationalId: z.string().trim().min(5, "At least 5 characters").max(30).regex(/^[A-Za-z0-9-]+$/, "Letters, digits and hyphens only"),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(255),
  phone: z.string().trim().max(30).regex(/^[+0-9 ()-]*$/, "Digits, spaces, +, -, ( ) only"),
  departmentId: z.coerce.number().int().positive("Select a department"),
  jobTitle: text(2, 120),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  employeeCategory: z.enum(EMPLOYEE_CATEGORIES),
  status: z.enum(EMPLOYEE_STATUSES),
  hireDate: isoDate.nullable(),
};

export const createEmployeeSchema = z
  .object({
    ...fields,
    phone: fields.phone.default(""),
    status: fields.status.default("ACTIVE"),
    hireDate: fields.hireDate.optional().default(null),
  })
  .strict();

/** PUT accepts a full or partial representation; only supplied fields change. */
export const updateEmployeeSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, "Provide at least one field to update");

export const listEmployeesQuery = z.object({
  search: z.string().trim().max(100).optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  jobTitle: z.string().trim().max(120).optional(),
  category: z.enum(EMPLOYEE_CATEGORIES).optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["name", "employeeNumber", "department", "jobTitle", "createdAt"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
});

export const employeeSkillSchema = z
  .object({
    skillId: z.coerce.number().int().positive(),
    level: z.enum(SKILL_LEVELS),
    yearsExperience: z.coerce.number().min(0).max(60).default(0),
  })
  .strict();

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuery>;
export type EmployeeSkillInput = z.infer<typeof employeeSkillSchema>;
