import Link from "next/link";
import { Card, PageHeader, Pill, Stat, Table } from "@/components/ui";
import { loadConfluenceConfig, readPlatformFile, slugify } from "@/lib/platform";

export const dynamic = "force-dynamic";

export default function ConfluencePage() {
  const c = loadConfluenceConfig();
  const pages = [...c.pages].sort((a, b) => a.order - b.order).map((p) => {
    const md = readPlatformFile(p.source);
    return { ...p, words: md.split(/\s+/).length, sections: (md.match(/^## /gm) ?? []).length };
  });

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Report 4 · Confluence Documentation" title={c.space.name}>
        Space key <code>{c.space.key}</code>. Page bodies come from <code>docs/*.md</code> (single source of truth) and are converted to Confluence
        storage format by <code>scripts/provision/provision_confluence.py</code>. Re-running the provisioner updates pages in place, with version history.
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Space key" value={c.space.key} tone="teal" />
        <Stat label="Pages" value={pages.length} />
        <Stat label="Total words" value={pages.reduce((s, p) => s + p.words, 0).toLocaleString()} />
        <Stat label="Labels" value={c.labels.join(", ")} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {pages.map((p) => (
          <Link key={p.title} href={`/confluence/${slugify(p.title)}`} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300 hover:shadow">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-sm font-bold text-indigo-600">{p.order}</span>
              <div>
                <h3 className="font-semibold text-slate-900 group-hover:text-teal-700">{p.title}</h3>
                <p className="text-xs text-slate-500"><code>{p.source}</code> · {p.sections} sections · {p.words} words</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <Card title="Space permissions" className="mt-6">
        <Table
          head={["Group", "Permissions"]}
          rows={Object.entries(c.space.permissions).map(([g, perms]) => [
            <code key="g">{g}</code>,
            <span key="p" className="flex flex-wrap gap-1">{perms.map((x) => <Pill key={x} tone="violet">{x}</Pill>)}</span>,
          ])}
        />
      </Card>
    </div>
  );
}
