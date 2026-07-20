import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ErrorState, Loading } from "../components/ui";
import { formatDateTime } from "../lib/format";
import type { AdminOverview } from "../types";

export default function AdminDashboard() {
  const { user } = useAuth();
  const [d, setD] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function load() {
    setLoading(true); setError("");
    api.adminOverview().then(setD)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load overview"))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);
  if (loading) return <Loading label="Loading administration overview…" />;
  if (error || !d) return <ErrorState message={error} onRetry={load} />;

  const maxRole = Math.max(1, ...d.users_by_role.map((r) => r.count));
  const maxDept = Math.max(1, ...d.doctors_by_department.map((x) => x.count));

  // Admin-level task queue (onboarding, security, config).
  const tasks: { priority: "High" | "Medium" | "Low"; label: string; detail: string; to: string }[] = [];
  for (const u of d.recent_users.filter((u) => u.must_change_password)) {
    tasks.push({ priority: "Medium", label: "Onboard new staff member",
      detail: `${u.full_name} · ${u.role} · ${u.doctor_id} — pending first-login password change`, to: "/admin" });
  }
  if (d.denials_recent > 0) {
    tasks.push({ priority: "High", label: "Review access denials",
      detail: `${d.denials_recent} permission-denied events in the audit trail`, to: "/admin" });
  }
  if (d.inactive_users > 0) {
    tasks.push({ priority: "Low", label: "Deactivated accounts",
      detail: `${d.inactive_users} account(s) currently disabled`, to: "/admin" });
  }
  tasks.push({ priority: "Low", label: "Support & product issues",
    detail: "User-raised product issues surface here (support integration).", to: "/admin" });
  const prioBadge = (p: string) => (p === "High" ? "badge-red" : p === "Medium" ? "badge-amber" : "badge-gray");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Administration Overview 🛡</h1>
          <div className="page-sub">
            Organization-wide statistics — {user?.full_name} · <span className="id-chip">{user?.doctor_id}</span> · {user?.scope_level} scope
          </div>
        </div>
        <Link to="/admin" className="btn btn-primary">Manage Users &amp; Roles →</Link>
      </div>

      {/* Org stat tiles */}
      <div className="stat-grid">
        <div className="stat"><div className="label">Total Users</div><div className="value">{d.total_users}</div><div className="sub">{d.active_users} active · {d.inactive_users} disabled</div></div>
        <div className="stat blue"><div className="label">Doctors</div><div className="value">{d.total_doctors}</div><div className="sub">across {d.doctors_by_department.length} departments</div></div>
        <div className="stat amber"><div className="label">Total Appointments</div><div className="value">{d.total_appointments}</div><div className="sub">{d.upcoming_appointments} upcoming (7d)</div></div>
        <div className="stat ink"><div className="label">Registered Patients</div><div className="value">{d.total_patients}</div><div className="sub">{d.total_facilities} facilities</div></div>
      </div>
      <div className="stat-grid">
        <div className="stat blue"><div className="label">Encounters</div><div className="value">{d.total_encounters}</div><div className="sub">documented visits</div></div>
        <div className="stat"><div className="label">Roles</div><div className="value">{d.total_roles}</div><div className="sub">{d.total_permissions} permissions</div></div>
        <div className="stat amber"><div className="label">Pending Onboarding</div><div className="value">{d.pending_onboarding}</div><div className="sub">must change password</div></div>
        <div className="stat"><div className="label" style={{ color: d.denials_recent ? "var(--red-600)" : undefined }}>Access Denials</div><div className="value">{d.denials_recent}</div><div className="sub">in audit trail</div></div>
      </div>

      <div className="two-col-wide">
        <div className="stack">
          {/* Doctors by department */}
          <div className="card card-pad">
            <div className="row between" style={{ marginBottom: 12 }}>
              <h3 style={{ fontSize: 15 }}>Doctors by Department</h3>
              <span className="chip">{d.total_doctors} total</span>
            </div>
            {d.doctors_by_department.length === 0 && <div className="muted">No doctors registered.</div>}
            {d.doctors_by_department.map((x) => (
              <div key={x.department} className="bar-row">
                <div className="bar-label">{x.department}</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(x.count / maxDept) * 100}%` }} /></div>
                <div className="bar-count">{x.count}</div>
              </div>
            ))}
          </div>

          {/* Users by role */}
          <div className="card card-pad">
            <div className="row between" style={{ marginBottom: 12 }}>
              <h3 style={{ fontSize: 15 }}>Staff by Role</h3>
              <span className="chip">{d.total_users} total</span>
            </div>
            {d.users_by_role.map((r) => (
              <div key={r.key} className="bar-row">
                <div className="bar-label">{r.name}</div>
                <div className="bar-track"><div className="bar-fill blue" style={{ width: `${(r.count / maxRole) * 100}%` }} /></div>
                <div className="bar-count">{r.count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          {/* Admin tasks */}
          <div className="card">
            <div className="card-pad" style={{ paddingBottom: 8 }}>
              <div className="row between"><h3 style={{ fontSize: 15 }}>🛠 Admin Tasks</h3><span className="chip">{tasks.length}</span></div>
            </div>
            <div style={{ padding: "0 20px 12px" }}>
              {tasks.map((t, i) => (
                <Link key={i} to={t.to} className="list-line" style={{ color: "inherit" }}>
                  <div className="row" style={{ gap: 10 }}>
                    <span className={`badge ${prioBadge(t.priority)}`}>{t.priority}</span>
                    <div>
                      <div className="main">{t.label}</div>
                      <div className="sub">{t.detail}</div>
                    </div>
                  </div>
                  <span className="chip">Open →</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Recent administrative activity */}
          <div className="card">
            <div className="card-pad" style={{ paddingBottom: 8 }}>
              <div className="row between"><h3 style={{ fontSize: 15 }}>Recent Admin Activity</h3><Link to="/admin" className="btn btn-sm btn-ghost">Audit →</Link></div>
            </div>
            <div style={{ padding: "0 20px 14px" }}>
              {d.recent_activity.length === 0 && <div className="muted">No recent activity.</div>}
              {d.recent_activity.map((a) => (
                <div key={a.id} className="list-line">
                  <div>
                    <div className="main">{a.action.replace(/_/g, " ")} <span className="muted" style={{ fontWeight: 400 }}>by {a.username}</span></div>
                    <div className="sub">{a.detail || a.role} · {formatDateTime(a.timestamp)}</div>
                  </div>
                  {a.decision === "deny"
                    ? <span className="badge badge-red">deny</span>
                    : <span className="badge badge-green">allow</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
