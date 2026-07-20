// Small formatting helpers used across the clinical UI.

export function initials(first: string, last: string): string {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

export function age(dob: string | null | undefined): string {
  if (!dob) return "";
  const d = new Date(dob);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return `${a}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function roleLabel(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "Tomorrow · 9:00 AM" / "Mon, Jul 21 · 2:00 PM" for appointment scheduling. */
export function formatAppt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const today = new Date();
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
      86400000,
  );
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  let day: string;
  if (days === 0) day = "Today";
  else if (days === 1) day = "Tomorrow";
  else day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${day} · ${time}`;
}

const SEVERITY_BADGE: Record<string, string> = {
  Severe: "badge-red",
  Moderate: "badge-amber",
  Mild: "badge-gray",
};
export function severityBadge(sev: string): string {
  return SEVERITY_BADGE[sev] ?? "badge-gray";
}

const STATUS_BADGE: Record<string, string> = {
  Active: "badge-green",
  Chronic: "badge-blue",
  Resolved: "badge-gray",
  Discontinued: "badge-gray",
  signed: "badge-green",
  draft: "badge-amber",
  Ordered: "badge-blue",
  Completed: "badge-green",
  Cancelled: "badge-gray",
};
export function statusBadge(status: string): string {
  return STATUS_BADGE[status] ?? "badge-gray";
}
