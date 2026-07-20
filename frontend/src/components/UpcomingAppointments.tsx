import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type AppointmentInput, type AppointmentQuery } from "../api/client";
import { Modal, useToast } from "./ui";
import { useAuth } from "../auth/AuthContext";
import { formatAppt } from "../lib/format";
import { mustPickProvider } from "../lib/roles";
import type { Appointment, PatientSummary, User } from "../types";

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface Filters {
  dateFrom: string;
  dateTo: string;
  type: string;
  reason: string;
}

function defaultFilters(): Filters {
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 7);
  return { dateFrom: isoDate(from), dateTo: isoDate(to), type: "All", reason: "" };
}

export default function UpcomingAppointments() {
  const navigate = useNavigate();
  const [applied, setApplied] = useState<Filters>(defaultFilters);
  const [pending, setPending] = useState<Filters>(applied);
  const [sort, setSort] = useState<"asc" | "desc">("asc");
  const [rows, setRows] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [visitTypes, setVisitTypes] = useState<string[]>([]);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    api.visitTypes().then(setVisitTypes).catch(() => setVisitTypes([]));
  }, []);

  function fetchRows(f: Filters, s: "asc" | "desc") {
    setLoading(true);
    setError("");
    const query: AppointmentQuery = {
      date_from: f.dateFrom || undefined,
      date_to: f.dateTo || undefined,
      appointment_type: f.type,
      reason: f.reason || undefined,
      sort: s,
    };
    api
      .listAppointments(query)
      .then(setRows)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load appointments"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchRows(applied, sort);
  }, [applied, sort]);

  function runFilters() {
    setApplied(pending); // triggers fetch via effect
  }
  function cancelFilters() {
    setPending(applied); // discard unapplied edits
  }
  function clearFilters() {
    const d = defaultFilters();
    setPending(d);
    setApplied(d);
    setSort("asc");
  }
  function toggleSort() {
    setSort((s) => (s === "asc" ? "desc" : "asc"));
  }

  const set = (patch: Partial<Filters>) => setPending((p) => ({ ...p, ...patch }));
  const dirty = JSON.stringify(pending) !== JSON.stringify(applied);

  return (
    <div className="card">
      <div className="card-pad" style={{ paddingBottom: 12 }}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 15 }}>Upcoming Appointments</h3>
          <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>＋ New Appointment</button>
        </div>

        {/* Filter bar (on top). Edits are staged until "Run filters". */}
        <div className="filter-bar">
          <div className="filter-fields">
            <div className="field">
              <label>From date</label>
              <input className="input" type="date" value={pending.dateFrom}
                onChange={(e) => set({ dateFrom: e.target.value })} />
            </div>
            <div className="field">
              <label>To date</label>
              <input className="input" type="date" value={pending.dateTo}
                onChange={(e) => set({ dateTo: e.target.value })} />
            </div>
            <div className="field">
              <label>Visit type</label>
              <select className="select" value={pending.type} onChange={(e) => set({ type: e.target.value })}>
                <option value="All">All types</option>
                {visitTypes.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Reason</label>
              <input className="input" placeholder="Contains…" value={pending.reason}
                onChange={(e) => set({ reason: e.target.value })} />
            </div>
          </div>
          <div className="filter-actions">
            <button className="btn btn-primary btn-sm" onClick={runFilters} disabled={loading}>▶ Run filters</button>
            <button className="btn btn-sm" onClick={cancelFilters} disabled={!dirty}>Cancel</button>
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear all filters</button>
          </div>
        </div>
      </div>

      {/* Results */}
      {error ? (
        <div style={{ padding: "8px 20px 20px" }} className="alert alert-red">{error}</div>
      ) : loading ? (
        <div style={{ padding: "8px 20px 22px" }} className="muted">Loading appointments…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: "8px 20px 22px" }} className="muted">
          No appointments match these filters.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>
                  <button className="th-sort" onClick={toggleSort}>
                    Appointment Date <span className="sort-ind">{sort === "asc" ? "▲" : "▼"}</span>
                  </button>
                </th>
                <th>Patient ID</th>
                <th>Patient</th>
                <th>Doctor</th>
                <th>Type</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="row-link" onClick={() => navigate(`/patients/${a.patient_id}`)}>
                  <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{formatAppt(a.scheduled_at)}</td>
                  <td><span className="id-chip">PID-{String(a.patient_id).padStart(4, "0")}</span></td>
                  <td style={{ fontWeight: 600 }}>{a.patient_name}</td>
                  <td>{a.provider_name ?? "—"}</td>
                  <td><span className="badge badge-blue">{a.appointment_type}</span></td>
                  <td className="muted">{a.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <NewAppointmentModal
          visitTypes={visitTypes}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); fetchRows(applied, sort); }}
        />
      )}
    </div>
  );
}

