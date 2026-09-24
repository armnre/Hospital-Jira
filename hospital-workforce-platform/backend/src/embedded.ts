/**
 * Embedded mode: starts the same Express backend on a loopback port inside another Node process
 * (used by the sandbox preview, where the Next.js frontend proxies /api/v1/* to it).
 * In Docker the backend runs standalone via src/server.ts.
 */
import http from "node:http";
import { createApp } from "./app";
import { bootstrap, scheduleStatusRefresh } from "./bootstrap";
import { loadConfig } from "./config/env";
import { createPool } from "./db/pool";

const g = globalThis as typeof globalThis & { __hwdtEmbeddedBackend?: Promise<string> };

async function isHealthy(url: string): Promise<boolean> {
  try {
    const r = await fetch(`${url}/api/v1/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function start(): Promise<string> {
  const port = Number(process.env.HWDT_EMBEDDED_BACKEND_PORT ?? 4100);
  const url = `http://127.0.0.1:${port}`;
  if (await isHealthy(url)) return url; // already started by another worker
  const config = loadConfig();
  const pool = createPool(config);
  await bootstrap(pool, config);
  scheduleStatusRefresh(pool);
  const server = http.createServer(createApp({ pool, config }));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  }).catch(async (e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE" && (await isHealthy(url))) return;
    throw e;
  });
  console.log(`[hwdt-backend] embedded Express API on ${url}/api/v1`);
  return url;
}

export function ensureEmbeddedBackend(): Promise<string> {
  g.__hwdtEmbeddedBackend ??= start().catch((e) => {
    g.__hwdtEmbeddedBackend = undefined;
    throw e;
  });
  return g.__hwdtEmbeddedBackend;
}
