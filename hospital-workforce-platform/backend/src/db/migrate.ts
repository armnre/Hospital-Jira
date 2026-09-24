import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Pool } from "pg";

const MIGRATION_LOCK = 804_201;

/** Locate hospital-workforce-platform/database from the sandbox root, the platform root or the backend container. */
export function resolveDatabaseDir(env: NodeJS.ProcessEnv = process.env): string {
  const candidates = [
    env.HWDT_DATABASE_DIR,
    path.join(process.cwd(), "database"),
    path.join(process.cwd(), "..", "database"),
    path.join(process.cwd(), "hospital-workforce-platform", "database"),
  ].filter((p): p is string => Boolean(p));
  const found = candidates.find((p) => fs.existsSync(path.join(p, "migrations")));
  if (!found) throw new Error(`database/migrations not found (looked in: ${candidates.join(", ")})`);
  return found;
}

export type MigrationResult = { applied: string[]; skipped: string[]; drift: string[] };

export async function runMigrations(pool: Pool, migrationsDir: string, log: (m: string) => void = console.log): Promise<MigrationResult> {
  const client = await pool.connect();
  const result: MigrationResult = { applied: [], skipped: [], drift: [] };
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK]);
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS platform;
      CREATE TABLE IF NOT EXISTS platform.schema_migrations (
        version     VARCHAR(10) PRIMARY KEY,
        name        TEXT        NOT NULL,
        checksum    CHAR(64)    NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );`);
    const applied = new Map<string, string>(
      (await client.query<{ version: string; checksum: string }>("SELECT version, checksum FROM platform.schema_migrations")).rows.map((r) => [r.version, r.checksum]),
    );
    const files = fs.readdirSync(migrationsDir).filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f)).sort();
    for (const file of files) {
      const version = file.slice(0, 3);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      const existing = applied.get(version);
      if (existing) {
        if (existing !== checksum) {
          result.drift.push(file);
          log(`[migrate] WARN ${file} changed after being applied (checksum drift) — create a new migration instead`);
        }
        result.skipped.push(file);
        continue;
      }
      log(`[migrate] applying ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO platform.schema_migrations (version, name, checksum) VALUES ($1, $2, $3)", [version, file, checksum]);
        await client.query("COMMIT");
        result.applied.push(file);
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
      }
    }
    log(`[migrate] done — applied ${result.applied.length}, already applied ${result.skipped.length}`);
    return result;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK]).catch(() => undefined);
    client.release();
  }
}

/** Apply demo seed files idempotently per domain. */
export async function runSeeds(pool: Pool, seedsDir: string, log: (m: string) => void = console.log): Promise<boolean> {
  const files = fs.existsSync(seedsDir) ? fs.readdirSync(seedsDir).filter((f) => f.endsWith(".sql")).sort() : [];
  if (!files.length) return false;

  let anyApplied = false;
  const client = await pool.connect();
  try {
    for (const f of files) {
      let needsSeed = false;
      if (f.includes("workforce")) {
        const { rows } = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM workforce.employees");
        needsSeed = rows[0].n === 0;
      } else if (f.includes("shift")) {
        const { rows } = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM shift.shift_instances");
        needsSeed = rows[0].n === 0;
      }

      if (needsSeed) {
        log(`[seed] applying ${f}`);
        await client.query("BEGIN");
        await client.query(fs.readFileSync(path.join(seedsDir, f), "utf8"));
        await client.query("COMMIT");
        anyApplied = true;
      }
    }
    return anyApplied;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/** Refresh the denormalised status column (reads always use the computed view). */
export async function refreshCredentialStatuses(pool: Pool): Promise<number> {
  const r = await pool.query(`
    UPDATE credential.credentials
       SET status = credential.compute_status(expiry_date, verified_at, CURRENT_DATE)
     WHERE status IS DISTINCT FROM credential.compute_status(expiry_date, verified_at, CURRENT_DATE)`);
  return r.rowCount ?? 0;
}
