export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function relativeDays(days: number | null): string {
  if (days === null) return "No expiry";
  if (days === 0) return "Expires today";
  if (days < 0) return `Expired ${Math.abs(days)} day${days === -1 ? "" : "s"} ago`;
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

export function humanize(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Client-side preview of the backend status rule (the server remains the source of truth). */
export function previewStatus(expiryDate: string | null, today = new Date().toISOString().slice(0, 10)) {
  if (!expiryDate) return "VALID" as const;
  if (expiryDate < today) return "EXPIRED" as const;
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + 60);
  return expiryDate <= limit.toISOString().slice(0, 10) ? ("EXPIRING_SOON" as const) : ("VALID" as const);
}
