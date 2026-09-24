import { Card, PageHeader, Pill, Stat, Table } from "@/components/ui";
import { loadJiraConfig, platformFileExists } from "@/lib/platform";

export const dynamic = "force-dynamic";

const categoryTone: Record<string, string> = {
  "To Do": "bg-slate-100 border-slate-300 text-slate-700",
  "In Progress": "bg-sky-50 border-sky-300 text-sky-800",
  Done: "bg-emerald-50 border-emerald-300 text-emerald-800",
};

export default function JiraPage() {
  const c = loadJiraConfig();
  const allPerms = [...new Set(c.permissionScheme.roles.flatMap((r) => r.permissions))];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader eyebrow="Report 3 · Jira Configuration" title={`${c.project.name} (${c.project.key})`}>
        Configuration-as-code from <code>jira/configuration/hwdt-project.json</code> v{c.version}. It is applied by{" "}
        <code>docker compose --profile provision run --rm provisioner</code> through the Jira REST API.
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Project key" value={c.project.key} tone="teal" />
        <Stat label="Issue types" value={c.issueTypes.length} />
        <Stat label="Custom fields" value={c.customFields.length} />
        <Stat label="Workflows" value={c.workflows.length} />
        <Stat label="Epics" value={c.epics.length} />
        <Stat label="Roles" value={c.permissionScheme.roles.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Project structure">
          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt className="text-slate-500">Name</dt><dd className="col-span-2 font-medium">{c.project.name}</dd>
            <dt className="text-slate-500">Key</dt><dd className="col-span-2 font-mono">{c.project.key}</dd>
            <dt className="text-slate-500">Type / template</dt><dd className="col-span-2 text-xs"><code>{c.project.projectTypeKey}</code> · <code>{c.project.projectTemplateKey.split(":")[1]}</code></dd>
            <dt className="text-slate-500">Description</dt><dd className="col-span-2 text-slate-600">{c.project.description}</dd>
            <dt className="text-slate-500">Components</dt><dd className="col-span-2 flex flex-wrap gap-1">{c.project.components.map((x) => <Pill key={x.name} tone="sky">{x.name}</Pill>)}</dd>
            <dt className="text-slate-500">Versions</dt><dd className="col-span-2 flex flex-wrap gap-1">{c.versions.map((v) => <Pill key={v.name} tone="violet">{v.name}</Pill>)}</dd>
            <dt className="text-slate-500">Workflow scheme</dt><dd className="col-span-2">{c.workflowScheme.name}</dd>
            <dt className="text-slate-500">Permission scheme</dt><dd className="col-span-2">{c.permissionScheme.name}</dd>
          </dl>
        </Card>

        <Card title="Issue types">
          <Table
            head={["Issue type", "Origin", "Workflow"]}
            rows={c.issueTypes.map((i) => [
              <span key="n"><span className="font-medium">{i.name}</span><span className="block text-xs text-slate-500">{i.description}</span></span>,
              i.builtIn ? <Pill key="b">built-in</Pill> : <Pill key="b" tone="teal">custom (provisioned)</Pill>,
              <span key="w" className="text-xs">{i.workflow.replace("HWDT ", "")}</span>,
            ])}
          />
        </Card>
      </div>

      <Card title="Workflows" className="mt-6">
        <div className="space-y-8">
          {c.workflows.map((wf) => {
            const file = `jira/configuration/workflows/${wf.name.toLowerCase().replace(/ /g, "-")}.xml`;
            return (
              <div key={wf.name}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{wf.name}</h3>
                  <span className="text-sm text-slate-500">{wf.description}</span>
                  {platformFileExists(file) && <a href={`/deployment?file=${encodeURIComponent(file)}`}><Pill tone="emerald">OSWorkflow XML ↗</Pill></a>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {wf.statuses.map((s, i) => (
                    <div key={s.name} className="flex items-center gap-1.5">
                      <span className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${categoryTone[s.category]}`}>{s.name}</span>
                      {i < wf.statuses.length - 1 && <span className="text-slate-400">→</span>}
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid gap-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                  {wf.transitions.map((t) => (
                    <div key={`${t.from}-${t.name}`} className={`rounded-md px-2 py-1 ${t.backward ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-700"}`}>
                      <strong>{t.name}</strong>: {t.from} → {t.to}{t.resolution ? " · sets resolution" : ""}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="text-xs text-slate-500">
            Mapping: default workflow <strong>{c.workflowScheme.defaultWorkflow}</strong>;{" "}
            {Object.entries(c.workflowScheme.mappings).map(([k, v]) => `${k} → ${v}`).join("; ")}.
          </p>
        </div>
      </Card>

      <Card title="Custom fields" className="mt-6">
        <Table
          head={["Field", "Type", "Options", "Applies to"]}
          rows={c.customFields.map((f) => [
            <span key="n"><span className="font-medium">{f.name}</span><span className="block text-xs text-slate-500">{f.description}</span></span>,
            <code key="t" className="text-xs">{f.type.split(":")[1]}</code>,
            <span key="o" className="flex max-w-md flex-wrap gap-1">{f.options.length ? f.options.map((o) => <Pill key={o}>{o}</Pill>) : <span className="text-xs text-slate-400">—</span>}</span>,
            <span key="a" className="text-xs">{Array.isArray(f.issueTypes) ? f.issueTypes.join(", ") : "All issue types"}</span>,
          ])}
        />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card title="Epics" className="lg:col-span-2">
          <ul className="space-y-2">
            {c.epics.map((e) => (
              <li key={e.ref} className="flex gap-3 rounded-lg border border-slate-100 p-2">
                <span className="rounded-md bg-violet-100 px-2 py-1 font-mono text-xs font-bold text-violet-700">{e.ref}</span>
                <span><span className="block text-sm font-medium">{e.name}</span><span className="block text-xs text-slate-500">{e.description}</span></span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Permissions (HWDT Permission Scheme)" className="lg:col-span-3">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="px-2 py-2 text-left font-semibold text-slate-500">Permission</th>
                  {c.permissionScheme.roles.map((r) => (
                    <th key={r.role} className="px-2 py-2 text-center font-semibold text-slate-700">{r.role}<span className="block font-normal text-slate-400">{r.group}</span></th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allPerms.map((p) => (
                  <tr key={p}>
                    <td className="px-2 py-1 font-mono text-slate-600">{p}</td>
                    {c.permissionScheme.roles.map((r) => (
                      <td key={r.role} className="px-2 py-1 text-center">{r.permissions.includes(p) ? <span className="text-emerald-600">●</span> : <span className="text-slate-200">○</span>}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="Automation coverage (Jira Data Center REST limits)" className="mt-6">
        <Table
          head={["Item", "How", "Status"]}
          rows={[
            ["Issue types, custom fields, project, components, versions, epics", "REST API (idempotent provisioner)", <Pill key="1" tone="emerald">automated</Pill>],
            ["Select-list options", "Best-effort REST; otherwise the provisioner prints the list", <Pill key="2" tone="amber">best effort</Pill>],
            ["Workflows", "OSWorkflow XML rendered with real status IDs → Admin › Workflows › Import", <Pill key="3" tone="amber">semi-automated</Pill>],
            ["Statuses, workflow scheme, permission scheme association", "Admin UI (fully specified in JSON; no public DC REST API)", <Pill key="4">manual, documented</Pill>],
          ]}
        />
      </Card>
    </div>
  );
}
