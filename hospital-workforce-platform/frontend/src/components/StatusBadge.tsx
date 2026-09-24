import type { ComplianceStatus, CredentialStatus } from "../lib/types";

export const CREDENTIAL_STATUS_META: Record<CredentialStatus, { label: string; icon: string; className: string; dot: string }> = {
  VALID: { label: "Valid", icon: "✓", className: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  EXPIRING_SOON: { label: "Expiring soon", icon: "!", className: "bg-amber-50 text-amber-800 ring-amber-300", dot: "bg-amber-500" },
  EXPIRED: { label: "Expired", icon: "✕", className: "bg-rose-50 text-rose-700 ring-rose-300", dot: "bg-rose-500" },
  PENDING_VERIFICATION: { label: "Pending verification", icon: "…", className: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500" },
};

export function CredentialStatusBadge({ status, days }: { status: CredentialStatus; days?: number | null }) {
  const m = CREDENTIAL_STATUS_META[status];
  return (
    <span
      data-testid="credential-status"
      data-status={status}
      title={status === "EXPIRED" ? "Expired — not valid for work (Rule 2)" : m.label}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${m.className}`}
    >
      <span className={`grid h-3.5 w-3.5 place-items-center rounded-full text-[9px] font-black text-white ${m.dot}`} aria-hidden>
        {m.icon}
      </span>
      {m.label}
      {typeof days === "number" && status === "EXPIRING_SOON" && <span className="font-normal">· {days}d</span>}
    </span>
  );
}

const COMPLIANCE_META: Record<ComplianceStatus, { label: string; className: string }> = {
  COMPLIANT: { label: "Compliant", className: "bg-emerald-600 text-white" },
  AT_RISK: { label: "At risk", className: "bg-amber-500 text-white" },
  NON_COMPLIANT: { label: "Non-compliant", className: "bg-rose-600 text-white" },
  NOT_REQUIRED: { label: "Not required", className: "bg-slate-200 text-slate-700" },
};

export function ComplianceBadge({ status }: { status: ComplianceStatus }) {
  const m = COMPLIANCE_META[status];
  return (
    <span data-testid="compliance-status" data-status={status} className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ${m.className}`}>
      {m.label}
    </span>
  );
}

export function CategoryBadge({ category }: { category: "CLINICAL" | "NON_CLINICAL" }) {
  return category === "CLINICAL" ? (
    <span className="rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 ring-1 ring-teal-200">Clinical</span>
  ) : (
    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">Non Clinical</span>
  );
}
