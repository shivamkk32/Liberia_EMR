import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ErrorState, Loading } from "../components/ui";
import {
  age, formatDate, formatDateTime, initials, severityBadge, statusBadge,
} from "../lib/format";
import { flagVital, vitalClass, vitalLabel, type VitalLevel } from "../lib/clinicalSafety";
import { can } from "../lib/roles";
import { Modal, useToast } from "../components/ui";
import type { Encounter, EncounterSummary, Patient, User } from "../types";

type Tab = "demographics" | "summary" | "timeline";

export default function PatientChart() {
  const { id } = useParams();
  const patientId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const clinical = can(user, "patient.view_clinical");   // pharmacy/lab/nurse/doctor
  const canEncounters = can(user, "encounter.view");     // nurse/doctor only
  const canTransfer = can(user, "patient.transfer");
  const canChart = can(user, "encounter.create");

  const [patient, setPatient] = useState<Patient | null>(null);
  const [encounters, setEncounters] = useState<EncounterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>(clinical ? "summary" : "demographics");
  const [showTransfer, setShowTransfer] = useState(false);

  function load() {
    setLoading(true);
    setError("");
    // Only fetch encounters if permitted (front-desk/pharmacy/lab 403 on them).
    const work = canEncounters
      ? Promise.all([api.getPatient(patientId), api.listPatientEncounters(patientId)])
      : api.getPatient(patientId).then((p) => [p, []] as [Patient, EncounterSummary[]]);
    work
      .then(([p, e]) => { setPatient(p); setEncounters(e); })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load chart"))
      .finally(() => setLoading(false));
  }
  useEffect(load, [patientId]);

  if (loading) return <Loading label="Loading chart…" />;
  if (error || !patient) return <ErrorState message={error} onRetry={load} />;

  const activeAllergies = patient.allergies.filter((a) => a.status === "Active");

  return (
    <div>
      <div className="row between" style={{ marginBottom: 14 }}>
        <button className="btn btn-sm btn-ghost" onClick={() => navigate("/patients")}>← Patients</button>
        <div className="row" style={{ gap: 8 }}>
          {canTransfer && (
            <button className="btn" onClick={() => setShowTransfer(true)}>⇄ Transfer Care</button>
          )}
          {canChart && (
            <button className="btn btn-primary"
              onClick={() => navigate(`/patients/${patientId}/encounters/new`)}>
              ＋ New Encounter (SOAP)
            </button>
          )}
        </div>
      </div>

      {showTransfer && (
        <TransferModal patient={patient} onClose={() => setShowTransfer(false)}
          onDone={() => { setShowTransfer(false); load(); }} />
      )}

      {/* Header */}
      <div className="patient-header">
        <div className="patient-id-row">
          <div className="patient-avatar">{initials(patient.first_name, patient.last_name)}</div>
          <div style={{ flex: 1 }}>
            <div className="patient-name">{patient.title ? `${patient.title} ` : ""}{patient.first_name} {patient.last_name}</div>
            <div className="patient-meta">
              {age(patient.date_of_birth)} yrs · {patient.sex} · DOB {formatDate(patient.date_of_birth)}
            </div>
            <div className="pill-row">
              <span className="id-chip">PID-{String(patient.id).padStart(4, "0")}</span>
              <span className="id-chip">MRN {patient.mrn}</span>
              {patient.prn && <span className="id-chip">PRN {patient.prn}</span>}
              {patient.national_id && <span className="id-chip">NID {patient.national_id}</span>}
              {patient.portal_enrolled && <span className="badge badge-green">Portal Enrolled</span>}
              {patient.insurance_provider && <span className="badge badge-blue">{patient.insurance_provider}</span>}
              {patient.primary_provider_name && <span className="chip">PCP: {patient.primary_provider_name}</span>}
            </div>
          </div>
        </div>

        {activeAllergies.length > 0 && (
          <div className="alert alert-red" style={{ marginTop: 14 }}>
            <span>⚠️</span>
            <div>
              <strong>High-Risk Allergies:</strong>{" "}
              {activeAllergies.map((a) => `${a.substance} (${a.severity})`).join(", ")}
            </div>
          </div>
        )}
      </div>

      {/* Tabs — rendered from the viewer's permissions (field-level protection) */}
      <div className="chart-tabs">
        <button className={`chart-tab${tab === "demographics" ? " active" : ""}`} onClick={() => setTab("demographics")}>Demographics</button>
        {clinical && (
          <button className={`chart-tab${tab === "summary" ? " active" : ""}`} onClick={() => setTab("summary")}>Clinical Summary</button>
        )}
        {canEncounters && (
          <button className={`chart-tab${tab === "timeline" ? " active" : ""}`} onClick={() => setTab("timeline")}>
            Timeline ({encounters.length})
          </button>
        )}
      </div>

      {tab === "demographics" && <Demographics patient={patient} />}
      {tab === "summary" && clinical && <Summary patient={patient} encounters={encounters} canEncounters={canEncounters} />}
      {tab === "timeline" && canEncounters && <Timeline patientId={patientId} encounters={encounters} canChart={canChart} />}
      {!clinical && (
        <div className="alert alert-amber" style={{ marginTop: 16 }}>
          <span>🔒</span>
          <div>Clinical visit details are restricted for your role. Your access covers registration and scheduling.</div>
        </div>
      )}
    </div>
  );
}

