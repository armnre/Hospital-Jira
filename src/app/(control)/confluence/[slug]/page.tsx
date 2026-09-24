import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { loadConfluenceConfig, readPlatformFile, slugify } from "@/lib/platform";

export const dynamic = "force-dynamic";

export default async function ConfluenceDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = loadConfluenceConfig();
  const pages = [...c.pages].sort((a, b) => a.order - b.order);
  const idx = pages.findIndex((p) => slugify(p.title) === slug);
  if (idx < 0) notFound();
  const page = pages[idx];
  const prev = pages[idx - 1];
  const next = pages[idx + 1];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row">
      <aside className="shrink-0 lg:w-56">
        <Link href="/confluence" className="text-xs font-semibold uppercase tracking-wide text-teal-600">← {c.space.key} space</Link>
        <ul className="mt-3 space-y-1">
          {pages.map((p) => (
            <li key={p.title}>
              <Link href={`/confluence/${slugify(p.title)}`} className={`block rounded-md px-2 py-1.5 text-sm ${p.title === page.title ? "bg-teal-50 font-semibold text-teal-800" : "text-slate-600 hover:bg-slate-100"}`}>
                {p.order}. {p.title}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <div className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <p className="mb-4 text-xs text-slate-400">
          {c.space.name} › <span className="text-slate-600">{page.title}</span> · source <code>{page.source}</code>
        </p>
        <Markdown source={readPlatformFile(page.source)} />
        <div className="mt-10 flex justify-between border-t border-slate-100 pt-4 text-sm">
          {prev ? <Link className="text-teal-700 hover:underline" href={`/confluence/${slugify(prev.title)}`}>← {prev.title}</Link> : <span />}
          {next ? <Link className="text-teal-700 hover:underline" href={`/confluence/${slugify(next.title)}`}>{next.title} →</Link> : <span />}
        </div>
      </div>
    </div>
  );
}
