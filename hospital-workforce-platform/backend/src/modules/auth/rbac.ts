import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Config } from "../../config/env";
import { forbidden, unauthorized } from "../../common/errors";
import { verifyAccessToken, type AuthUser } from "./jwt";

export const ROLES = [
  "ADMIN",
  "HR_MANAGER",
  "COMPLIANCE_OFFICER",
  "EMPLOYEE",
  "HOSPITAL_ADMIN",
  "NURSING_MANAGER",
  "SHIFT_SUPERVISOR",
  "DEPARTMENT_HEAD",
] as const;
export type Role = (typeof ROLES)[number];

/**
 * Permission matrix (role-based access control).
 * Extended in Phase 2 for Iranian hospital workforce hierarchy.
 */
export const PERMISSIONS = {
  // Employee management
  "employees:read": [
    "ADMIN", "HR_MANAGER", "COMPLIANCE_OFFICER",
    "HOSPITAL_ADMIN", "NURSING_MANAGER", "SHIFT_SUPERVISOR", "DEPARTMENT_HEAD",
  ],
  "employees:read:self": ["EMPLOYEE"],
  "employees:write": ["ADMIN", "HR_MANAGER", "HOSPITAL_ADMIN"],
  "employees:delete": ["ADMIN", "HR_MANAGER"],
  "employees:view-sensitive": ["ADMIN", "HR_MANAGER", "HOSPITAL_ADMIN"],

  // Credential management
  "credentials:read": [
    "ADMIN", "HR_MANAGER", "COMPLIANCE_OFFICER",
    "HOSPITAL_ADMIN", "NURSING_MANAGER", "SHIFT_SUPERVISOR", "DEPARTMENT_HEAD",
  ],
  "credentials:write": ["ADMIN", "HR_MANAGER", "COMPLIANCE_OFFICER"],
  "credentials:submit:self": ["EMPLOYEE"],
  "credentials:verify": ["ADMIN", "COMPLIANCE_OFFICER"],
  "credentials:delete": ["ADMIN", "COMPLIANCE_OFFICER"],

  // Reference data
  "reference:write": ["ADMIN", "HR_MANAGER", "HOSPITAL_ADMIN", "NURSING_MANAGER"],

  // Compliance
  "compliance:read": [
    "ADMIN", "HR_MANAGER", "COMPLIANCE_OFFICER",
    "HOSPITAL_ADMIN", "NURSING_MANAGER", "SHIFT_SUPERVISOR", "DEPARTMENT_HEAD",
  ],

  // Phase 2: Shift management
  "shifts:read": [
    "ADMIN", "HOSPITAL_ADMIN", "NURSING_MANAGER",
    "SHIFT_SUPERVISOR", "DEPARTMENT_HEAD", "HR_MANAGER", "COMPLIANCE_OFFICER",
  ],
  "shifts:write": [
    "ADMIN", "HOSPITAL_ADMIN", "NURSING_MANAGER",
    "SHIFT_SUPERVISOR", "DEPARTMENT_HEAD",
  ],
  "shifts:approve": [
    "ADMIN", "HOSPITAL_ADMIN", "NURSING_MANAGER", "DEPARTMENT_HEAD",
  ],
  "shifts:delete": [
    "ADMIN", "HOSPITAL_ADMIN", "NURSING_MANAGER",
  ],

  // Phase 2: Assignment & Roster
  "assignments:write": [
    "ADMIN", "HOSPITAL_ADMIN", "NURSING_MANAGER",
    "SHIFT_SUPERVISOR", "DEPARTMENT_HEAD",
  ],
  "assignments:read:self": ["EMPLOYEE"],

  // Phase 2: Availability
  "availability:write": ["ADMIN", "HR_MANAGER", "SHIFT_SUPERVISOR", "NURSING_MANAGER"],
  "availability:write:self": ["EMPLOYEE"],
  "availability:read": [
    "ADMIN", "HOSPITAL_ADMIN", "NURSING_MANAGER",
    "SHIFT_SUPERVISOR", "DEPARTMENT_HEAD", "HR_MANAGER",
  ],

  // Phase 2: Supervisor dashboard
  "supervisor:read": [
    "ADMIN", "HOSPITAL_ADMIN", "NURSING_MANAGER",
    "SHIFT_SUPERVISOR", "DEPARTMENT_HEAD",
  ],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => hasPermission(role, p));
}

/** The authenticated user is stored in res.locals.user by `authenticate`. */
export function currentUser(res: Response): AuthUser {
  const user = res.locals.user as AuthUser | undefined;
  if (!user) throw unauthorized();
  return user;
}

export function authenticate(config: Config): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) throw unauthorized("Missing bearer token");
    res.locals.user = verifyAccessToken(token, config);
    next();
  };
}

/** Allow the request if the user holds ANY of the given permissions. */
export function authorize(...permissions: Permission[]): RequestHandler {
  return (_req, res, next) => {
    const user = currentUser(res);
    if (!permissions.some((p) => hasPermission(user.role, p))) throw forbidden();
    next();
  };
}