// --- Transfer of care modal (PS-03) ---
function TransferModal({ patient, onClose, onDone }:
  { patient: Patient; onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  const { user } = useAuth();
  const [providers, setProviders] = useState<User[]>([]);
  const [toId, setToId] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.providers().then((ps) => setProviders(ps.filter((p) => p.id !== patient.primary_provider_id)))
      .catch(() => setProviders([]));
  }, []);

  async function submit() {
    if (!toId) return setError("Select a receiving clinician.");
    setBusy(true); setError("");
    try {
      await api.transferPatient(patient.id, Number(toId), reason);
      notify(`Care transferred for ${patient.first_name} ${patient.last_name}`);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Transfer failed");
    } finally { setBusy(false); }
  }

  return (
    <Modal title="Transfer of Care" onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Transferring…" : "Transfer Patient"}</button>
      </>}>
      {error && <div className="login-error" style={{ marginBottom: 14 }}>{error}</div>}
      <p className="muted" style={{ marginTop: 0 }}>
        Reassign <strong>{patient.first_name} {patient.last_name}</strong> (MRN {patient.mrn}) from
        {" "}{user?.full_name} to another clinician. The patient will move to the receiving provider's panel.
      </p>
      <div className="field" style={{ marginBottom: 12 }}>
        <label>Receiving Clinician *</label>
        <select className="select" value={toId} onChange={(e) => setToId(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Select clinician…</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name}{p.credentials ? `, ${p.credentials}` : ""} · {p.doctor_id}{p.department ? ` · ${p.department}` : ""}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Reason</label>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Referred to specialist" />
      </div>
    </Modal>
  );
}

