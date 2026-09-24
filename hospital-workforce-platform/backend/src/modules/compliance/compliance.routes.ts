import { Router } from "express";
import type { Pool } from "pg";
import type { Deps } from "../../app";
import { todayUtc } from "../../common/dates";
import { authorize } from "../auth/rbac";
import { credentialRepository } from "../credentials/credential.repository";
import { evaluateEmployeeCompliance, type ComplianceStatus, type EmployeeCategory } from "../credentials/credential.rules";
import { toCredentialDto } from "../credentials/credential.service";

/** HWDT-16 Compliance Dashboard */
export async function dashboardSummary(pool: Pool) {
  const [emp, cred, depts, compRows, upcoming] = await Promise.all([
    pool.query(`SELECT count(*)::int AS total,
                       count(*) FILTER (WHERE employee_category = 'CLINICAL')::int AS clinical,
                       count(*) FILTER (WHERE employee_category = 'NON_CLINICAL')::int AS non_clinical,
                       count(*) FILTER (WHERE status = 'ACTIVE')::int AS active
                  FROM workforce.employees WHERE deleted_at IS NULL`),
    pool.query(`SELECT count(*)::int AS total,
                       count(*) FILTER (WHERE computed_status = 'VALID')::int AS valid,
                       count(*) FILTER (WHERE computed_status = 'EXPIRING_SOON')::int AS expiring_soon,
                       count(*) FILTER (WHERE computed_status = 'EXPIRED')::int AS expired,
                       count(*) FILTER (WHERE computed_status = 'PENDING_VERIFICATION')::int AS pending,
                       count(*) FILTER (WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30)::int AS expiring_30,
                       count(*) FILTER (WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 60)::int AS expiring_60
                  FROM credential.v_credentials vc
                  JOIN workforce.employees e ON e.id = vc.employee_id AND e.deleted_at IS NULL`),
    pool.query(`SELECT d.id, d.name,
                       count(DISTINCT e.id)::int AS headcount,
                       count(DISTINCT e.id) FILTER (WHERE e.employee_category = 'CLINICAL')::int AS clinical,
                       count(vc.id) FILTER (WHERE vc.computed_status = 'EXPIRING_SOON')::int AS expiring,
                       count(vc.id) FILTER (WHERE vc.computed_status = 'EXPIRED')::int AS expired
                  FROM workforce.departments d
                  LEFT JOIN workforce.employees e ON e.department_id = d.id AND e.deleted_at IS NULL
                  LEFT JOIN credential.v_credentials vc ON vc.employee_id = e.id
                 GROUP BY d.id ORDER BY headcount DESC, d.name`),
    pool.query(`SELECT e.id, e.employee_number, e.first_name, e.last_name, e.job_title, d.name AS department, c.*
                  FROM workforce.v_employee_compliance c
                  JOIN workforce.employees e ON e.id = c.employee_id
                  JOIN workforce.departments d ON d.id = e.department_id`),
    credentialRepository.expiringWithin(pool, 60),
  ]);

  const compliance: Record<ComplianceStatus, number> = { COMPLIANT: 0, AT_RISK: 0, NON_COMPLIANT: 0, NOT_REQUIRED: 0 };
  const nonCompliant: { id: string; employeeNumber: string; fullName: string; jobTitle: string; department: string; reasons: string[] }[] = [];
  for (const r of compRows.rows) {
    const result = evaluateEmployeeCompliance(r.employee_category as EmployeeCategory, {
      total: r.total_credentials, valid: r.valid_count, expiring: r.expiring_count, expired: r.expired_count,
      pending: r.pending_count, activeLicenses: r.active_license_count,
    });
    compliance[result.status]++;
    if (result.status === "NON_COMPLIANT") {
      nonCompliant.push({ id: r.id, employeeNumber: r.employee_number, fullName: `${r.first_name} ${r.last_name}`, jobTitle: r.job_title, department: r.department, reasons: result.reasons });
    }
  }
  const e = emp.rows[0];
  const c = cred.rows[0];
  return {
    asOf: todayUtc(),
    employees: { total: e.total, clinical: e.clinical, nonClinical: e.non_clinical, active: e.active },
    credentials: {
      total: c.total,
      active: c.valid + c.expiring_soon, // verified & not expired (Rule 2)
      valid: c.valid,
      expiringSoon: c.expiring_soon,
      expiring30: c.expiring_30,
      expiring60: c.expiring_60,
      expired: c.expired,
      pendingVerification: c.pending,
    },
    compliance,
    departments: depts.rows.map((d) => ({ id: d.id, name: d.name, headcount: d.headcount, clinical: d.clinical, expiring: d.expiring, expired: d.expired })),
    upcomingExpiries: upcoming.slice(0, 8).map(toCredentialDto),
    nonCompliantEmployees: nonCompliant.sort((a, b) => a.fullName.localeCompare(b.fullName)).slice(0, 12),
  };
}

export function complianceRoutes({ pool }: Deps): Router {
  const r = Router();
  r.get("/dashboard/summary", authorize("compliance:read"), async (_req, res) => {
    res.json(await dashboardSummary(pool));
  });
  return r;
}
