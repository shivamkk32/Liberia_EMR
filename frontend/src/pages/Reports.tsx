import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { ErrorState, Loading } from "../components/ui";
import { formatDateTime } from "../lib/format";
import type { DashboardStats, Notification } from "../types";

export default function Reports() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [reports, setReports] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function load() {
    setLoading(true); setError("");
    Promise.all([api.dashboard(), api.notifications({ category: "Report" })])
      .then(([s, r]) => { setStats(s); setReports(r); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load reports"))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  if (loading) return <Loading label="Loading reports…" />;
  if (error || !stats) return <ErrorState message={error} onRetry={load} />;

  const cards = [
    { label: "Patients (panel)", value: stats.my_patients, cls: "" },
    { label: "Total Encounters", value: stats.total_encounters, cls: "blue" },
    { label: "Signed Notes", value: stats.signed_encounters, cls: "ink" },
    { label: "Draft Notes", value: stats.draft_encounters, cls: "amber" },
    { label: "Upcoming Appts (7d)", value: stats.upcoming_appointments, cls: "blue" },
    { label: "Reports Received", value: reports.length, cls: "" },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Reports &amp; Analytics</h1>
          <div className="page-sub">Operational snapshot and incoming patient reports.</div>
        </div>
      </div>

      <div className="stat-grid">
        {cards.map((c) => (
          <div className={`stat ${c.cls}`} key={c.label}>
            <div className="label">{c.label}</div>
            <div className="value">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 8 }}>
          <div className="row between">
            <h3 style={{ fontSize: 15 }}>Incoming Patient Reports</h3>
            <span className="chip">{reports.length}</span>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr><th>Report</th><th>Patient</th><th>MRN</th><th>Details</th><th>Received</th></tr>
            </thead>
            <tbody>
              {reports.length === 0 && <tr><td colSpan={5} className="muted">No reports received.</td></tr>}
              {reports.map((n) => (
                <tr key={n.id}>
                  <td style={{ fontWeight: 600 }}>{n.title}</td>
                  <td>{n.patient_id ? <Link to={`/patients/${n.patient_id}`}>{n.patient_name}</Link> : "—"}</td>
                  <td><span className="id-chip">{n.patient_mrn ?? "—"}</span></td>
                  <td className="muted">{n.message}</td>
                  <td className="muted">{formatDateTime(n.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        Note: national DHIS2 aggregate reporting and executive dashboards arrive with the analytics module (later MVP).
      </div>
    </div>
  );
}