function Demographics({ patient }: { patient: Patient }) {
  const rows: [string, string][][] = [
    [
      ["Title", patient.title], ["First Name", patient.first_name], ["Middle Name", patient.middle_name],
      ["Last Name", patient.last_name], ["Date of Birth", formatDate(patient.date_of_birth)],
      ["Age", `${age(patient.date_of_birth)} yrs`], ["Sex", patient.sex], ["National ID", patient.national_id],
      ["Marital Status", patient.marital_status], ["Blood Group", patient.blood_group],
      ["Nationality", patient.nationality], ["Occupation", patient.occupation],
      ["Religion", patient.religion], ["Language", patient.language], ["Disability", patient.disability],
    ],
    [
      ["Primary Phone", patient.phone], ["Alternate Phone", patient.alt_phone], ["Email", patient.email],
      ["County / Region", patient.county], ["District", patient.district], ["Town", patient.town],
      ["Address", patient.address],
    ],
    [
      ["Next of Kin", patient.next_of_kin_name], ["Relationship", patient.next_of_kin_relationship],
      ["NoK Phone", patient.next_of_kin_phone],
    ],
    [
      ["Insurance Provider", patient.insurance_provider], ["Insurance ID", patient.insurance_id],
      ["Scheme", patient.insurance_scheme], ["Registered", formatDateTime(patient.created_at)],
    ],
  ];
  const titles = ["Identity & Demographics", "Contact & Address", "Next of Kin", "Insurance & Enrollment"];
  return (
    <div className="stack">
      {rows.map((section, i) => (
        <div className="card card-pad" key={i}>
          <div className="section-title" style={{ marginBottom: 12 }}>{titles[i]}</div>
          <div className="demo-grid">
            {section.map(([label, value]) => (
              <div className="demo-item" key={label}>
                <div className="demo-label">{label}</div>
                <div className="demo-value">{value || "—"}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Summary({ patient, encounters, canEncounters }:
  { patient: Patient; encounters: EncounterSummary[]; canEncounters: boolean }) {
  const meds = patient.medications;
  const activeMeds = meds.filter((m) => m.status === "Active");

  return (
    <div className="two-col">
      {/* Left rail: problems, meds, allergies */}
      <div className="stack">
        <div className="card card-pad">
          <div className="row between" style={{ marginBottom: 10 }}>
            <span className="section-title">Problem List</span>
            <span className="chip">{patient.problems.length}</span>
          </div>
          {patient.problems.length === 0 && <div className="muted">No documented problems.</div>}
          {patient.problems.map((p) => (
            <div key={p.id} className="list-line">
              <div>
                <div className="main">{p.description}</div>
                <div className="sub">{p.icd10_code || "—"}{p.onset_date ? ` · onset ${formatDate(p.onset_date)}` : ""}</div>
              </div>
              <span className={`badge ${statusBadge(p.status)}`}>{p.status}</span>
            </div>
          ))}
        </div>

        <div className="card card-pad">
          <div className="row between" style={{ marginBottom: 10 }}>
            <span className="section-title">Medications</span>
            <span className="chip">{activeMeds.length} active</span>
          </div>
          {meds.length === 0 && <div className="muted">No medications on file.</div>}
          {meds.map((m) => (
            <div key={m.id} className="list-line">
              <div>
                <div className="main">{m.name} {m.dose}</div>
                <div className="sub">{[m.form, m.route, m.frequency].filter(Boolean).join(" · ")}</div>
              </div>
              <span className={`badge ${statusBadge(m.status)}`}>{m.status === "Active" ? m.frequency || "Active" : "Stopped"}</span>
            </div>
          ))}
        </div>

        <div className="card card-pad">
          <span className="section-title">Allergies</span>
          <div style={{ marginTop: 10 }}>
            {patient.allergies.length === 0 && <div className="muted">No known allergies.</div>}
            {patient.allergies.map((a) => (
              <div key={a.id} className="list-line">
                <div>
                  <div className="main">{a.substance}</div>
                  <div className="sub">{a.reaction || "Reaction not specified"}</div>
                </div>
                <span className={`badge ${severityBadge(a.severity)}`}>{a.severity}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: encounters (only for roles with encounter.view) */}
      <div className="stack">
        {canEncounters ? (
          <>
            <LatestEncounter encounters={encounters} />
            <div className="card">
              <div className="card-pad" style={{ paddingBottom: 8 }}>
                <span className="section-title">Recent Encounters</span>
              </div>
              <div style={{ padding: "0 20px 14px" }}>
                {encounters.length === 0 && <div className="muted">No encounters recorded.</div>}
                {encounters.slice(0, 6).map((e) => (
                  <Link key={e.id} to={`/encounters/${e.id}`} className="list-line" style={{ color: "inherit" }}>
                    <div>
                      <div className="main">{e.reason || e.encounter_type}</div>
                      <div className="sub">{formatDateTime(e.created_at)} · {e.provider_name}</div>
                    </div>
                    <span className={`badge ${statusBadge(e.status)}`}>{e.status}</span>
                  </Link>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="card card-pad muted">
            Encounter notes are not available for your role. You can view the patient's
            active medications, problems, and allergies as needed for your work.
          </div>
        )}
      </div>
    </div>
  );
}

function LatestEncounter({ encounters }: { encounters: EncounterSummary[] }) {
  const [full, setFull] = useState<Encounter | null>(null);
  const latest = encounters[0];

  useEffect(() => {
    if (latest) api.getEncounter(latest.id).then(setFull).catch(() => setFull(null));
  }, [latest?.id]);

  if (!latest) {
    return (
      <div className="card card-pad">
        <span className="section-title">Most Recent Encounter</span>
        <div className="muted" style={{ marginTop: 10 }}>No encounters yet. Start a new SOAP note.</div>
      </div>
    );
  }
  if (!full) return <div className="card card-pad"><Loading label="Loading latest encounter…" /></div>;

  return (
    <div className="card card-pad">
      <div className="row between" style={{ marginBottom: 12 }}>
        <span className="section-title">Most Recent Encounter</span>
        <Link to={`/encounters/${full.id}`} className="btn btn-sm">Open full note →</Link>
      </div>
      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        <span className="badge badge-blue">{full.encounter_type}</span>
        <span className={`badge ${statusBadge(full.status)}`}>{full.status}</span>
        <span className="muted">{formatDateTime(full.created_at)} · {full.provider_name}</span>
      </div>

      {(full.bp_systolic || full.heart_rate) && (
        <div className="vitals-grid" style={{ marginBottom: 14 }}>
          {full.bp_systolic != null && <Vital k="BP" v={`${full.bp_systolic}/${full.bp_diastolic}`} level={flagVital("bp_systolic", full.bp_systolic)} />}
          {full.heart_rate != null && <Vital k="HR" v={`${full.heart_rate}`} level={flagVital("heart_rate", full.heart_rate)} />}
          {full.resp_rate != null && <Vital k="RR" v={`${full.resp_rate}`} level={flagVital("resp_rate", full.resp_rate)} />}
          {full.temperature_f != null && <Vital k="Temp °F" v={`${full.temperature_f}`} level={flagVital("temperature_f", full.temperature_f)} />}
          {full.spo2 != null && <Vital k="SpO₂" v={`${full.spo2}%`} level={flagVital("spo2", full.spo2)} />}
          {full.bmi != null && <Vital k="BMI" v={`${full.bmi}`} level={flagVital("bmi", full.bmi)} />}
        </div>
      )}

      {full.chief_complaint && (
        <div className="mini-card" style={{ marginBottom: 10 }}>
          <h4>Chief Complaint</h4>
          <div>{full.chief_complaint}</div>
        </div>
      )}

      {full.diagnoses.length > 0 && (
        <div className="mini-card">
          <h4>Assessment ({full.diagnoses.length})</h4>
          <table className="table" style={{ marginTop: 4 }}>
            <tbody>
              {full.diagnoses.map((d) => (
                <tr key={d.id}>
                  <td style={{ padding: "7px 0", border: "none" }}>{d.description}</td>
                  <td style={{ padding: "7px 0", border: "none", fontWeight: 700, color: "var(--green-700)" }}>{d.icd10_code}</td>
                  <td style={{ padding: "7px 0", border: "none" }}><span className={`badge ${statusBadge(d.status)}`}>{d.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Vital({ k, v, level = "normal" }: { k: string; v: string; level?: VitalLevel }) {
  const cls = vitalClass(level);
  return (
    <div className={`vital ${cls}`} title={level !== "normal" ? vitalLabel(level) : undefined}>
      <div className="v">{v}{level !== "normal" && <span className="vital-flag"> ▲</span>}</div>
      <div className="k">{k}</div>
    </div>
  );
}

function Timeline({ patientId, encounters, canChart }:
  { patientId: number; encounters: EncounterSummary[]; canChart: boolean }) {
  if (encounters.length === 0) {
    return (
      <div className="card card-pad">
        <div className="empty">
          <div className="big">🗓️</div>
          <div style={{ fontWeight: 600 }}>No encounters yet</div>
          {canChart && (
            <Link to={`/patients/${patientId}/encounters/new`} className="btn btn-primary" style={{ marginTop: 12 }}>
              Start first SOAP note
            </Link>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="card">
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr><th>Date</th><th>Type / Reason</th><th>Chief Complaint</th><th>Provider</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {encounters.map((e) => (
              <tr key={e.id} className="row-link" onClick={() => (window.location.href = `/encounters/${e.id}`)}>
                <td className="muted">{formatDateTime(e.created_at)}</td>
                <td style={{ fontWeight: 600 }}>{e.reason || e.encounter_type}</td>
                <td className="muted">{e.chief_complaint?.slice(0, 50) || "—"}</td>
                <td>{e.provider_name}</td>
                <td><span className={`badge ${statusBadge(e.status)}`}>{e.status}</span></td>
                <td><Link to={`/encounters/${e.id}`} className="btn btn-sm">Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
