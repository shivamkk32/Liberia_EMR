import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ErrorState, Loading } from "../components/ui";
import UpcomingAppointments from "../components/UpcomingAppointments";
import AdminDashboard from "./AdminDashboard";
import { age, formatDate, formatDateTime, statusBadge } from "../lib/format";
import { can, isFrontDesk } from "../lib/roles";
import type { DashboardStats, Notification, PatientSummary } from "../types";

const NOTIF_STYLE: Record<string, { badge: string; icon: string }> = {
  critical: { badge: "badge-red", icon: "🔴" },
  warning: { badge: "badge-amber", icon: "⚠️" },
  success: { badge: "badge-green", icon: "✅" },
  info: { badge: "badge-blue", icon: "🔔" },
};

export default function Dashboard() {
  const { user } = useAuth();
  // System Admin (role.edit) gets the organization-level admin dashboard.
  if (can(user, "role.edit")) return <AdminDashboard />;
  return <StaffDashboard />;
}

function StaffDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    setError("");
    api
      .dashboard()
      .then(setStats)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  if (loading) return <Loading label="Loading dashboard…" />;
  if (error || !stats) return <ErrorState message={error} onRetry={load} />;

  const firstName = user?.full_name?.split(" ")[0] ?? "";
  const fd = isFrontDesk(user?.role);
  const reports = stats.notifications.filter((n) => n.category === "Report");
  const general = stats.notifications.filter((n) => n.category !== "Report");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {fd ? "Reception Desk" : `Good day, ${firstName}`} {fd ? "🗂️" : "👋"}
          </h1>
          <div className="page-sub">
            {fd
              ? <>Registration &amp; scheduling — {stats.provider_name} · <span className="id-chip">{user?.doctor_id}</span></>
              : <>Your panel for today — {stats.provider_name} · <span className="id-chip">{user?.doctor_id}</span></>}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link to="/patients" className="btn btn-primary">＋ Register / Find Patient</Link>
          <Link to="/schedule" className="btn">📅 Schedule</Link>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="stat-grid">
        <div className="stat">
          <div className="label">{fd ? "Facility Patients" : "My Patients"}</div>
          <div className="value">{stats.my_patients}</div>
          <div className="sub">{fd ? "registered" : "assigned to you"}</div>
        </div>
        <div className="stat amber">
          <div className="label">Upcoming (7 days)</div>
          <div className="value">{stats.upcoming_appointments}</div>
          <div className="sub">scheduled appointments</div>
        </div>
        <div className="stat blue">
          <div className="label">Reports Received</div>
          <div className="value">{reports.length}</div>
          <div className="sub">patient results</div>
        </div>
        {fd ? (
          <div className="stat ink">
            <div className="label">Notifications</div>
            <div className="value">{stats.notifications.length}</div>
            <div className="sub">facility &amp; system</div>
          </div>
        ) : (
          <div className="stat ink">
            <div className="label">Draft Notes</div>
            <div className="value">{stats.draft_encounters}</div>
            <div className="sub">awaiting sign-off</div>
          </div>
        )}
      </div>

      <div className="two-col-wide">
        {/* Main column */}
        <div className="stack">
          {/* Clinicians see today's encounters; front desk does not (clinical). */}
          {!fd && (
            <div className="card">
              <div className="card-pad" style={{ paddingBottom: 8 }}>
                <div className="row between">
                  <h3 style={{ fontSize: 15 }}>Today's Encounters</h3>
                  <span className="chip">{stats.todays_encounters.length}</span>
                </div>
              </div>
              <div style={{ padding: "0 20px 14px" }}>
                {stats.todays_encounters.length === 0 && <div className="muted">No encounters documented today.</div>}
                {stats.todays_encounters.map((e) => (
                  <Link key={e.id} to={`/encounters/${e.id}`} className="list-line" style={{ color: "inherit" }}>
                    <div>
                      <div className="main">{e.reason || e.encounter_type} <span className="id-chip">ENC-{String(e.id).padStart(4, "0")}</span></div>
                      <div className="sub">{e.chief_complaint?.slice(0, 44) || "—"} · {formatDateTime(e.created_at)}</div>
                    </div>
                    <span className={`badge ${statusBadge(e.status)}`}>{e.status}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <UpcomingAppointments />
        </div>

        {/* Side column */}
        <div className="stack">
          {/* Patient report notifications — results received for a patient */}
          <div className="card">
            <div className="card-pad" style={{ paddingBottom: 8 }}>
              <div className="row between">
                <h3 style={{ fontSize: 15 }}>🧪 Patient Reports Received</h3>
                <span className="chip">{reports.length}</span>
              </div>
            </div>
            <div style={{ padding: "0 18px 16px" }}>
              {reports.length === 0 && <div className="muted">No new patient reports.</div>}
              {reports.map((n) => <NotifItem key={n.id} n={n} showPatient />)}
            </div>
          </div>

          {/* Hospital / system notifications */}
          <div className="card">
            <div className="card-pad" style={{ paddingBottom: 8 }}>
              <div className="row between">
                <h3 style={{ fontSize: 15 }}>🏥 Hospital Notifications</h3>
                <span className="chip">{general.length}</span>
              </div>
            </div>
            <div style={{ padding: "0 18px 16px" }}>
              {general.length === 0 && <div className="muted">No notifications.</div>}
              {general.map((n) => <NotifItem key={n.id} n={n} />)}
            </div>
          </div>

          {/* Patients */}
          <div className="card">
            <div className="card-pad" style={{ paddingBottom: 8 }}>
              <div className="row between">
                <h3 style={{ fontSize: 15 }}>{fd ? "Recently Registered" : "My Patients"}</h3>
                <Link to="/patients" className="btn btn-sm btn-ghost">View all →</Link>
              </div>
            </div>
            <div style={{ padding: "0 20px 14px" }}>
              {stats.patients.length === 0 && <div className="muted">No patients.</div>}
              {stats.patients.map((p: PatientSummary) => (
                <Link key={p.id} to={`/patients/${p.id}`} className="list-line" style={{ color: "inherit" }}>
                  <div>
                    <div className="main">{p.first_name} {p.last_name}</div>
                    <div className="sub"><span className="id-chip">MRN {p.mrn}</span> · {age(p.date_of_birth)}{p.sex?.[0] ?? ""} · DOB {formatDate(p.date_of_birth)}</div>
                  </div>
                  <span className="chip">Open →</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotifItem({ n, showPatient }: { n: Notification; showPatient?: boolean }) {
  const s = NOTIF_STYLE[n.level] ?? NOTIF_STYLE.info;
  return (
    <div className="notif">
      <span className="notif-icon">{s.icon}</span>
      <div style={{ flex: 1 }}>
        <div className="row between" style={{ gap: 8 }}>
          <span className="notif-title">{n.title}</span>
          <span className={`badge ${s.badge}`}>{n.category}</span>
        </div>
        <div className="notif-msg">{n.message}</div>
        <div className="notif-time">
          {showPatient && n.patient_id && (
            <Link to={`/patients/${n.patient_id}`} className="id-chip" style={{ marginRight: 6 }}>
              {n.patient_name} · MRN {n.patient_mrn}
            </Link>
          )}
          {formatDateTime(n.created_at)}
        </div>
      </div>
    </div>
  );
}
