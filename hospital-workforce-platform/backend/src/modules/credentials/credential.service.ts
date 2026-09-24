import type { Pool } from "pg";
import { audit } from "../../common/audit";
import { todayUtc } from "../../common/dates";
import { forbidden, notFound } from "../../common/errors";
import { withTransaction } from "../../db/pool";
import type { AuthUser } from "../auth/jwt";
import { hasPermission } from "../auth/rbac";
import { credentialRepository, type CredentialRow } from "./credential.repository";
import {
  EXPIRY_BUCKETS_DAYS,
  MATERIAL_FIELDS,
  assertCredentialTypeAllowed,
  assertDates,
  assertVerifiable,
  computeCredentialStatus,
  isCredentialValid,
  type EmployeeCategory,
} from "./credential.rules";
import type { CreateCredentialInput, ListCredentialsQuery, UpdateCredentialInput } from "./credential.schema";

export function toCredentialDto(r: CredentialRow) {
  return {
    id: r.id,
    employee: {
      id: r.employee_id,
      employeeNumber: r.employee_number,
      fullName: `${r.first_name} ${r.last_name}`,
      category: r.employee_category,
      department: { id: r.department_id, name: r.department_name },
    },
    credentialType: r.credential_type,
    credentialName: r.credential_name,
    credentialNumber: r.credential_number,
    issuer: r.issuer,
    issueDate: r.issue_date,
    expiryDate: r.expiry_date,
    status: r.computed_status,
    isValid: isCredentialValid(r.computed_status), // Rule 2 — explicit flag for consumers
    daysUntilExpiry: r.days_until_expiry,
    documentReference: r.document_reference,
    verifiedBy: r.verified_by ? { id: r.verified_by, name: r.verified_by_name, email: r.verified_by_email } : null,
    verifiedAt: r.verified_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
export type CredentialDto = ReturnType<typeof toCredentialDto>;

function canRead(user: AuthUser, employeeId: string) {
  return hasPermission(user.role, "credentials:read") || user.employeeId === employeeId;
}

async function loadEmployee(pool: Pool, employeeId: string) {
  const r = await pool.query<{ id: string; employee_category: EmployeeCategory }>(
    "SELECT id, employee_category FROM workforce.employees WHERE id = $1 AND deleted_at IS NULL",
    [employeeId],
  );
  if (!r.rows[0]) throw notFound("Employee");
  return r.rows[0];
}

export const credentialService = {
  async listForEmployee(pool: Pool, employeeId: string, user: AuthUser): Promise<CredentialDto[]> {
    if (!canRead(user, employeeId)) throw forbidden("You can only view your own credentials");
    return (await credentialRepository.listByEmployee(pool, employeeId)).map(toCredentialDto);
  },

  async list(pool: Pool, q: ListCredentialsQuery) {
    const rows = await credentialRepository.list(pool, q);
    return { asOf: todayUtc(), count: rows.length, data: rows.map(toCredentialDto) };
  },

  async create(pool: Pool, employeeId: string, input: CreateCredentialInput, user: AuthUser): Promise<CredentialDto> {
    const selfService = !hasPermission(user.role, "credentials:write");
    if (selfService && (!hasPermission(user.role, "credentials:submit:self") || user.employeeId !== employeeId)) {
      throw forbidden("You can only submit credentials for yourself");
    }
    const employee = await loadEmployee(pool, employeeId);
    const today = todayUtc();
    assertCredentialTypeAllowed(employee.employee_category, input.credentialType); // Rule 3
    assertDates(input.issueDate, input.expiryDate, today);
    const status = computeCredentialStatus({ expiryDate: input.expiryDate, verifiedAt: null }, today); // new = unverified
    const id = await withTransaction(pool, async (tx) => {
      const newId = await credentialRepository.insert(tx, employeeId, { ...input, status });
      await audit(tx, user, "CREDENTIAL_CREATED", "credential", newId, { employeeId, type: input.credentialType, name: input.credentialName });
      return newId;
    });
    return toCredentialDto((await credentialRepository.findById(pool, id))!);
  },

  async update(pool: Pool, id: string, input: UpdateCredentialInput, user: AuthUser): Promise<CredentialDto> {
    const current = await credentialRepository.findById(pool, id);
    if (!current) throw notFound("Credential");
    const merged = {
      credentialType: input.credentialType ?? current.credential_type,
      credentialName: input.credentialName ?? current.credential_name,
      credentialNumber: input.credentialNumber ?? current.credential_number,
      issuer: input.issuer ?? current.issuer,
      issueDate: input.issueDate ?? current.issue_date,
      expiryDate: input.expiryDate === undefined ? current.expiry_date : input.expiryDate,
      documentReference: input.documentReference ?? current.document_reference,
    };
    const today = todayUtc();
    assertCredentialTypeAllowed(current.employee_category, merged.credentialType);
    assertDates(merged.issueDate, merged.expiryDate, today);
    const currentValues: Record<string, unknown> = {
      credentialType: current.credential_type, credentialName: current.credential_name, credentialNumber: current.credential_number,
      issuer: current.issuer, issueDate: current.issue_date, expiryDate: current.expiry_date, documentReference: current.document_reference,
    };
    const changed = MATERIAL_FIELDS.filter((f) => merged[f] !== currentValues[f]);
    const resetVerification = changed.length > 0 && current.verified_at !== null; // document changed -> re-verify
    const status = computeCredentialStatus({ expiryDate: merged.expiryDate, verifiedAt: resetVerification ? null : current.verified_at }, today);
    await withTransaction(pool, async (tx) => {
      await credentialRepository.update(tx, id, { ...merged, status, resetVerification });
      await audit(tx, user, "CREDENTIAL_UPDATED", "credential", id, { fields: changed, verificationReset: resetVerification });
    });
    return toCredentialDto((await credentialRepository.findById(pool, id))!);
  },

  async verify(pool: Pool, id: string, user: AuthUser): Promise<CredentialDto> {
    const current = await credentialRepository.findById(pool, id);
    if (!current) throw notFound("Credential");
    assertVerifiable(current.computed_status); // Rule 2
    const status = computeCredentialStatus({ expiryDate: current.expiry_date, verifiedAt: new Date() }, todayUtc());
    await withTransaction(pool, async (tx) => {
      await credentialRepository.markVerified(tx, id, user.id, status);
      await audit(tx, user, "CREDENTIAL_VERIFIED", "credential", id, { status });
    });
    return toCredentialDto((await credentialRepository.findById(pool, id))!);
  },

  async remove(pool: Pool, id: string, user: AuthUser): Promise<void> {
    await withTransaction(pool, async (tx) => {
      if (!(await credentialRepository.remove(tx, id))) throw notFound("Credential");
      await audit(tx, user, "CREDENTIAL_DELETED", "credential", id);
    });
  },

  /** Compliance API — expiring within 30 and within 60 days (60 is a superset of 30). */
  async expiring(pool: Pool) {
    const [short, long] = EXPIRY_BUCKETS_DAYS;
    const rows = (await credentialRepository.expiringWithin(pool, long)).map(toCredentialDto);
    const within30 = rows.filter((r) => r.daysUntilExpiry !== null && r.daysUntilExpiry <= short);
    return {
      asOf: todayUtc(),
      within30Days: { days: short, count: within30.length, data: within30 },
      within60Days: { days: long, count: rows.length, data: rows },
    };
  },

  async expired(pool: Pool) {
    const rows = (await credentialRepository.expired(pool)).map(toCredentialDto);
    return { asOf: todayUtc(), count: rows.length, data: rows };
  },
};