// --- New appointment modal ---------------------------------------------------
function NewAppointmentModal({
  visitTypes, onClose, onCreated,
}: {
  visitTypes: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { notify } = useToast();
  const { user } = useAuth();
  const pickProvider = mustPickProvider(user?.role); // front desk / admin choose the doctor

  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [visitType, setVisitType] = useState("");
  const [date, setDate] = useState(isoDate(new Date()));
  const [time, setTime] = useState("09:00");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Department -> doctor selection (front desk books across departments).
  const [departments, setDepartments] = useState<string[]>([]);
  const [department, setDepartment] = useState("All");
  const [providers, setProviders] = useState<User[]>([]);
  const [providerId, setProviderId] = useState<number | "">("");

  useEffect(() => {
    if (!pickProvider) return;
    api.departments().then(setDepartments).catch(() => setDepartments([]));
  }, [pickProvider]);

  useEffect(() => {
    if (!pickProvider) return;
    api.providers(department).then((ps) => { setProviders(ps); setProviderId(""); }).catch(() => setProviders([]));
  }, [pickProvider, department]);

  async function submit() {
    if (!patient) return setError("Select a patient.");
    if (pickProvider && !providerId) return setError("Select a department and doctor.");
    if (!visitType) return setError("Visit type is required.");
    if (!date || !time) return setError("Pick a date and time.");
    setBusy(true);
    setError("");
    try {
      const payload: AppointmentInput = {
        patient_id: patient.id,
        scheduled_at: `${date}T${time}:00`,
        appointment_type: visitType,
        reason,
      };
      if (pickProvider && providerId) payload.provider_id = Number(providerId);
      await api.createAppointment(payload);
      notify(`Appointment scheduled for ${patient.first_name} ${patient.last_name}`);
      onCreated();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create appointment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New Appointment"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? "Scheduling…" : "Schedule Appointment"}
          </button>
        </>
      }
    >
      {error && <div className="login-error" style={{ marginBottom: 16 }}>{error}</div>}
      <div className="form-grid">
        <div className="field full">
          <label>Patient *</label>
          <PatientPicker selected={patient} onSelect={setPatient} />
        </div>

        {pickProvider && (
          <>
            <div className="field">
              <label>Department *</label>
              <select className="select" value={department} onChange={(e) => setDepartment(e.target.value)}>
                <option value="All">All departments</option>
                {departments.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Doctor *</label>
              <select className="select" value={providerId} onChange={(e) => setProviderId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Select doctor…</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}{p.credentials ? `, ${p.credentials}` : ""} · {p.doctor_id}{p.department ? ` · ${p.department}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="field">
          <label>Visit Type *</label>
          <select className="select" value={visitType} onChange={(e) => setVisitType(e.target.value)}>
            <option value="">Select visit type…</option>
            {visitTypes.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Reason</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. BP review" />
        </div>
        <div className="field">
          <label>Date *</label>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Time *</label>
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

// Searchable patient picker (typeahead against the MPI).
function PatientPicker({
  selected, onSelect,
}: {
  selected: PatientSummary | null;
  onSelect: (p: PatientSummary | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PatientSummary[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (selected) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      api.listPatients(q).then((r) => { setResults(r); setOpen(true); }).catch(() => setResults([]));
    }, 200);
    return () => window.clearTimeout(timer.current);
  }, [q, selected]);

  if (selected) {
    return (
      <div className="row between" style={{ border: "1px solid var(--line)", borderRadius: 7, padding: "8px 11px" }}>
        <span><strong>{selected.first_name} {selected.last_name}</strong> · MRN {selected.mrn}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => { onSelect(null); setQ(""); }}>Change</button>
      </div>
    );
  }
  return (
    <div className="typeahead">
      <input className="input" value={q} placeholder="🔍 Search patient by name or MRN…"
        onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} />
      {open && results.length > 0 && (
        <div className="typeahead-list">
          {results.map((p) => (
            <button key={p.id} onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelect(p); setOpen(false); }}>
              <strong>{p.first_name} {p.last_name}</strong> · MRN {p.mrn} · {p.sex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
