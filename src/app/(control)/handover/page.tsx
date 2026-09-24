import { Markdown } from "@/components/Markdown";
import { Card, PageHeader } from "@/components/ui";
import { readPlatformFile } from "@/lib/platform";

export const dynamic = "force-dynamic";

export default function HandoverPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow="Report 6 · Handover" title="Run the entire environment with one command">
        For the next developer: clone the repository and run one script. Everything else (secrets, hosts entries, images, volumes, databases, backups,
        monitoring) is automated.
      </PageHeader>

      <div className="mb-6 rounded-2xl bg-slate-900 p-6 text-slate-100 shadow">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-teal-300">One command</p>
        <pre className="overflow-x-auto font-mono text-sm leading-relaxed">
{`git clone <repo> && cd hospital-workforce-platform
./scripts/setup.sh`}
        </pre>
        <p className="mt-4 mb-2 text-xs font-semibold uppercase tracking-widest text-teal-300">…or, with an existing .env</p>
        <pre className="overflow-x-auto font-mono text-sm">docker compose up -d</pre>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        {[
          ["1", "Bootstrap", "./scripts/setup.sh → .env with random secrets, /etc/hosts, docker compose up -d"],
          ["2", "Licence wizards", "Open jira.local / confluence.local. The DB is pre-wired; enter a trial licence and create the admin user"],
          ["3", "Provision", "docker compose --profile provision run --rm provisioner"],
          ["4", "Verify", "./scripts/validate_environment.sh and ./scripts/health_check.sh"],
        ].map(([n, t, d]) => (
          <div key={n} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-teal-600 text-sm font-bold text-white">{n}</span>
            <p className="mt-2 font-semibold">{t}</p>
            <p className="text-xs text-slate-600">{d}</p>
          </div>
        ))}
      </div>

      <Card title="README.md" className="mb-6">
        <Markdown source={readPlatformFile("README.md")} />
      </Card>
      <Card title="Deployment Guide (docs/06-deployment-guide.md)">
        <Markdown source={readPlatformFile("docs/06-deployment-guide.md")} />
      </Card>
    </div>
  );
}
