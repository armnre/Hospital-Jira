import Link from "next/link";
import { Card, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { ValidationRunner } from "@/components/ValidationRunner";
import { TEST_CATALOGUE, getLatestRun, getRun, listRuns } from "@/lib/validation";

export const dynamic = "force-dynamic";

const CHECKLIST: [string, string, string[]][] = [
  ["Docker", "Containers start", ["DOC-06", "DOC-01", "DOC-02", "DOC-03", "DOC-04"]],
  ["Database", "PostgreSQL works", ["DB-01", "DB-02", "DB-03", "DB-04"]],
  ["Jira", "Accessible", ["JIR-05"]],
  ["Confluence", "Accessible", ["CNF-02"]],
  ["Backup", "Backup created", ["BAK-01"]],
  ["Restore", "Restore tested", ["RST-01", "RST-02"]],
  ["Networking", "Internal routing works", ["NET-01", "NET-03"]],
];

export default async function ValidationPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run: runParam } = await searchParams;
  const data = runParam ? await getRun(Number(runParam)) : await getLatestRun();
  const runs = await listRuns(15);
  const byId = new Map(data?.results.map((r) => [r.testId, r]) ?? []);
  const categories = [...new Set(TEST_CATALOGUE.map((t) => t.category))];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow="Report 5 · Test Report" title="Phase 0 Validation Suite" actions={<ValidationRunner total={TEST_CATALOGUE.length} />}>
        {TEST_CATALOGUE.length} automated tests. They run real shell scripts (<code>01-init-databases.sh</code>, <code>backup_database.sh</code>,{" "}
        <code>test_restore.sh</code>, <code>restore_database.sh</code>) against the PostgreSQL instance in this environment and statically verify every
        configuration file. Checks that need a live Docker daemon report <strong>BLOCKED</strong>; they are never marked as passed.
      </PageHeader>

      {!data ? (
        <Card><p className="py-10 text-center text-slate-500">No validation run yet. Click <strong>Run full validation</strong>.</p></Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label={`Run #${data.run.id}`} value={<StatusBadge status={data.run.status} />} sub={new Date(data.run.startedAt).toLocaleString()} />
            <Stat label="Passed" value={data.run.passed} tone="green" />
            <Stat label="Failed" value={data.run.failed} tone={data.run.failed ? "red" : "slate"} />
            <Stat label="Blocked (env.)" value={data.run.blocked} tone="amber" sub="needs Docker daemon" />
            <Stat
              label="Duration"
              value={data.run.finishedAt ? `${((new Date(data.run.finishedAt).getTime() - new Date(data.run.startedAt).getTime()) / 1000).toFixed(1)}s` : "…"}
            />
          </div>

          <Card title="Required validation checklist" className="mb-6">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {CHECKLIST.map(([area, label, ids]) => {
                const res = ids.map((i) => byId.get(i)).filter(Boolean);
                const primary = byId.get(ids[0]);
                const status = res.some((r) => r?.status === "FAIL") ? "FAIL" : primary?.status ?? "—";
                const staticOk = res.filter((r) => r?.status === "PASS").length;
                return (
                  <div key={area} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase text-slate-500">{area}</p>
                      <StatusBadge status={status} />
                    </div>
                    <p className="mt-1 text-sm font-medium">{status === "PASS" ? "✓" : status === "BLOCKED" ? "◐" : "✗"} {label}</p>
                    <p className="text-xs text-slate-500">{staticOk}/{ids.length} supporting tests passed</p>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-500">Environment: {data.run.environment}</p>
          </Card>

          <div className="space-y-4">
            {categories.map((cat) => (
              <Card key={cat} title={cat}>
                <div className="divide-y divide-slate-100">
                  {TEST_CATALOGUE.filter((t) => t.category === cat).map((t) => {
                    const r = byId.get(t.id);
                    return (
                      <details key={t.id} className="group py-2">
                        <summary className="flex cursor-pointer list-none items-start gap-3">
                          <span className="mt-0.5 w-16 shrink-0 font-mono text-xs text-slate-400">{t.id}</span>
                          <span className="flex-1">
                            <span className="block text-sm font-medium text-slate-900">{t.name}</span>
                            <span className="block text-xs text-slate-500">{r?.details ?? "not executed in this run"}</span>
                          </span>
                          <span className="shrink-0 text-right">
                            <StatusBadge status={r?.status ?? "—"} />
                            {r && <span className="block text-[10px] text-slate-400">{r.durationMs} ms</span>}
                          </span>
                        </summary>
                        {r?.evidence && (
                          <pre className="mt-2 ml-19 max-h-80 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">{r.evidence}</pre>
                        )}
                      </details>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <Card title="Errors & fixes found while building Phase 0" className="mt-6">
        <ul className="space-y-2 text-sm text-slate-700">
          <li><strong>Confluence collation:</strong> <code>en_US.UTF-8</code> is missing on minimal PostgreSQL hosts, so <code>CREATE DATABASE</code> failed. <em>Fix:</em> the init script now falls back to <code>C.UTF-8</code> and logs a warning. The official <code>postgres:15-bookworm</code> image has en_US.</li>
          <li><strong>Nginx boot order:</strong> a static <code>proxy_pass http://jira:8080</code> makes nginx exit if Jira isn&apos;t resolvable yet. <em>Fix:</em> resolve lazily through <code>resolver 127.0.0.11</code> with variables, plus a friendly 503 while upstreams boot.</li>
          <li><strong>Restore ownership:</strong> a plain <code>pg_restore</code> left objects owned by the superuser. <em>Fix:</em> <code>--no-owner --role=&lt;app role&gt;</code>, so restored tables stay owned by <code>jira_user</code>/<code>confluence_user</code> (checked in RST-02).</li>
          <li><strong>Collation lost on in-place restore (caught by this suite, run #2):</strong> restoring over the live <code>jira_db</code> recreated it with the server default <code>C.UTF-8</code> instead of <code>C</code>, which Jira requires, so DB-03 failed. <em>Fix:</em> <code>restore_database.sh</code> now reads encoding and collation <em>before</em> dropping the target, and RST-02 checks collation and ownership after every restore.</li>
          <li><strong>Phase 1: secret scanner false positive:</strong> GIT-02 flagged <code>HWDT_REQUIRE_JWT_SECRET: &quot;true&quot;</code> in docker-compose.yml. <em>Fix:</em> the scanner now allows only the literal booleans <code>true</code>/<code>false</code>, so real literals (including numbers) are still caught.</li>
          <li><strong>Phase 1: test data rejected by validation:</strong> integration fixtures used last names like <code>Employee0001</code>, which the name rule rejects (422). <em>Fix:</em> the fixtures now use letter-only names; the validation rule stays strict.</li>
          <li><strong>Phase 1: pgcrypto in hwdt_db init:</strong> the <code>COMMENT ON EXTENSION</code> in the dump would break <code>pg_restore --role=hwdt_app</code>. <em>Fix:</em> the extension was removed (<code>gen_random_uuid()</code> is core in PG13+). The hwdt_db restore test now passes.</li>
          <li><strong>No Docker daemon in this sandbox:</strong> live container, Jira/Confluence HTTP and proxy checks can&apos;t run here. <em>Mitigation:</em> they report BLOCKED here and run on any Docker host via <code>./scripts/validate_environment.sh</code>.</li>
        </ul>
      </Card>

      {runs.length > 0 && (
        <Card title="Run history" className="mt-6">
          <div className="flex flex-wrap gap-2">
            {runs.map((r) => (
              <Link key={r.id} href={`/validation?run=${r.id}`} className={`rounded-lg border px-3 py-1.5 text-xs hover:bg-slate-50 ${data?.run.id === r.id ? "border-teal-400 bg-teal-50" : "border-slate-200"}`}>
                #{r.id} · {r.passed}✓ {r.failed}✗ {r.blocked}◐ · {new Date(r.startedAt).toLocaleTimeString()}
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
