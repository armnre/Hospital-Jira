/** CLI: `npm run migrate` (backend container) — applies database/migrations and optional seeds. */
import { bootstrap } from "../bootstrap";
import { loadConfig } from "../config/env";
import { createPool } from "./pool";

const config = loadConfig();
const pool = createPool(config, 2);
bootstrap(pool, config)
  .then((r) => {
    console.log(JSON.stringify({ applied: r.migrations.applied, alreadyApplied: r.migrations.skipped.length, drift: r.migrations.drift, seeded: r.seeded }, null, 2));
    return pool.end();
  })
  .catch(async (e) => {
    console.error(e);
    await pool.end();
    process.exit(1);
  });
