"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { CredentialForm } from "../components/CredentialForm";
import { CredentialTable } from "../components/CredentialTable";
import { Alert, Button, Card, Field, Input, Modal, PageTitle, Select, Spinner } from "../components/ui";
import { ApiError, api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Credential, Employee } from "../lib/types";

type Tab = "all" | "expiring30" | "expiring60" | "expired" | "pending";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All credentials" },
  { key: "expiring30", label: "Expiring ≤ 30 days" },
  { key: "expiring60", label: "Expiring ≤ 60 days" },
  { key: "expired", label: "Expired" },
  { key: "pending", label: "Pending verification" },
];

export function CredentialManagement() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>(() => {
    const t = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("tab");
    return TABS.some((x) => x.key === t) ? (t as Tab) : "all";
  });
  const [rows, setRows] = useState<Credential[] | null>(null);
  const [counts, setCounts] = useState<Record<Tab, number | null>>({ all: null, expiring30: null, expiring60: null, expired: null, pending: null });
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");

  const load = useCallback(async () => {
    try {
      const [all, expiring, expired, pending] = await Promise.all([
        api.listCredentials({ limit: 500 }),
        api.expiring(),
        api.expired(),
        api.listCredentials({ status: "PENDING_VERIFICATION", limit: 500 }),
      ]);
      setCounts({ all: all.count, expiring30: expiring.within30Days.count, expiring60: expiring.within60Days.count, expired: expired.count, pending: pending.count });
      const byTab: Record<Tab, Credential[]> = {
        all: all.data,
        expiring30: expiring.within30Days.data,
        expiring60: expiring.within60Days.data,
        expired: expired.data,
        pending: pending.data,
      };
      setRows(byTab[tab]);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (addOpen && employees.length === 0) api.listEmployees({ pageSize: 100 }).then((r) => setEmployees(r.data)).catch(() => undefined);
  }, [addOpen, employees.length]);

  async function act(fn: () => Promise<unknown>, msg: string, id: string) {
    setBusyId(id);
    try {
      await fn();
      setNotice(msg);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  const q = search.trim().toLowerCase();
  const visible = (rows ?? []).filter(
    (c) => !q || [c.credentialName, c.employee.fullName, c.employee.employeeNumber, c.issuer, c.employee.department.name].some((s) => s.toLowerCase().includes(q)),
  );
  const selectedEmployee = employees.find((e) => e.id === employeeId);

  return (
    <>
      <PageTitle
        title="Credential Management"
        subtitle="Track licences and certificates, verify documents and act on expiries before they affect rostering."
        actions={can("credentials:write") && <Button onClick={() => setAddOpen(true)}>+ Add credential</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              setRows(null);
            }}
            className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
              tab === t.key ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {t.label}
            {counts[t.key] !== null && (
              <span className={`rounded-full px-1.5 text-xs ${tab === t.key ? "bg-white/20" : t.key === "expired" ? "bg-rose-100 text-rose-700" : t.key.startsWith("expiring") ? "bg-amber-100 text-amber-800" : "bg-slate-100"}`}>
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {notice && <div className="mb-3"><Alert tone="success">{notice}</Alert></div>}
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}

      <Card>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Input aria-label="Search credentials" placeholder="Search credential, employee, issuer or department…" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-md" />
          <p className="text-xs text-slate-500">
            Status rule: <strong>Expired</strong> if past expiry · <strong>Expiring soon</strong> within 60 days · unverified = <strong>Pending</strong>
          </p>
        </div>
        {rows === null ? (
          <Spinner />
        ) : (
          <CredentialTable
            credentials={visible}
            showEmployee
            canVerify={can("credentials:verify")}
            canDelete={can("credentials:delete")}
            busyId={busyId}
            onVerify={(c) => act(() => api.verifyCredential(c.id), `${c.credentialName} for ${c.employee.fullName} verified`, c.id)}
            onDelete={(c) => confirm(`Delete ${c.credentialName} (${c.employee.fullName})?`) && act(() => api.deleteCredential(c.id), "Credential deleted", c.id)}
          />
        )}
      </Card>

      <Modal open={addOpen} title="Add credential" onClose={() => setAddOpen(false)} wide>
        <div className="mb-4">
          <Field label="Employee" required>
            <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} · {e.employeeNumber} · {e.department.name} ({e.employeeCategory === "CLINICAL" ? "Clinical" : "Non Clinical"})
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {selectedEmployee ? (
          <CredentialForm
            key={selectedEmployee.id}
            category={selectedEmployee.employeeCategory}
            onCancel={() => setAddOpen(false)}
            onSubmit={async (input) => {
              await api.createCredential(selectedEmployee.id, input);
              setAddOpen(false);
              setNotice(`Credential added for ${selectedEmployee.fullName} (pending verification)`);
              setTab("pending");
            }}
          />
        ) : (
          <p className="text-sm text-slate-500">Select an employee to continue.</p>
        )}
      </Modal>
    </>
  );
}

export default function CredentialsView() {
  return (
    <AppShell>
      <CredentialManagement />
    </AppShell>
  );
}
