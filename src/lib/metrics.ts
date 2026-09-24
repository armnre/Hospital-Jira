import fs from "node:fs/promises";
import os from "node:os";

export type HostMetrics = {
  collectedAt: string;
  hostname: string;
  uptimeSec: number;
  cpu: { cores: number; model: string; load1: number; load5: number; load15: number; usagePct: number };
  memory: { totalBytes: number; freeBytes: number; usedPct: number; processRssBytes: number };
  disk: { path: string; totalBytes: number; freeBytes: number; usedPct: number };
};

function cpuTimes() {
  return os.cpus().reduce(
    (acc, c) => {
      const t = c.times;
      acc.idle += t.idle;
      acc.total += t.user + t.nice + t.sys + t.idle + t.irq;
      return acc;
    },
    { idle: 0, total: 0 },
  );
}

async function memInfo(): Promise<{ total: number; available: number }> {
  try {
    const txt = await fs.readFile("/proc/meminfo", "utf8");
    const get = (k: string) => Number(txt.match(new RegExp(`^${k}:\\s+(\\d+)`, "m"))?.[1] ?? 0) * 1024;
    const total = get("MemTotal");
    const available = get("MemAvailable");
    if (total > 0 && available > 0) return { total, available };
  } catch {
    /* non-linux */
  }
  return { total: os.totalmem(), available: os.freemem() };
}

export async function collectHostMetrics(sampleMs = 250): Promise<HostMetrics> {
  const a = cpuTimes();
  await new Promise((r) => setTimeout(r, sampleMs));
  const b = cpuTimes();
  const totalDelta = b.total - a.total;
  const usagePct = totalDelta > 0 ? (1 - (b.idle - a.idle) / totalDelta) * 100 : 0;
  const [l1, l5, l15] = os.loadavg();
  const mem = await memInfo();
  let disk = { path: process.cwd(), totalBytes: 0, freeBytes: 0, usedPct: 0 };
  try {
    const s = await fs.statfs(process.cwd());
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    disk = { path: process.cwd(), totalBytes: total, freeBytes: free, usedPct: total > 0 ? ((total - free) / total) * 100 : 0 };
  } catch {
    /* ignore */
  }
  return {
    collectedAt: new Date().toISOString(),
    hostname: os.hostname(),
    uptimeSec: os.uptime(),
    cpu: { cores: os.cpus().length, model: os.cpus()[0]?.model ?? "unknown", load1: l1, load5: l5, load15: l15, usagePct: Math.max(0, usagePct) },
    memory: { totalBytes: mem.total, freeBytes: mem.available, usedPct: ((mem.total - mem.available) / mem.total) * 100, processRssBytes: process.memoryUsage().rss },
    disk,
  };
}
