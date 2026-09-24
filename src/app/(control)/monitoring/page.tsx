import { LiveMetrics } from "@/components/LiveMetrics";
import { Markdown } from "@/components/Markdown";
import { Card, PageHeader, Pill, Table } from "@/components/ui";
import { loadCompose, readPlatformFile } from "@/lib/platform";
import YAML from "yaml";

export const dynamic = "force-dynamic";

type AlertFile = { groups: { name: string; rules: { alert: string; expr: string; for?: string; labels: { severity: string }; annotations: { summary: string } }[] }[] };

export default function MonitoringPage() {
  const compose = loadCompose();
  const alerts = YAML.parse(readPlatformFile("monitoring/prometheus/alerts.yml")) as AlertFile;
  const doc = readPlatformFile("docs/health-check.md");

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow="Monitoring Foundation" title="Container status · CPU · Memory · Disk">
        Live host metrics from this environment, sampled every 3 s. On a Docker host the same signals come from cAdvisor (per container) and
        node-exporter (host). Prometheus scrapes both and evaluates the alert rules below.
      </PageHeader>

      <Card title="Live host metrics (this environment)" className="mb-6">
        <LiveMetrics />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Container health checks (docker-compose.yml)">
          <Table
            head={["Container", "Probe", "Interval", "Start period"]}
            rows={Object.entries(compose.services)
              .filter(([, s]) => s.healthcheck)
              .map(([n, s]) => [
                <span key="n" className="font-medium">{s.container_name ?? n}</span>,
                <code key="t" className="block max-w-xs truncate text-[11px] text-slate-600" title={JSON.stringify(s.healthcheck?.test)}>{Array.isArray(s.healthcheck?.test) ? (s.healthcheck?.test as string[]).slice(1).join(" ") : String(s.healthcheck?.test)}</code>,
                s.healthcheck?.interval ?? "—",
                s.healthcheck?.start_period ?? "—",
              ])}
          />
        </Card>
        <Card title="Prometheus alert rules (monitoring/prometheus/alerts.yml)">
          <Table
            head={["Alert", "Severity", "For", "Summary"]}
            rows={alerts.groups.flatMap((g) =>
              g.rules.map((r) => [
                <span key="a" className="font-medium">{r.alert}</span>,
                <Pill key="s" tone={r.labels.severity === "critical" ? "amber" : "slate"}>{r.labels.severity}</Pill>,
                r.for ?? "—",
                <span key="d" className="text-xs text-slate-600">{r.annotations.summary}</span>,
              ]),
            )}
          />
        </Card>
      </div>

      <Card title="Health-check documentation (docs/health-check.md)" className="mt-6">
        <Markdown source={doc} />
      </Card>
    </div>
  );
}
