/**
 * HWDT backend — standalone entrypoint (Docker service "backend").
 *   node --import tsx src/server.ts
 */
import http from "node:http";
import { createApp } from "./app";
import { bootstrap, scheduleStatusRefresh } from "./bootstrap";
import { loadConfig } from "./config/env";
import { createPool } from "./db/pool";

async function main() {
  const config = loadConfig();
  const pool = createPool(config);
  await bootstrap(pool, config);
  scheduleStatusRefresh(pool);
  const server = http.createServer(createApp({ pool, config }));
  server.listen(config.port, config.host, () => console.log(`[hwdt-backend] listening on http://${config.host}:${config.port}/api/v1`));

  const shutdown = (signal: string) => {
    console.log(`[hwdt-backend] ${signal} received — shutting down`);
    server.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((e) => {
  console.error("[hwdt-backend] fatal", e);
  process.exit(1);
});
