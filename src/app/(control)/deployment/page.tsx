import Link from "next/link";
import { Markdown } from "@/components/Markdown";
import { Card, PageHeader } from "@/components/ui";
import { listPlatformFiles, platformFileExists, readPlatformFile } from "@/lib/platform";

export const dynamic = "force-dynamic";

const KEY_FILES = [
  "docker-compose.yml",
  ".env.example",
  "postgres/init/01-init-databases.sh",
  "nginx/config/conf.d/10-jira.conf",
  "scripts/backup_database.sh",
  "scripts/restore_database.sh",
  "monitoring/prometheus/prometheus.yml",
];

export default async function DeploymentPage({ searchParams }: { searchParams: Promise<{ file?: string }> }) {
  const { file } = await searchParams;
  const files = listPlatformFiles();
  const selected = file && files.some((f) => f.path === file) ? file : "docker-compose.yml";
  const content = platformFileExists(selected) ? readPlatformFile(selected) : "";
  const groups = files.reduce<Record<string, typeof files>>((acc, f) => {
    const top = f.path.includes("/") ? f.path.split("/")[0] + "/" : "(root)";
    (acc[top] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Report 2 · Deployment Package"
        title="hospital-workforce-platform/"
        actions={<a href="/api/package" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700">⬇ Download .tar.gz</a>}
      >
        {files.length} files: Docker Compose, configuration files, the environment template, scripts and documentation. Secrets, backups and git metadata are
        excluded from the download.
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        {KEY_FILES.map((f) => (
          <Link key={f} href={`/deployment?file=${encodeURIComponent(f)}`} className={`rounded-full border px-3 py-1 text-xs ${selected === f ? "border-teal-500 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            {f.split("/").pop()}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <Card title="Files" className="max-h-[75vh] overflow-auto">
          <div className="space-y-3 text-sm">
            {Object.entries(groups).map(([g, fs]) => (
              <div key={g}>
                <p className="mb-1 font-mono text-xs font-semibold text-slate-400">{g}</p>
                <ul>
                  {fs.map((f) => (
                    <li key={f.path}>
                      <Link href={`/deployment?file=${encodeURIComponent(f.path)}`} className={`flex justify-between gap-2 rounded px-2 py-1 font-mono text-xs ${f.path === selected ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-100"}`}>
                        <span className="truncate">{g === "(root)" ? f.path : f.path.slice(g.length)}</span>
                        <span className="shrink-0 text-slate-400">{f.size >= 1024 ? `${(f.size / 1024).toFixed(1)}k` : f.size}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <code className="text-sm font-semibold">{selected}</code>
            <span className="text-xs text-slate-400">{content.split("\n").length} lines</span>
          </div>
          {selected.endsWith(".md") ? (
            <div className="p-6"><Markdown source={content} /></div>
          ) : (
            <pre className="max-h-[75vh] overflow-auto rounded-b-2xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
              {content.split("\n").map((line, i) => (
                <div key={i} className="flex">
                  <span className="mr-4 w-8 shrink-0 select-none text-right text-slate-600">{i + 1}</span>
                  <span className={line.trim().startsWith("#") ? "text-slate-500" : ""}>{line || " "}</span>
                </div>
              ))}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
