"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AppShell } from "../components/AppShell";
import { CredentialForm } from "../components/CredentialForm";
import { CredentialTable } from "../components/CredentialTable";
import { CategoryBadge, ComplianceBadge } from "../components/StatusBadge";
import { Alert, Button, Card, EmptyState, Input, Modal, Select, Spinner } from "../components/ui";
import { ApiError, api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate, humanize, initials } from "../lib/format";
import { SKILL_LEVELS, type Credential, type EmployeeDetail, type Skill } from "../lib/types";

const LEVEL_WIDTH: Record<string, string> = { BEGINNER: "25%", INTERMEDIATE: "50%", ADVANCED: "75%", EXPERT: "100%" };

export function EmployeeProfile({ id }: { id: string }) {
  const { can, user } = useAuth();
  const router = useRouter();
  const [emp, setEmp] = useState<EmployeeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Credential | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [skillForm, setSkillForm] = useState({ skillId: "", level: "INTERMEDIATE", yearsExperience: "1" });

  const load = useCallback(() => {
    api.getEmployee(id).then(setEmp).catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
    if (can("employees:write")) api.skills().then((r) => setSkills(r.data)).catch(() => undefined);
  }, [load, can]);

  if (error) return <Alert>{error}</Alert>;
  if (!emp) return <Spinner />;

  const isSelf = user?.employeeId === emp.id;
  const canAddCredential = can("credentials:write") || (isSelf && can("credentials:submit:self"));

  async function run(action: () => Promise<unknown>, success: string, id?: string) {
    setBusyId(id ?? "x");
    setNotice(null);
    setError(null);
    try {
      await action();
      setNotice(success);
      load();
    } catch (e) {
      setNotice(null);
      alert(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function addSkill(e: FormEvent) {
    e.preventDefault();
    if (!skillForm.skillId) return;
    await run(() => api.addSkill(emp!.id, { skillId: Number(skillForm.skillId), level: skillForm.level, yearsExperience: Number(skillForm.yearsExperience) }), "Skill saved");
    setSkillForm({ skillId: "", level: "INTERMEDIATE", yearsExperience: "1" });
  }

  return (
    <div data-testid="employee-profile">
      <div className="mb-4 text-sm text-slate-500">
        {can("employees:read") ? <Link href="/employees" className="hover:text-teal-700">Employees</Link> : "My profile"} <span className="mx-1">/</span>
        <span className="text-slate-700">{emp.fullName}</span>
      </div>

      <Card className="mb-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 text-xl font-bold text-white shadow">{initials(emp.fullName)}</div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{emp.fullName}</h1>
              <p className="text-slate-600">{emp.jobTitle} · {emp.department.name}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <CategoryBadge category={emp.employeeCategory} />
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{humanize(emp.status)}</span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">{emp.employeeNumber}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <ComplianceBadge status={emp.compliance.status} />
            {emp.compliance.reasons.length > 0 && <p className="max-w-sm text-xs text-slate-500 md:text-right">{emp.compliance.reasons.join(" · ")}</p>}
            {can("employees:write") && (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => router.push(`/employees/${emp.id}/edit`)}>Edit profile</Button>
                {can("employees:delete") && (
                  <Button
                    variant="ghost"
                    className="text-rose-600"
                    onClick={() => confirm(`Remove ${emp.fullName}? The record is archived (soft delete).`) && run(() => api.deleteEmployee(emp.id), "Deleted").then(() => router.push("/employees"))}
                  >
                    Delete
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      {notice && <div className="mb-4"><Alert tone="success">{notice}</Alert></div>}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Personal information">
          <dl className="space-y-3 text-sm">
            {[
              ["Employee number", emp.employeeNumber],
              ["National ID", emp.nationalId],
              ["Email", emp.email],
              ["Phone", emp.phone || "—"],
              ["Department", emp.department.name],
              ["Role", emp.jobTitle],
              ["Employment type", humanize(emp.employmentType)],
              ["Category", emp.employeeCategory === "CLINICAL" ? "Clinical" : "Non Clinical"],
              ["Hire date", formatDate(emp.hireDate)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-slate-50 pb-2 last:border-0">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-medium text-slate-800">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title={`Skills (${emp.skills.length})`} className="xl:col-span-2">
          {emp.skills.length === 0 ? (
            <EmptyState title="No skills recorded" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {emp.skills.map((s) => (
                <div key={s.skillId} className="rounded-xl border border-slate-100 p-3" data-testid="skill-item">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-900">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.category} · {s.yearsExperience} yrs</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700">{humanize(s.level)}</span>
                      {can("employees:write") && (
                        <button className="px-1 text-xs text-slate-400 hover:text-rose-600" aria-label={`Remove ${s.name}`} onClick={() => run(() => api.removeSkill(emp.id, s.skillId), "Skill removed")}>
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-teal-500" style={{ width: LEVEL_WIDTH[s.level] }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {can("employees:write") && (
            <form onSubmit={addSkill} className="mt-4 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_10rem_6rem_auto]">
              <Select aria-label="Skill" value={skillForm.skillId} onChange={(e) => setSkillForm((f) => ({ ...f, skillId: e.target.value }))}>
                <option value="">Add or update a skill…</option>
                {skills.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.category})</option>)}
              </Select>
              <Select aria-label="Level" value={skillForm.level} onChange={(e) => setSkillForm((f) => ({ ...f, level: e.target.value }))}>
                {SKILL_LEVELS.map((l) => <option key={l} value={l}>{humanize(l)}</option>)}
              </Select>
              <Input aria-label="Years of experience" type="number" min={0} max={60} step={0.5} value={skillForm.yearsExperience} onChange={(e) => setSkillForm((f) => ({ ...f, yearsExperience: e.target.value }))} />
              <Button type="submit" variant="secondary" disabled={!skillForm.skillId}>Save</Button>
            </form>
          )}
        </Card>
      </div>

      <Card
        className="mt-6"
        title={`Credentials (${emp.credentials.length})`}
        action={canAddCredential && <Button onClick={() => setAddOpen(true)}>+ Add credential</Button>}
      >
        {emp.employeeCategory === "NON_CLINICAL" && emp.credentials.length === 0 ? (
          <EmptyState title="No credentials required">Non-clinical role, so professional credentials are optional (Rule 3).</EmptyState>
        ) : (
          <CredentialTable
            credentials={emp.credentials}
            canVerify={can("credentials:verify")}
            canDelete={can("credentials:delete")}
            canEdit={can("credentials:write")}
            busyId={busyId}
            onVerify={(c) => run(() => api.verifyCredential(c.id), `${c.credentialName} verified`, c.id)}
            onDelete={(c) => confirm(`Delete ${c.credentialName}?`) && run(() => api.deleteCredential(c.id), "Credential deleted", c.id)}
            onEdit={(c) => setEditing(c)}
          />
        )}
      </Card>

      <Modal open={addOpen} title={`Add credential — ${emp.fullName}`} onClose={() => setAddOpen(false)} wide>
        <CredentialForm
          category={emp.employeeCategory}
          onCancel={() => setAddOpen(false)}
          onSubmit={async (input) => {
            await api.createCredential(emp.id, input);
            setAddOpen(false);
            setNotice("Credential added and queued for verification");
            load();
          }}
        />
      </Modal>

      <Modal open={Boolean(editing)} title="Edit credential" onClose={() => setEditing(null)} wide>
        {editing && (
          <CredentialForm
            category={emp.employeeCategory}
            initial={editing}
            submitLabel="Update credential"
            onCancel={() => setEditing(null)}
            onSubmit={async (input) => {
              await api.updateCredential(editing.id, input);
              setEditing(null);
              setNotice("Credential updated. Material changes reset verification.");
              load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

export default function EmployeeProfileView() {
  const params = useParams<{ id: string }>();
  return (
    <AppShell>
      <EmployeeProfile id={params.id} />
    </AppShell>
  );
}
