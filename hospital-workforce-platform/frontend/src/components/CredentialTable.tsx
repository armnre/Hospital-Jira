"use client";

import Link from "next/link";
import { formatDate, humanize, relativeDays } from "../lib/format";
import type { Credential } from "../lib/types";
import { CredentialStatusBadge } from "./StatusBadge";
import { Button, EmptyState } from "./ui";

export function CredentialTable({
  credentials,
  showEmployee = false,
  canVerify = false,
  canDelete = false,
  canEdit = false,
  onVerify,
  onDelete,
  onEdit,
  busyId,
}: {
  credentials: Credential[];
  showEmployee?: boolean;
  canVerify?: boolean;
  canDelete?: boolean;
  canEdit?: boolean;
  onVerify?: (c: Credential) => void;
  onDelete?: (c: Credential) => void;
  onEdit?: (c: Credential) => void;
  busyId?: string | null;
}) {
  if (!credentials.length) return <EmptyState title="No credentials">Nothing to show for this selection.</EmptyState>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            {showEmployee && <th className="px-3 py-2 font-semibold">Employee</th>}
            <th className="px-3 py-2 font-semibold">Credential</th>
            <th className="px-3 py-2 font-semibold">Issuer</th>
            <th className="px-3 py-2 font-semibold">Expiry</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Verification</th>
            {(canVerify || canDelete || canEdit) && <th className="px-3 py-2 text-right font-semibold">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {credentials.map((c) => (
            <tr key={c.id} className={`align-top ${c.status === "EXPIRED" ? "bg-rose-50/40" : ""}`} data-testid="credential-row">
              {showEmployee && (
                <td className="px-3 py-2.5">
                  <Link href={`/employees/${c.employee.id}`} className="font-medium text-slate-900 hover:text-teal-700">{c.employee.fullName}</Link>
                  <p className="text-xs text-slate-500">{c.employee.employeeNumber} · {c.employee.department.name}</p>
                </td>
              )}
              <td className="px-3 py-2.5">
                <p className="font-medium text-slate-900">{c.credentialName}</p>
                <p className="text-xs text-slate-500">{humanize(c.credentialType)}{c.credentialNumber && ` · ${c.credentialNumber}`}</p>
              </td>
              <td className="px-3 py-2.5 text-slate-600">{c.issuer}</td>
              <td className="px-3 py-2.5">
                <p className="text-slate-800">{formatDate(c.expiryDate)}</p>
                <p className={`text-xs ${c.status === "EXPIRED" ? "font-semibold text-rose-600" : c.daysUntilExpiry !== null && c.daysUntilExpiry <= 60 ? "text-amber-700" : "text-slate-500"}`}>
                  {relativeDays(c.daysUntilExpiry)}
                </p>
              </td>
              <td className="px-3 py-2.5">
                <CredentialStatusBadge status={c.status} days={c.daysUntilExpiry} />
                {c.status === "EXPIRED" && <p className="mt-1 text-[11px] font-medium text-rose-600">Not valid for work</p>}
              </td>
              <td className="px-3 py-2.5 text-xs text-slate-500">
                {c.verifiedAt ? (
                  <>
                    <span className="font-medium text-slate-700">✓ {c.verifiedBy?.name ?? "Imported record"}</span>
                    <br />
                    {formatDate(c.verifiedAt)}
                  </>
                ) : (
                  <span className="text-sky-700">Awaiting verification</span>
                )}
              </td>
              {(canVerify || canDelete || canEdit) && (
                <td className="px-3 py-2.5">
                  <div className="flex justify-end gap-1">
                    {canVerify && !c.verifiedAt && c.status !== "EXPIRED" && (
                      <Button variant="primary" className="px-2.5 py-1 text-xs" disabled={busyId === c.id} onClick={() => onVerify?.(c)}>
                        Verify
                      </Button>
                    )}
                    {canEdit && (
                      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onEdit?.(c)}>Edit</Button>
                    )}
                    {canDelete && (
                      <Button variant="ghost" className="px-2 py-1 text-xs text-rose-600" disabled={busyId === c.id} onClick={() => onDelete?.(c)}>
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
