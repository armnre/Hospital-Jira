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
  await db.query(
    `INSERT INTO platform.audit_log (actor_id, actor_email, action, entity_type, entity_id, changes)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [actor?.id ?? null, actor?.email ?? null, action, entityType, String(entityId), JSON.stringify(changes)],
  );
}
