"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Architecture", num: "1", hint: "Diagram · components · data flow" },
  { href: "/deployment", label: "Deployment Package", num: "2", hint: "Compose · configs · env" },
  { href: "/jira", label: "Jira Configuration", num: "3", hint: "Project HWDT" },
  { href: "/confluence", label: "Confluence Docs", num: "4", hint: "Documentation space" },
  { href: "/validation", label: "Test Report", num: "5", hint: "Run validation suite" },
  { href: "/monitoring", label: "Monitoring", num: "·", hint: "CPU · memory · disk" },
  { href: "/handover", label: "Handover", num: "6", hint: "One-command setup" },
  { href: "/phase1", label: "Phase 1 Delivery", num: "P1", hint: "Jira · commits · tests" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="border-b border-slate-800 bg-slate-900 text-slate-100 lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500 text-lg font-black text-slate-900">H</div>
        <div>
          <p className="text-sm font-semibold leading-tight">Hospital Workforce</p>
          <p className="text-xs text-teal-300">Platform Control Center</p>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                active ? "bg-teal-500/15 text-white ring-1 ring-teal-400/40" : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span className={`grid h-6 w-6 place-items-center rounded-md text-xs font-bold ${active ? "bg-teal-400 text-slate-900" : "bg-slate-800 text-slate-400"}`}>
                {item.num}
              </span>
              <span>
                <span className="block font-medium">{item.label}</span>
                <span className="hidden text-xs text-slate-500 lg:block">{item.hint}</span>
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="px-3 pb-4">
        <Link href="/login" className="flex items-center justify-between rounded-lg bg-teal-500 px-3 py-2.5 text-sm font-semibold text-slate-900 hover:bg-teal-400">
          Open Workforce App <span aria-hidden>→</span>
        </Link>
      </div>
      <div className="hidden px-5 py-4 text-xs text-slate-500 lg:absolute lg:bottom-0 lg:block">
        Infrastructure-as-code in <code className="text-slate-400">hospital-workforce-platform/</code>
      </div>
    </aside>
  );
}
