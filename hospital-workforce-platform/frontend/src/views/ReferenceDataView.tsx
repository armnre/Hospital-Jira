"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../components/AppShell";
import { Alert, Button, Card, Input, PageTitle, Spinner } from "../components/ui";
import { ApiError, api } from "../lib/api";
import type { Department, Skill } from "../lib/types";

function ReferenceData() {
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [dept, setDept] = useState({ name: "", description: "" });
  const [skill, setSkill] = useState({ name: "", category: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.departments().then((r) => setDepartments(r.data)).catch((e: Error) => setError(e.message));
    api.skills().then((r) => setSkills(r.data)).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      load();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
      return false;
    }
  }

  const grouped = (skills ?? []).reduce<Record<string, Skill[]>>((acc, s) => ((acc[s.category] ??= []).push(s), acc), {});

  return (
    <>
      <PageTitle title="Departments & Skills" subtitle="Reference data used by employee profiles, and later by shift management and workforce matching." />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Departments">
          <form
            className="mb-4 grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]"
            onSubmit={async (e: FormEvent) => {
              e.preventDefault();
              if (await act(() => api.createDepartment(dept))) setDept({ name: "", description: "" });
            }}
          >
            <Input placeholder="Name" value={dept.name} onChange={(e) => setDept((d) => ({ ...d, name: e.target.value }))} required />
            <Input placeholder="Description" value={dept.description} onChange={(e) => setDept((d) => ({ ...d, description: e.target.value }))} />
            <Button type="submit">Add</Button>
          </form>
          {!departments ? <Spinner /> : (
            <ul className="divide-y divide-slate-100">
              {departments.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="font-medium text-slate-900">{d.name}</p>
                    <p className="text-xs text-slate-500">{d.description || "—"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">{d.headcount} staff · {d.clinicalCount} clinical</span>
                    <button
                      className="text-xs text-slate-400 hover:text-rose-600 disabled:opacity-30"
                      disabled={d.headcount > 0}
                      title={d.headcount > 0 ? "Department has employees" : "Delete"}
                      onClick={() => confirm(`Delete ${d.name}?`) && act(() => api.deleteDepartment(d.id))}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Skills catalogue">
          <form
            className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={async (e: FormEvent) => {
              e.preventDefault();
              if (await act(() => api.createSkill(skill))) setSkill({ name: "", category: "" });
            }}
          >
            <Input placeholder="Skill (e.g. ECMO)" value={skill.name} onChange={(e) => setSkill((s) => ({ ...s, name: e.target.value }))} required />
            <Input placeholder="Category (e.g. Critical Care)" value={skill.category} onChange={(e) => setSkill((s) => ({ ...s, category: e.target.value }))} required list="skill-categories" />
            <datalist id="skill-categories">{Object.keys(grouped).map((c) => <option key={c} value={c} />)}</datalist>
            <Button type="submit">Add</Button>
          </form>
          {!skills ? <Spinner /> : (
            <div className="space-y-4">
              {Object.entries(grouped).map(([cat, list]) => (
                <div key={cat}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{cat}</p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((s) => (
                      <span key={s.id} className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm">
                        {s.name}
                        <span className="text-xs text-slate-400">{s.employeeCount}</span>
                        <button className="text-xs text-slate-300 hover:text-rose-600" aria-label={`Delete ${s.name}`} onClick={() => confirm(`Delete skill ${s.name}?`) && act(() => api.deleteSkill(s.id))}>✕</button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

export default function ReferenceDataView() {
  return (
    <AppShell>
      <ReferenceData />
    </AppShell>
  );
}
