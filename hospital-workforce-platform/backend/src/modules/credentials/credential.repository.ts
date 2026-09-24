import type { Db } from "../../db/pool";
import type { CredentialStatus, CredentialType } from "./credential.rules";
import type { ListCredentialsQuery } from "./credential.schema";

export type CredentialRow = {
  id: string;
  employee_id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  employee_category: "CLINICAL" | "NON_CLINICAL";
  department_id: number;
  department_name: string;
  credential_type: CredentialType;
  credential_name: string;
  credential_number: string;
  issuer: string;
  issue_date: string;
  expiry_date: string | null;
  computed_status: CredentialStatus;
  days_until_expiry: number | null;
  document_reference: string;
  verified_by: string | null;
  verified_by_name: string | null;
  verified_by_email: string | null;
  verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

/** All reads go through credential.v_credentials so the status is always evaluated against today. */
const SELECT = `
  SELECT vc.id, vc.employee_id, e.employee_number, e.first_name, e.last_name, e.employee_category,
         e.department_id, d.name AS department_name,
         vc.credential_type, vc.credential_name, vc.credential_number, vc.issuer, vc.issue_date, vc.expiry_date,
         vc.computed_status, vc.days_until_expiry, vc.document_reference,
         vc.verified_by, u.full_name AS verified_by_name, u.email AS verified_by_email, vc.verified_at,
         vc.created_at, vc.updated_at
    FROM credential.v_credentials vc
    JOIN workforce.employees e ON e.id = vc.employee_id AND e.deleted_at IS NULL
    JOIN workforce.departments d ON d.id = e.department_id
    LEFT JOIN iam.users u ON u.id = vc.verified_by`;

export const credentialRepository = {
  async findById(db: Db, id: string): Promise<CredentialRow | undefined> {
    return (await db.query<CredentialRow>(`${SELECT} WHERE vc.id = $1`, [id])).rows[0];
  },

  async listByEmployee(db: Db, employeeId: string): Promise<CredentialRow[]> {
    return (await db.query<CredentialRow>(`${SELECT} WHERE vc.employee_id = $1 ORDER BY vc.expiry_date ASC NULLS LAST, vc.credential_name`, [employeeId])).rows;
  },

  async list(db: Db, q: ListCredentialsQuery): Promise<CredentialRow[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      where.push(sql.replaceAll("$?", `$${params.length}`));
    };
    if (q.status) add("vc.computed_status = $?", q.status);
    if (q.type) add("vc.credential_type = $?", q.type);
    if (q.departmentId) add("e.department_id = $?", q.departmentId);
    if (q.search) {
      add(
        "(vc.credential_name ILIKE $? OR e.first_name || ' ' || e.last_name ILIKE $? OR e.employee_number ILIKE $? OR vc.issuer ILIKE $?)",
        `%${q.search.replace(/[%_\\]/g, (m) => `\\${m}`)}%`,
      );
    }
    params.push(q.limit);
    return (
      await db.query<CredentialRow>(
        `${SELECT}${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY vc.expiry_date ASC NULLS LAST, e.last_name LIMIT $${params.length}`,
        params,
      )
    ).rows;
  },

  /** Non-expired credentials whose expiry date falls within [today, today + days]. */
  async expiringWithin(db: Db, days: number): Promise<CredentialRow[]> {
    return (
      await db.query<CredentialRow>(
        `${SELECT} WHERE vc.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1::int ORDER BY vc.expiry_date ASC, e.last_name`,
        [days],
      )
    ).rows;
  },

  async expired(db: Db): Promise<CredentialRow[]> {
    return (await db.query<CredentialRow>(`${SELECT} WHERE vc.expiry_date < CURRENT_DATE ORDER BY vc.expiry_date DESC, e.last_name`)).rows;
  },

  async insert(
    db: Db,
    employeeId: string,
    v: {
      credentialType: string; credentialName: string; credentialNumber: string; issuer: string;
      issueDate: string; expiryDate: string | null; documentReference: string; status: CredentialStatus;
    },
  ): Promise<string> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO credential.credentials
         (employee_id, credential_type, credential_name, credential_number, issuer, issue_date, expiry_date, document_reference, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [employeeId, v.credentialType, v.credentialName, v.credentialNumber, v.issuer, v.issueDate, v.expiryDate, v.documentReference, v.status],
    );
    return r.rows[0].id;
  },

  async update(
    db: Db,
    id: string,
    v: {
      credentialType: string; credentialName: string; credentialNumber: string; issuer: string; issueDate: string;
      expiryDate: string | null; documentReference: string; status: CredentialStatus; resetVerification: boolean;
    },
  ): Promise<void> {
    await db.query(
      `UPDATE credential.credentials
          SET credential_type = $2, credential_name = $3, credential_number = $4, issuer = $5, issue_date = $6,
              expiry_date = $7, document_reference = $8, status = $9,
              verified_by = CASE WHEN $10 THEN NULL ELSE verified_by END,
              verified_at = CASE WHEN $10 THEN NULL ELSE verified_at END
        WHERE id = $1`,
      [id, v.credentialType, v.credentialName, v.credentialNumber, v.issuer, v.issueDate, v.expiryDate, v.documentReference, v.status, v.resetVerification],
    );
  },

  async markVerified(db: Db, id: string, userId: string, status: CredentialStatus): Promise<void> {
    await db.query("UPDATE credential.credentials SET verified_by = $2, verified_at = now(), status = $3 WHERE id = $1", [id, userId, status]);
  },

  async remove(db: Db, id: string): Promise<boolean> {
    return ((await db.query("DELETE FROM credential.credentials WHERE id = $1", [id])).rowCount ?? 0) > 0;
  },
};
