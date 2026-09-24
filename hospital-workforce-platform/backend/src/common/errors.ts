import type { ErrorRequestHandler, RequestHandler } from "express";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (entity: string) => new AppError(404, "NOT_FOUND", `${entity} not found`);
export const forbidden = (message = "You do not have permission to perform this action") => new AppError(403, "FORBIDDEN", message);
export const unauthorized = (message = "Authentication required", code = "UNAUTHORIZED") => new AppError(401, code, message);
export const businessRule = (code: string, message: string) => new AppError(422, code, message);

const UNIQUE_MESSAGES: Record<string, string> = {
  ux_employees_number: "An employee with this employee number already exists",
  ux_employees_email: "An employee with this email already exists",
  ux_employees_national: "An employee with this national ID already exists",
  ux_departments_name: "A department with this name already exists",
  ux_skills_name: "A skill with this name already exists",
  ux_users_email: "A user with this email already exists",
};

type PgError = { code?: string; constraint?: string; detail?: string };

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: "ROUTE_NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  void _next;
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
    return;
  }
  const e = err as PgError & { type?: string; status?: number };
  if (e.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } });
    return;
  }
  if (e.type === "entity.too.large") {
    res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large" } });
    return;
  }
  switch (e.code) {
    case "23505":
      res.status(409).json({ error: { code: "CONFLICT", message: UNIQUE_MESSAGES[e.constraint ?? ""] ?? "Duplicate value" } });
      return;
    case "23503":
      res.status(409).json({ error: { code: "REFERENCE_CONFLICT", message: "Operation violates a relationship (referenced record missing or still in use)" } });
      return;
    case "23514":
    case "22007":
    case "22008":
      res.status(422).json({ error: { code: "CONSTRAINT_VIOLATION", message: `Value rejected by database constraint ${e.constraint ?? ""}`.trim() } });
      return;
    case "22P02":
      res.status(400).json({ error: { code: "INVALID_IDENTIFIER", message: "Malformed identifier" } });
      return;
  }
  console.error("[hwdt-backend] unhandled error", err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unexpected server error" } });
};
