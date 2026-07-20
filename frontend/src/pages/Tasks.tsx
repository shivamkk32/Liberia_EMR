import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ErrorState, Loading, Empty } from "../components/ui";
import { formatAppt, formatDateTime } from "../lib/format";
import { can, isFrontDesk } from "../lib/roles";
import type { AdminOverview, DashboardStats } from "../types";

interface Task {
  key: string;
  priority: "High" | "Medium" | "Low";
  label: string;
  detail: string;
  to?: string;
  tag: string;
}

export default function Tasks() {
  const { user } = useAuth();
  if (can(user, "role.edit")) return <AdminTasks />;
  return <StaffTasks />;
}

// Admin-level task queue: onboarding, access/security, product issues.
function AdminTasks() {
  const [d, setD] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  function load() {
    setLoading(true); setError("");
    api.adminOverview().then(setD)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load tasks"))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);
  if (loading) return <Loading label="Loading admin tasks…" />;
  if (error || !d) return <ErrorState message={error} onRetry={load} />;

  const items: { priority: string; label: string; detail: string; tag: string }[] = [];
  for (const u of d.recent_users.filter((u) => u.must_change_password)) {
    items.push({ priority: "Medium", label: "Onboard new staff member",
      detail: `${u.full_name} · ${u.role} · ${u.doctor_id} — first-login password pending`, tag: "Onboarding" });
  }
  if (d.denials_recent > 0) items.push({ priority: "High", label: "Review access denials",
    detail: `${d.denials_recent} permission-denied events in the audit trail`, tag: "Security" });
  if (d.inactive_users > 0) items.push({ priority: "Low", label: "Disabled accounts",
    detail: `${d.inactive_users} account(s) currently deactivated`, tag: "Users" });
  items.push({ priority: "Low", label: "Product / support issues",
    detail: "User-raised product issues appear here once support integration is enabled.", tag: "Support" });
  const prio = (p: string) => (p === "High" ? "badge-red" : p === "Medium" ? "badge-amber" : "badge-gray");

  return (
    <div>
      <div className="page-head">
        <div><h1 className="page-title">Admin Tasks</h1><div className="page-sub">Onboarding, access &amp; security, and product issues.</div></div>
        <span className="chip">{items.length} open</span>
      </div>
      <div className="card"><div style={{ padding: "4px 20px 12px" }}>
        {items.map((t, i) => (
          <Link key={i} to="/admin" className="list-line" style={{ color: "inherit" }}>
            <div className="row" style={{ gap: 12 }}>
              <span className={`badge ${prio(t.priority)}`}>{t.priority}</span>
              <div><div className="main">{t.label} <span className="chip" style={{ fontSize: 11 }}>{t.tag}</span></div><div className="sub">{t.detail}</div></div>
            </div>
            <span className="chip">Open →</span>
          </Link>
        ))}
      </div></div>
    </div>
  );
}

function StaffTasks() {
  const { user } = useAuth();
  const fd = isFrontDesk(user?.role);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function load() {
    setLoading(true); setError("");
    api.dashboard().then(setStats)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load tasks"))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  if (loading) return <Loading label="Loading tasks…" />;
  if (error || !stats) return <ErrorState message={error} onRetry={load} />;

  const tasks: Task[] = [];

  // Patient reports to review (both roles; front desk forwards to clinician).
  for (const n of stats.notifications.filter((n) => n.category === "Report")) {
    tasks.push({
      key: `report-${n.id}`, priority: n.level === "warning" || n.level === "critical" ? "High" : "Medium",
      label: fd ? "Report received — notify clinician" : "Review incoming report",
      detail: `${n.patient_name ? n.patient_name + " · " : ""}${n.message}`,
      to: n.patient_id ? `/patients/${n.patient_id}` : undefined, tag: "Report",
    });
  }

  // Clinicians: draft encounters awaiting sign-off (from today's list).
  if (!fd) {
    for (const e of stats.todays_encounters.filter((e) => e.status === "draft")) {
      tasks.push({
        key: `sign-${e.id}`, priority: "High", label: "Sign encounter",
        detail: `${e.reason || e.encounter_type} · ENC-${String(e.id).padStart(4, "0")}`,
        to: `/encounters/${e.id}`, tag: "Sign-off",
      });
    }
  }

  // Upcoming appointments to prepare/confirm.
  for (const a of stats.upcoming.slice(0, 8)) {
    tasks.push({
      key: `appt-${a.id}`, priority: "Low",
      label: fd ? "Confirm appointment" : "Upcoming appointment",
      detail: `${a.patient_name} · ${a.appointment_type} · ${formatAppt(a.scheduled_at)}${a.provider_name ? " · " + a.provider_name : ""}`,
      to: a.patient_id ? `/patients/${a.patient_id}` : undefined, tag: "Appointment",
    });
  }

  const order = { High: 0, Medium: 1, Low: 2 } as const;
  tasks.sort((a, b) => order[a.priority] - order[b.priority]);

  const prioBadge = (p: Task["priority"]) => (p === "High" ? "badge-red" : p === "Medium" ? "badge-amber" : "badge-gray");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Tasks</h1>
          <div className="page-sub">{fd ? "Reception queue — reports, confirmations, and follow-ups." : "Your prioritized work queue."}</div>
        </div>
        <span className="chip">{tasks.length} open</span>
      </div>

      <div className="card">
        {tasks.length === 0 ? (
          <Empty icon="✅" title="You're all caught up" hint="No pending tasks right now." />
        ) : (
          <div style={{ padding: "4px 20px 12px" }}>
            {tasks.map((t) => (
              <div className="list-line" key={t.key}>
                <div className="row" style={{ gap: 12 }}>
                  <span className={`badge ${prioBadge(t.priority)}`}>{t.priority}</span>
                  <div>
                    <div className="main">{t.label} <span className="chip" style={{ fontSize: 11 }}>{t.tag}</span></div>
                    <div className="sub">{t.detail}</div>
                  </div>
                </div>
                {t.to && <Link to={t.to} className="btn btn-sm">Open →</Link>}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        Last refreshed {formatDateTime(new Date().toISOString())}
      </div>
    </div>
  );
}
