"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "../lib/api";
import { previewStatus } from "../lib/format";
import { CREDENTIAL_TYPES, type CredentialInput, type EmployeeCategory } from "../lib/types";
import { CredentialStatusBadge } from "./StatusBadge";
import { Alert, Button, Field, Input, Select } from "./ui";

const today = () => new Date().toISOString().slice(0, 10);

export function CredentialForm({
  category,
  initial,
  onSubmit,
  onCancel,
  submitLabel = "Save credential",
}: {
  category: EmployeeCategory;
  initial?: Partial<CredentialInput>;
  onSubmit: (input: CredentialInput) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const [v, setV] = useState<CredentialInput>({
    credentialType: initial?.credentialType ?? (category === "CLINICAL" ? "PROFESSIONAL_LICENSE" : "CERTIFICATION"),
    credentialName: initial?.credentialName ?? "",
    credentialNumber: initial?.credentialNumber ?? "",
    issuer: initial?.issuer ?? "",
    issueDate: initial?.issueDate ?? today(),
    expiryDate: initial?.expiryDate === undefined ? "" : initial.expiryDate,
    documentReference: initial?.documentReference ?? "",
  });
  const [noExpiry, setNoExpiry] = useState(initial?.expiryDate === null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof CredentialInput>(k: K, value: CredentialInput[K]) => setV((s) => ({ ...s, [k]: value }));
  const expiry = noExpiry || !v.expiryDate ? null : v.expiryDate;
  const preview = previewStatus(expiry);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      await onSubmit({ ...v, expiryDate: expiry });
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
    <form onSubmit={submit} className="space-y-4">
      {formError && <Alert>{formError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Credential type" required error={errors.credentialType} hint={category === "NON_CLINICAL" ? "Professional licences/registrations apply to clinical staff only (Rule 3)" : undefined}>
          <Select value={v.credentialType} onChange={(e) => set("credentialType", e.target.value as CredentialInput["credentialType"])}>
            {CREDENTIAL_TYPES.map((t) => (
              <option key={t.value} value={t.value} disabled={category === "NON_CLINICAL" && t.professional}>
                {t.label}
                {category === "NON_CLINICAL" && t.professional ? " (clinical only)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Credential name" required error={errors.credentialName}>
          <Input value={v.credentialName} onChange={(e) => set("credentialName", e.target.value)} placeholder="e.g. Registered Nurse License" required />
        </Field>
        <Field label="Issuer" required error={errors.issuer}>
          <Input value={v.issuer} onChange={(e) => set("issuer", e.target.value)} placeholder="e.g. State Board of Nursing" required />
        </Field>
        <Field label="Credential / licence number" error={errors.credentialNumber}>
          <Input value={v.credentialNumber} onChange={(e) => set("credentialNumber", e.target.value)} placeholder="RN-123456" />
        </Field>
        <Field label="Issue date" required error={errors.issueDate}>
          <Input type="date" value={v.issueDate} max={today()} onChange={(e) => set("issueDate", e.target.value)} required />
        </Field>
        <Field label="Expiry date" error={errors.expiryDate}>
          <Input type="date" value={v.expiryDate ?? ""} disabled={noExpiry} min={v.issueDate} onChange={(e) => set("expiryDate", e.target.value)} />
          <span className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <input type="checkbox" checked={noExpiry} onChange={(e) => setNoExpiry(e.target.checked)} /> Does not expire
          </span>
        </Field>
      </div>
      <Field label="Document reference" error={errors.documentReference} hint="Link or DMS reference to the scanned document">
        <Input value={v.documentReference} onChange={(e) => set("documentReference", e.target.value)} placeholder="dms://credentials/EMP-001001/rn-license.pdf" />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <span className="flex items-center gap-2">
          Expiry status after verification: <CredentialStatusBadge status={preview} />
        </span>
        <span>New or changed credentials start as <strong>Pending verification</strong>.</span>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
