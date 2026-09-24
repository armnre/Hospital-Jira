import type { Db } from "../db/pool";
import type { AuthUser } from "../modules/auth/jwt";

/** Append-only audit trail (platform.audit_log). */
export async function audit(
  db: Db,
  actor: AuthUser | null,
  action: string,
  entityType: string,
  entityId: string | number,
  changes: Record<string, unknown> = {},
): Promise<void> {
  const details = JSON.stringify(changes);
  await db.query(
    `INSERT INTO platform.audit_log (actor_id, actor_email, action, entity_type, entity_id, changes)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [actor?.id ?? null, actor?.email ?? null, action, entityType, String(entityId), details],
  );
  // Phase 2 keeps a scheduling-specific append-only projection for retention and analytics.
  // The platform log remains the system-wide audit source of truth.
  if (["SHIFT_CREATED", "SHIFT_UPDATED", "SHIFT_APPROVED", "SHIFT_CANCELLED", "EMPLOYEE_ASSIGNED", "EMPLOYEE_REMOVED", "AVAILABILITY_SET"].includes(action)) {
    await db.query(
      `INSERT INTO shift.audit_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [actor?.id ?? null, action, entityType, String(entityId), details],
    );
  }
}
