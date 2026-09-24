import { execFileSync } from "node:child_process";
import Link from "next/link";
import { Markdown } from "@/components/Markdown";
import { Card, PageHeader, Pill, Stat, Table } from "@/components/ui";
import { PLATFORM_DIR, loadConfluenceConfig, platformFileExists, readPlatformFile, readPlatformJson, slugify } from "@/lib/platform";

export const dynamic = "force-dynamic";

type BacklogItem = { key: string; ref: string; type: string; epic: string; module: string; points: number; status: string; summary: string; acceptanceCriteria: string[] };
type Backlog = { phase: string; release: string; sprint: string; epics: { ref: string; key: string; name: string }[]; items: BacklogItem[] };
type Commit = { hash: string; subject: string; date: string; key: string | null; files: number };

function gitLog(): Commit[] {
  try {
    const out = execFileSync("git", ["log", "--pretty=format:%h\x1f%s\x1f%ad", "--date=short", "--shortstat"], { cwd: PLATFORM_DIR, encoding: "utf8" });
    const commits: Commit[] = [];
    for (const line of out.split("\n")) {
      if (line.includes("\x1f")) {
        const [hash, subject, date] = line.split("\x1f");
        commits.push({ hash, subject, date, key: subject.match(/^(HWDT-\d+):/)?.[1] ?? null, files: 0 });
      } else if (line.includes("changed") && commits.length) {
        commits[commits.length - 1].files = Number(line.trim().split(" ")[0]) || 0;
      }
    }
    return commits;
  } catch {
    return [];
  }
}

export default function Phase1Page() {
  const backlog = readPlatformJson<Backlog>("jira/configuration/phase1-backlog.json");
  const commits = gitLog();
  const byKey = new Map<string, Commit[]>();
  for (const c of commits) if (c.key) byKey.set(c.key, [...(byKey.get(c.key) ?? []), c]);
  const pages = loadConfluenceConfig().pages.filter((p) => p.title.startsWith("Phase 1"));
  const report = platformFileExists("docs/phase1-test-report.md") ? readPlatformFile("docs/phase1-test-report.md") : null;
  const linked = commits.filter((c) => c.key).length;
  const epicName = (ref: string) => backlog.epics.find((e) => e.ref === ref)?.name ?? (ref === "EPIC-001" ? "Infrastructure Foundation" : ref);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Phase 1 · Delivery report"
        title="Employee Digital Twin + Credential Management"
        actions={
          <>
            <Link href="/login" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">Open Workforce App →</Link>
            <Link href="/validation" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Run validation</Link>
          </>
        }
      >
        React + TypeScript frontend, Node.js/Express backend with JWT and RBAC, and PostgreSQL migrations. Everything is linked to the Jira backlog in{" "}
        <code>jira/configuration/phase1-backlog.json</code> and to commits in the platform Git repository.
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Jira items" value={backlog.items.length} sub={`${backlog.items.filter((i) => i.type === "Story").length} stories · 2 epics`} />
        <Stat label="Story points" value={backlog.items.reduce((s, i) => s + i.points, 0)} tone="teal" sub={backlog.sprint} />
        <Stat label="Done" value={`${backlog.items.filter((i) => i.status === "DONE").length}/${backlog.items.length}`} tone="green" />
        <Stat label="Commits linked" value={`${linked}/${commits.length}`} sub="HWDT-XXX: description" />
        <Stat label="Confluence pages" value={pages.length} sub="Phase 1 docs" />
      </div>

      <Card title={`Jira backlog: ${backlog.release}`} className="mb-6">
        <Table
          head={["Key", "Type", "Summary", "Epic", "Pts", "Status", "Commits"]}
          rows={backlog.items.map((i) => [
            <span key="k" className="font-mono text-xs font-bold text-sky-700">{i.key}</span>,
            <Pill key="t" tone={i.type === "Story" ? "emerald" : i.type === "Infrastructure Task" ? "violet" : "sky"}>{i.type}</Pill>,
            <details key="s">
              <summary className="cursor-pointer font-medium">{i.summary}</summary>
              <ul className="mt-1 list-disc pl-5 text-xs text-slate-500">{i.acceptanceCriteria.map((a) => <li key={a}>{a}</li>)}</ul>
            </details>,
            <span key="e" className="text-xs">{i.epic} · {epicName(i.epic)}</span>,
            i.points,
            <Pill key="st" tone="emerald">{i.status}</Pill>,
            <span key="c" className="font-mono text-xs">{(byKey.get(i.key) ?? []).map((c) => c.hash).join(" ") || "—"}</span>,
          ])}
        />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Git history (platform repository)">
          <ul className="max-h-96 space-y-1 overflow-auto font-mono text-xs">
            {commits.map((c) => (
              <li key={c.hash} className="flex gap-2">
                <span className="text-slate-400">{c.hash}</span>
                <span className={c.key ? "text-slate-800" : "text-amber-700"}>{c.subject}</span>
                <span className="ml-auto shrink-0 text-slate-400">{c.files} files</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            A <code>commit-msg</code> hook (<code>scripts/git-hooks/commit-msg</code>) rejects commits without a Jira key.
          </p>
        </Card>
        <Card title="Confluence: Phase 1 pages">
          <ul className="space-y-2">
            {pages.map((p) => (
              <li key={p.title}>
                <Link href={`/confluence/${slugify(p.title)}`} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 hover:border-teal-300">
                  <span className="font-medium">{p.title}</span>
                  <code className="text-xs text-slate-400">{p.source}</code>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Phase 1 test report" className="mt-6">
        {report ? <Markdown source={report} /> : <p className="text-sm text-slate-500">Run <code>scripts/run_phase1_tests.sh</code> to generate docs/phase1-test-report.md.</p>}
      </Card>
    </div>
  );
}
