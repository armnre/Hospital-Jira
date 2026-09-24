import path from "node:path";
import type { Pool } from "pg";
import type { Config } from "./config/env";
import { refreshCredentialStatuses, resolveDatabaseDir, runMigrations, runSeeds } from "./db/migrate";
import { ensureSeedUsers } from "./modules/auth/auth.service";

/** Migrate → seed (optional) → users → refresh denormalised credential status. Safe to run on every start. */
export async function bootstrap(pool: Pool, config: Config, log: (m: string) => void = console.log) {
  const dir = resolveDatabaseDir();
  const migrations = await runMigrations(pool, path.join(dir, "migrations"), log);
  const seeded = config.seedDemo ? await runSeeds(pool, path.join(dir, "seeds"), log) : false;
  await ensureSeedUsers(pool, config, log);
  const refreshed = await refreshCredentialStatuses(pool);
  log(`[bootstrap] ready (seeded=${seeded}, statuses refreshed=${refreshed})`);
  return { migrations, seeded, refreshed };
}

/** Daily status refresh so the stored status column stays in sync with the computed view. */
export function scheduleStatusRefresh(pool: Pool, everyMs = 6 * 3600_000): NodeJS.Timeout {
  const t = setInterval(() => {
    refreshCredentialStatuses(pool).catch((e) => console.error("[hwdt-backend] status refresh failed", e));
  }, everyMs);
  t.unref();
  return t;
}
