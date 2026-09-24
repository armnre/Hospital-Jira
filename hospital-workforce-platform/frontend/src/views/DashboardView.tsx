"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { ComplianceBadge, CredentialStatusBadge } from "../components/StatusBadge";
import { Alert, Card, PageTitle, Spinner, Stat } from "../components/ui";
import { api } from "../lib/api";
import { formatDate, relativeDays } from "../lib/format";
import type { ComplianceStatus, DashboardSummary } from "../lib/types";

export function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.dashboard().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;

  const c = data.credentials;
  const segments = [
    { key: "VALID" as const, n: c.valid, cls: "bg-emerald-500" },
    { key: "EXPIRING_SOON" as const, n: c.expiringSoon, cls: "bg-amber-400" },
    { key: "PENDING_VERIFICATION" as const, n: c.pendingVerification, cls: "bg-sky-400" },
    { key: "EXPIRED" as const, n: c.expired, cls: "bg-rose-500" },
  ];
  const maxHead = Math.max(1, ...data.departments.map((d) => d.headcount));

  return (
    <>
      <PageTitle title="HR Dashboard" subtitle={`Workforce and credential compliance as of ${formatDate(data.asOf)}`} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat testId="stat-total-employees" label="Total employees" value={data.employees.total} sub={`${data.employees.active} active`} onClick={() => router.push("/employees")} />
        <Stat testId="stat-clinical" label="Clinical employees" value={data.employees.clinical} tone="teal" sub={`${data.employees.nonClinical} non clinical`} onClick={() => router.push("/employees?category=CLINICAL")} />
        <Stat testId="stat-active-credentials" label="Active credentials" value={c.active} tone="emerald" sub={`${c.valid} valid · verified & not expired`} onClick={() => router.push("/credentials")} />
        <Stat testId="stat-expiring" label="Expiring credentials" value={c.expiring60} tone="amber" sub={`${c.expiring30} within 30 days · ${c.expiring60} within 60`} onClick={() => router.push("/credentials?tab=expiring60")} />
        <Stat testId="stat-expired" label="Expired credentials" value={c.expired} tone="rose" sub="Not valid for work" onClick={() => router.push("/credentials?tab=expired")} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Credential status distribution" className="xl:col-span-2">
          <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
            {segments.map((s) => s.n > 0 && <div key={s.key} className={s.cls} style={{ width: `${(s.n / Math.max(1, c.total)) * 100}%` }} title={`${s.key}: ${s.n}`} />)}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {segments.map((s) => (
              <div key={s.key} className="rounded-xl border border-slate-100 p-3">
                <CredentialStatusBadge status={s.key} />
                <p className="mt-2 text-2xl font-bold text-slate-900">{s.n}</p>
                <p className="text-xs text-slate-500">{Math.round((s.n / Math.max(1, c.total)) * 100)}% of {c.total}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Employee compliance">
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(data.compliance) as ComplianceStatus[]).map((k) => (
              <div key={k} className="rounded-xl border border-slate-100 p-3">
                <ComplianceBadge status={k} />
                <p className="mt-2 text-2xl font-bold text-slate-900">{data.compliance[k]}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">Clinical staff need a current, verified professional licence or registration and no expired credentials.</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Upcoming expiries (next 60 days)" action={<Link href="/credentials?tab=expiring60" className="text-xs font-semibold text-teal-700 hover:underline">View all →</Link>}>
          {data.upcomingExpiries.length === 0 ? (
            <p className="text-sm text-slate-500">No credentials expire in the next 60 days.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.upcomingExpiries.map((cr) => (
                <li key={cr.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/employees/${cr.employee.id}`} className="text-sm font-medium text-slate-900 hover:text-teal-700">{cr.employee.fullName}</Link>
                    <p className="truncate text-xs text-slate-500">{cr.credentialName} · {cr.employee.department.name}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <CredentialStatusBadge status={cr.status} />
                    <p className="mt-0.5 text-xs text-amber-700">{relativeDays(cr.daysUntilExpiry)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Non-compliant employees" action={<span className="text-xs text-slate-400">{data.compliance.NON_COMPLIANT} total</span>}>
          {data.nonCompliantEmployees.length === 0 ? (
            <p className="text-sm text-slate-500">All employees are compliant.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.nonCompliantEmployees.map((e) => (
                <li key={e.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/employees/${e.id}`} className="text-sm font-medium text-slate-900 hover:text-teal-700">{e.fullName}</Link>
                    <span className="text-xs text-slate-500">{e.department}</span>
                  </div>
                  <p className="text-xs text-rose-600">{e.reasons.join(" · ")}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Departments" className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Headcount</th>
                <th className="px-3 py-2">Clinical</th>
                <th className="px-3 py-2">Expiring</th>
                <th className="px-3 py-2">Expired</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.departments.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2 font-medium">
                    <Link href={`/employees?departmentId=${d.id}`} className="hover:text-teal-700">{d.name}</Link>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full bg-teal-500" style={{ width: `${(d.headcount / maxHead) * 100}%` }} />
                      </div>
                      {d.headcount}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{d.clinical}</td>
                  <td className="px-3 py-2">{d.expiring > 0 ? <span className="font-semibold text-amber-700">{d.expiring}</span> : <span className="text-slate-300">0</span>}</td>
                  <td className="px-3 py-2">{d.expired > 0 ? <span className="font-semibold text-rose-600">{d.expired}</span> : <span className="text-slate-300">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

export default function DashboardView() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}
