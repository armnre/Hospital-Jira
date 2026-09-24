"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { CategoryBadge, ComplianceBadge } from "../components/StatusBadge";
import { Alert, Button, Card, EmptyState, Input, PageTitle, Select, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { humanize, initials } from "../lib/format";
import { EMPLOYEE_STATUSES, type Department, type Employee, type Paged } from "../lib/types";

type Filters = { search: string; departmentId: string; jobTitle: string; category: string; status: string; page: number };

function initialFilters(): Filters {
  const p = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  return { search: p.get("search") ?? "", departmentId: p.get("departmentId") ?? "", jobTitle: p.get("jobTitle") ?? "", category: p.get("category") ?? "", status: p.get("status") ?? "", page: 1 };
}

export function EmployeeList() {
  const { can } = useAuth();
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [search, setSearch] = useState(filters.search);
  const [result, setResult] = useState<Paged<Employee> | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.departments().then((r) => setDepartments(r.data)).catch(() => undefined);
    api.jobTitles().then((r) => setJobTitles(r.data)).catch(() => undefined);
  }, []);

  // debounce free-text search
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => (f.search === search ? f : { ...f, search, page: 1 })), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    api
      .listEmployees({ ...filters, pageSize: 15 })
      .then((r) => {
        setResult(r);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filters]);

  const set = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));
  const active = [filters.departmentId, filters.jobTitle, filters.category, filters.status, filters.search].filter(Boolean).length;

  return (
    <>
      <PageTitle
        title="Employees"
        subtitle={result ? `${result.total} employee${result.total === 1 ? "" : "s"} match your filters` : "Digital employee profiles"}
        actions={can("employees:write") && <Button onClick={() => router.push("/employees/new")}>+ Add employee</Button>}
      />
      <Card className="mb-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="xl:col-span-2">
            <Input aria-label="Search employees" placeholder="Search name, number, email or role…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select aria-label="Filter by department" value={filters.departmentId} onChange={(e) => set("departmentId", e.target.value)}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select aria-label="Filter by role" value={filters.jobTitle} onChange={(e) => set("jobTitle", e.target.value)}>
            <option value="">All roles</option>
            {jobTitles.map((j) => <option key={j} value={j}>{j}</option>)}
          </Select>
          <Select aria-label="Filter by category" value={filters.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">All categories</option>
            <option value="CLINICAL">Clinical</option>
            <option value="NON_CLINICAL">Non Clinical</option>
          </Select>
          <Select aria-label="Filter by status" value={filters.status} onChange={(e) => set("status", e.target.value)}>
            <option value="">All statuses</option>
            {EMPLOYEE_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
          </Select>
        </div>
        {active > 0 && (
          <button className="mt-3 text-xs font-semibold text-teal-700 hover:underline" onClick={() => { setSearch(""); setFilters({ search: "", departmentId: "", jobTitle: "", category: "", status: "", page: 1 }); }}>
            Clear {active} filter{active > 1 ? "s" : ""}
          </button>
        )}
      </Card>

      {error && <Alert>{error}</Alert>}
      {!result && loading ? (
        <Spinner />
      ) : result && result.data.length === 0 ? (
        <EmptyState title="No employees found">Try a different search or clear the filters.</EmptyState>
      ) : result ? (
        <Card className={`p-0 ${loading ? "opacity-60" : ""}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="employee-table">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Employee</th>
                  <th className="px-4 py-3 font-semibold">Department</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Credentials</th>
                  <th className="px-4 py-3 font-semibold">Compliance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.data.map((e) => (
                  <tr key={e.id} className="cursor-pointer hover:bg-slate-50" onClick={() => router.push(`/employees/${e.id}`)} data-testid="employee-row">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{initials(e.fullName)}</div>
                        <div>
                          <Link href={`/employees/${e.id}`} className="font-medium text-slate-900 hover:text-teal-700" onClick={(ev) => ev.stopPropagation()}>{e.fullName}</Link>
                          <p className="text-xs text-slate-500">{e.employeeNumber} · {e.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{e.department.name}</td>
                    <td className="px-4 py-3 text-slate-700">{e.jobTitle}</td>
                    <td className="px-4 py-3"><CategoryBadge category={e.employeeCategory} /></td>
                    <td className="px-4 py-3 text-xs text-slate-600">{humanize(e.status)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 text-xs">
                        <span title="Valid" className="rounded bg-emerald-50 px-1.5 text-emerald-700">{e.credentialSummary.valid}</span>
                        <span title="Expiring soon" className="rounded bg-amber-50 px-1.5 text-amber-700">{e.credentialSummary.expiring}</span>
                        <span title="Expired" className="rounded bg-rose-50 px-1.5 text-rose-700">{e.credentialSummary.expired}</span>
                        <span title="Pending" className="rounded bg-sky-50 px-1.5 text-sky-700">{e.credentialSummary.pending}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><ComplianceBadge status={e.compliance.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>Page {result.page} of {result.totalPages}</span>
            <div className="flex gap-2">
              <Button variant="secondary" className="px-2.5 py-1 text-xs" disabled={result.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>← Prev</Button>
              <Button variant="secondary" className="px-2.5 py-1 text-xs" disabled={result.page >= result.totalPages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next →</Button>
            </div>
          </div>
        </Card>
      ) : null}
    </>
  );
}

export default function EmployeeListView() {
  return (
    <AppShell>
      <EmployeeList />
    </AppShell>
  );
}
