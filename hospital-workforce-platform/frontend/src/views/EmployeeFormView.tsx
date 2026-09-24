"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../components/AppShell";
import { Alert, Button, Card, Field, Input, PageTitle, Select, Spinner } from "../components/ui";
import { ApiError, api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { humanize } from "../lib/format";
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, type Department, type EmployeeInput } from "../lib/types";

const EMPTY: EmployeeInput = {
  employeeNumber: "", firstName: "", lastName: "", nationalId: "", email: "", phone: "", departmentId: 0,
  jobTitle: "", employmentType: "FULL_TIME", employeeCategory: "CLINICAL", status: "ACTIVE", hireDate: null,
};

function EmployeeForm({ id }: { id?: string }) {
  const router = useRouter();
  const { can } = useAuth();
  const [v, setV] = useState<EmployeeInput>(EMPTY);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(Boolean(id));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.departments().then((r) => setDepartments(r.data)).catch(() => undefined);
    if (id) {
      api
        .getEmployee(id)
        .then((e) =>
          setV({
            employeeNumber: e.employeeNumber, firstName: e.firstName, lastName: e.lastName, nationalId: e.nationalId, email: e.email,
            phone: e.phone, departmentId: e.department.id, jobTitle: e.jobTitle, employmentType: e.employmentType,
            employeeCategory: e.employeeCategory, status: e.status, hireDate: e.hireDate,
          }),
        )
        .catch((e: Error) => setFormError(e.message))
        .finally(() => setLoading(false));
    }
  }, [id]);

  if (!can("employees:write")) return <Alert>You do not have permission to manage employees.</Alert>;
  if (loading) return <Spinner />;

  const set = <K extends keyof EmployeeInput>(k: K, value: EmployeeInput[K]) => setV((s) => ({ ...s, [k]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const saved = id ? await api.updateEmployee(id, v) : await api.createEmployee(v);
      router.push(`/employees/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors());
        setFormError(err.message);
      } else setFormError("Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle title={id ? "Edit employee" : "New employee"} subtitle={id ? v.employeeNumber : "Create a digital employee profile"} actions={<Link href={id ? `/employees/${id}` : "/employees"} className="text-sm text-slate-500 hover:text-teal-700">← Back</Link>} />
      <form onSubmit={submit} className="space-y-6" noValidate>
        {formError && <Alert>{formError}</Alert>}
        <Card title="Identity">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Employee number" required error={errors.employeeNumber} hint="Format EMP-000000">
              <Input value={v.employeeNumber} onChange={(e) => set("employeeNumber", e.target.value)} placeholder="EMP-001025" />
            </Field>
            <Field label="First name" required error={errors.firstName}>
              <Input value={v.firstName} onChange={(e) => set("firstName", e.target.value)} />
            </Field>
            <Field label="Last name" required error={errors.lastName}>
              <Input value={v.lastName} onChange={(e) => set("lastName", e.target.value)} />
            </Field>
            <Field label="National ID" required error={errors.nationalId} hint="Stored securely; masked for non-HR roles">
              <Input value={v.nationalId} onChange={(e) => set("nationalId", e.target.value)} />
            </Field>
            <Field label="Email" required error={errors.email}>
              <Input type="email" value={v.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Phone" error={errors.phone}>
              <Input value={v.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+1-555-0100" />
            </Field>
          </div>
        </Card>
        <Card title="Employment">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Department" required error={errors.departmentId}>
              <Select value={v.departmentId || ""} onChange={(e) => set("departmentId", Number(e.target.value))}>
                <option value="">Select department…</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <Field label="Role / job title" required error={errors.jobTitle}>
              <Input value={v.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} placeholder="Critical Care Nurse" />
            </Field>
            <Field label="Hire date" error={errors.hireDate}>
              <Input type="date" value={v.hireDate ?? ""} onChange={(e) => set("hireDate", e.target.value || null)} />
            </Field>
            <Field label="Employee category" required error={errors.employeeCategory} hint="Clinical staff require a current professional licence">
              <div className="flex gap-2">
                {(["CLINICAL", "NON_CLINICAL"] as const).map((c) => (
                  <button key={c} type="button" onClick={() => set("employeeCategory", c)} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${v.employeeCategory === c ? "border-teal-500 bg-teal-50 text-teal-800" : "border-slate-300 text-slate-600"}`}>
                    {c === "CLINICAL" ? "Clinical" : "Non Clinical"}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Employment type" required error={errors.employmentType}>
              <Select value={v.employmentType} onChange={(e) => set("employmentType", e.target.value)}>
                {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
              </Select>
            </Field>
            <Field label="Status" required error={errors.status}>
              <Select value={v.status} onChange={(e) => set("status", e.target.value)}>
                {EMPLOYEE_STATUSES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
              </Select>
            </Field>
          </div>
        </Card>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : id ? "Save changes" : "Create employee"}</Button>
        </div>
      </form>
    </>
  );
}

export function EmployeeCreateView() {
  return (
    <AppShell>
      <EmployeeForm />
    </AppShell>
  );
}

export default function EmployeeEditView() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell>
      <EmployeeForm id={params.id} />
    </AppShell>
  );
}
