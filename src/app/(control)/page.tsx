import Link from "next/link";
import { Card, PageHeader, Pill, Stat, StatusBadge, Table } from "@/components/ui";
import { loadCompose } from "@/lib/platform";
import { getLatestRun } from "@/lib/validation";

export const dynamic = "force-dynamic";

function Node({ title, sub, tone, port }: { title: string; sub: string; tone: string; port?: string }) {
  return (
    <div className={`rounded-xl border-2 bg-white px-3 py-2.5 text-center shadow-sm ${tone}`}>
      <p className="text-sm font-bold text-slate-900">{title}</p>
      <p className="text-[11px] text-slate-500">{sub}</p>
      {port && <p className="mt-1 font-mono text-[10px] text-slate-400">{port}</p>}
    </div>
  );
}

const Arrow = ({ label }: { label?: string }) => (
  <div className="flex flex-col items-center py-1 text-slate-400">
    <div className="h-4 w-px bg-slate-300" />
    {label && <span className="rounded bg-slate-100 px-1.5 text-[10px] font-medium text-slate-500">{label}</span>}
    <div className="h-0 w-0 border-x-4 border-t-[6px] border-x-transparent border-t-slate-300" />
  </div>
);

export default async function ArchitecturePage() {
  const compose = loadCompose();
  const latest = await getLatestRun().catch(() => null);
  const services = Object.entries(compose.services);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Report 1 · Architecture"
        title="Phase 0 Infrastructure Foundation"
        actions={
          <>
            <Link href="/validation" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">Run validation</Link>
            <a href="/api/package" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Download package</a>
          </>
        }
      >
        A reproducible Docker Compose stack for the Hospital Workforce Digital Twin: Jira, Confluence, PostgreSQL, Nginx, a backup service and monitoring.
        No business modules yet. Every artifact below is read live from <code className="rounded bg-slate-100 px-1 text-sm">hospital-workforce-platform/</code>.
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Compose services" value={services.length} sub={`${services.filter(([, s]) => !s.profiles).length} long-running + provisioner`} />
        <Stat label="Named volumes" value={Object.keys(compose.volumes ?? {}).length} tone="teal" />
        <Stat label="Networks" value={Object.keys(compose.networks ?? {}).length} sub="frontend / backend" />
        <Stat label="Last validation" value={latest ? <StatusBadge status={latest.run.status} /> : "—"} sub={latest ? `run #${latest.run.id}` : "not run yet"} />
        <Stat label="Tests passed" value={latest ? `${latest.run.passed}/${latest.results.length}` : "—"} tone="green" sub={latest ? `${latest.run.blocked} blocked · ${latest.run.failed} failed` : undefined} />
      </div>

      <Card title="Deployment diagram" className="mb-6">
        <div className="rounded-xl bg-gradient-to-b from-slate-50 to-white p-4">
          <div className="mx-auto max-w-md">
            <Node title="Developer browser" sub="jira.local · confluence.local · monitoring.local" tone="border-slate-300" />
          </div>
          <Arrow label="HTTP :80 / HTTPS :443 (published)" />
          <div className="rounded-2xl border-2 border-dashed border-teal-300 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-teal-700">Docker Compose project “hwdt”</p>
            <div className="mx-auto max-w-sm">
              <Node title="nginx" sub="reverse proxy · security headers · TLS-ready" tone="border-emerald-400" port="hwdt_frontend + hwdt_backend" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Arrow label="jira:8080" />
              <Arrow label="confluence:8090" />
              <Arrow label="prometheus:9090" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Node title="Jira Software 10.3" sub="project HWDT" tone="border-sky-400" port="vol hwdt_jira_data" />
              <Node title="Confluence 9.2" sub="space HWDT" tone="border-indigo-400" port="vol hwdt_confluence_data" />
              <div className="space-y-2">
                <Node title="Prometheus" sub="metrics + alert rules" tone="border-orange-400" port="vol hwdt_prometheus_data" />
                <div className="grid grid-cols-2 gap-2">
                  <Node title="cAdvisor" sub="containers" tone="border-orange-200" />
                  <Node title="node-exporter" sub="host" tone="border-orange-200" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Arrow label="JDBC jira_user" />
              <Arrow label="JDBC confluence_user" />
              <div />
            </div>
            <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Node title="PostgreSQL 15" sub="jira_db (C collation) · confluence_db (UTF-8) · not published" tone="border-blue-500" port="vol hwdt_postgres_data" />
              </div>
              <Node title="backup service" sub="pg_dump daily · sha256 · 7d retention · weekly restore test" tone="border-rose-400" port="bind ./postgres/backups" />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card title="Components (parsed from docker-compose.yml)" className="xl:col-span-3">
          <Table
            head={["Service", "Image", "Restart", "Health check", "Storage"]}
            rows={services.map(([name, s]) => [
              <span key="n" className="font-semibold">{name}{s.profiles && <span className="ml-1"><Pill tone="violet">profile</Pill></span>}</span>,
              <code key="i" className="text-xs text-slate-600">{s.image}</code>,
              s.restart ?? "—",
              s.healthcheck ? <Pill key="h" tone="emerald">{s.healthcheck.interval ?? "yes"}</Pill> : "—",
              <span key="v" className="text-xs text-slate-600">{(s.volumes ?? []).filter((v) => !v.includes(":ro")).map((v) => v.split(":")[0]).join(", ") || "—"}</span>,
            ])}
          />
        </Card>
        <Card title="Data flow" className="xl:col-span-2">
          <ol className="space-y-3 text-sm text-slate-700">
            {[
              ["Request", "Browser resolves *.local → 127.0.0.1 and hits Nginx on :80."],
              ["Routing", "Nginx picks the vhost by Host header and proxies over hwdt_backend using Docker DNS (lazy resolution, 503 while upstream boots)."],
              ["Persistence", "Jira/Confluence write via JDBC to their own database as least-privilege roles; cross-database CONNECT is revoked."],
              ["Backup", "The backup container dumps jira_db + confluence_db (custom format + SHA-256), prunes >7 days and writes a heartbeat for its health check."],
              ["Observability", "cAdvisor (containers) and node-exporter (host) are scraped every 15s by Prometheus; alert rules cover down/CPU/memory/disk."],
              ["Provisioning", "An on-demand provisioner applies Jira & Confluence configuration-as-code through their REST APIs."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-700">{i + 1}</span>
                <span><strong className="text-slate-900">{t}.</strong> {d}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
