"use client";

import { useEffect, useState } from "react";

type M = {
  collectedAt: string;
  hostname: string;
  uptimeSec: number;
  cpu: { cores: number; model: string; load1: number; load5: number; load15: number; usagePct: number };
  memory: { totalBytes: number; freeBytes: number; usedPct: number; processRssBytes: number };
  disk: { path: string; totalBytes: number; freeBytes: number; usedPct: number };
};

const gib = (b: number) => `${(b / 2 ** 30).toFixed(1)} GiB`;

function Gauge({ label, pct, sub, warn, crit }: { label: string; pct: number; sub: string; warn: number; crit: number }) {
  const color = pct >= crit ? "bg-rose-500" : pct >= warn ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-2xl font-bold">{pct.toFixed(1)}%</p>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">{sub}</p>
      <p className="text-[10px] text-slate-400">alert: warn ≥{warn}% · critical ≥{crit}%</p>
    </div>
  );
}

export function LiveMetrics() {
  const [m, setM] = useState<M | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/metrics", { cache: "no-store" });
        const data = (await res.json()) as M;
        if (!alive) return;
        setM(data);
        setHistory((h) => [...h.slice(-39), data.cpu.usagePct]);
      } catch {
        /* keep last value */
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!m) return <p className="text-sm text-slate-500">Collecting metrics…</p>;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Gauge label="CPU usage" pct={m.cpu.usagePct} warn={70} crit={85} sub={`${m.cpu.cores} cores · load ${m.cpu.load1.toFixed(2)} / ${m.cpu.load5.toFixed(2)} / ${m.cpu.load15.toFixed(2)}`} />
        <Gauge label="Memory usage" pct={m.memory.usedPct} warn={80} crit={90} sub={`${gib(m.memory.totalBytes - m.memory.freeBytes)} of ${gib(m.memory.totalBytes)} · app RSS ${(m.memory.processRssBytes / 2 ** 20).toFixed(0)} MiB`} />
        <Gauge label="Disk usage" pct={m.disk.usedPct} warn={75} crit={85} sub={`${gib(m.disk.freeBytes)} free of ${gib(m.disk.totalBytes)}`} />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex justify-between text-xs text-slate-500">
          <span>CPU history (3 s samples)</span>
          <span>{m.hostname} · up {(m.uptimeSec / 3600).toFixed(1)} h · {new Date(m.collectedAt).toLocaleTimeString()}</span>
        </div>
        <div className="flex h-20 items-end gap-1">
          {history.map((v, i) => (
            <div key={i} className="flex-1 rounded-t bg-teal-400/80" style={{ height: `${Math.max(2, v)}%` }} title={`${v.toFixed(1)}%`} />
          ))}
        </div>
      </div>
    </div>
  );
}
