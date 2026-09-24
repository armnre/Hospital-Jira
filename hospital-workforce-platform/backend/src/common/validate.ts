import { z } from "zod";
import { AppError } from "./errors";
import { isValidIsoDate } from "./dates";

/** Parse input with a zod schema or throw a 422 VALIDATION_ERROR with field-level details. */
export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "Request validation failed",
      r.error.issues.map((i) => ({ field: i.path.join(".") || "(body)", message: i.message })),
    );
  }
  return r.data;
}

export const uuidParam = z.string().uuid("Invalid identifier");
export const intParam = z.coerce.number().int().positive();

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date format YYYY-MM-DD")
  .refine(isValidIsoDate, "Invalid calendar date");

/** Free text: trimmed, no control characters. */
export const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min, `Must be at least ${min} characters`)
    .max(max, `Must be at most ${max} characters`)
    // eslint-disable-next-line no-control-regex
    .refine((v) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(v), "Contains invalid characters");
