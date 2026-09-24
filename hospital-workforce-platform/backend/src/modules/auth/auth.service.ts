import type { Pool } from "pg";
import type { Config } from "../../config/env";
import { unauthorized } from "../../common/errors";
import { getDummyHash, hashPassword, verifyPassword } from "./password";
import { signAccessToken, type AuthUser } from "./jwt";
import { permissionsFor, type Role } from "./rbac";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: Role;
  employee_id: string | null;
  is_active: boolean;
};

export const DEMO_ACCOUNTS: { email: string; name: string; role: Role; employeeNumber?: string }[] = [
  { email: "admin@hwdt.local", name: "مدیر ارشد سامانه (System Admin)", role: "ADMIN" },
  { email: "metron@hwdt.local", name: "مریم حسینی (مدیر پرستاری / مترون)", role: "NURSING_MANAGER" },
  { email: "supervisor@hwdt.local", name: "رضا مرادی (سوپروایزر شیفت / سرپرستار)", role: "SHIFT_SUPERVISOR" },
  { email: "head.icu@hwdt.local", name: "دکتر دانیال اکافور (رئیس بخش ICU)", role: "DEPARTMENT_HEAD", employeeNumber: "EMP-001002" },
  { email: "hospital.admin@hwdt.local", name: "دکتر علیرضا تهرانی (مدیر ارشد بیمارستان)", role: "HOSPITAL_ADMIN" },
  { email: "hr.manager@hwdt.local", name: "اولیویا براون (مدیر منابع انسانی)", role: "HR_MANAGER", employeeNumber: "EMP-001021" },
  { email: "compliance@hwdt.local", name: "مسئول اعتباربخشی و صلاحیت بالینی", role: "COMPLIANCE_OFFICER" },
  { email: "amira.haddad@hwdt.local", name: "امیرا حداد (پرستار بخش ICU)", role: "EMPLOYEE", employeeNumber: "EMP-001001" },
];

export async function login(pool: Pool, config: Config, email: string, password: string) {
  const { rows } = await pool.query<UserRow>(
    "SELECT id, email, password_hash, full_name, role, employee_id, is_active FROM iam.users WHERE lower(email) = lower($1)",
    [email],
  );
  const row = rows[0];
  const ok = await verifyPassword(password, row?.password_hash ?? (await getDummyHash()));
  if (!row || !ok || !row.is_active) throw unauthorized("نام کاربری یا رمز عبور نامعتبر است", "INVALID_CREDENTIALS");
  await pool.query("UPDATE iam.users SET last_login_at = now() WHERE id = $1", [row.id]);
  const user: AuthUser = { id: row.id, email: row.email, name: row.full_name, role: row.role, employeeId: row.employee_id };
  const t = signAccessToken(user, config);
  return {
    accessToken: t.token,
    tokenType: "Bearer",
    expiresIn: t.expiresIn,
    expiresAt: t.expiresAt,
    user: { ...user, permissions: permissionsFor(user.role) },
  };
}

export async function ensureSeedUsers(pool: Pool, config: Config, log: (m: string) => void = console.log): Promise<void> {
  const accounts: { email: string; name: string; role: Role; employeeNumber?: string; password: string }[] = [];
  if (config.seedDemo) accounts.push(...DEMO_ACCOUNTS.map((a) => ({ ...a, password: config.seedPassword })));
  if (config.adminEmail && config.adminPassword) {
    accounts.push({ email: config.adminEmail, name: "مدیر ارشد سامانه", role: "ADMIN", password: config.adminPassword });
  }
  for (const a of accounts) {
    const exists = await pool.query("SELECT 1 FROM iam.users WHERE lower(email) = lower($1)", [a.email]);
    if (exists.rowCount) continue;
    const emp = a.employeeNumber
      ? (await pool.query<{ id: string }>("SELECT id FROM workforce.employees WHERE employee_number = $1 AND deleted_at IS NULL", [a.employeeNumber])).rows[0]
      : undefined;
    await pool.query(
      "INSERT INTO iam.users (email, password_hash, full_name, role, employee_id) VALUES ($1, $2, $3, $4, $5)",
      [a.email, await hashPassword(a.password), a.name, a.role, emp?.id ?? null],
    );
    log(`[seed] user ${a.email} (${a.role}) created`);
  }
}
