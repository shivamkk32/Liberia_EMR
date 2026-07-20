import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Empty, ErrorState, Loading, Modal, useToast } from "../components/ui";
import { age, formatDate, initials } from "../lib/format";
import { canRegister } from "../lib/roles";
import { LIBERIA_COUNTIES, getRegion } from "../lib/regions";
import type { Patient, PatientSummary } from "../types";

export default function Patients() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const [rows, setRows] = useState<PatientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showReg, setShowReg] = useState(false);
  const { user } = useAuth();

  function load() {
    setLoading(true);
    setError("");
    api
      .listPatients(q)
      .then(setRows)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load patients"))
      .finally(() => setLoading(false));
  }
  useEffect(load, [q]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Patients</h1>
          <div className="page-sub">Master Patient Index — search, register, and open charts.</div>
        </div>
        {canRegister(user?.role) && (
          <button className="btn btn-primary" onClick={() => setShowReg(true)}>＋ Register Patient</button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad" style={{ paddingBottom: 12 }}>
          <SearchBox initial={q} onSearch={(v) => setParams(v ? { q: v } : {})} />
        </div>
      </div>

      <div className="card">
        {loading ? (
          <Loading label="Loading patients…" />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : rows.length === 0 ? (
          <Empty icon="🔎" title={q ? `No patients match "${q}"` : "No patients yet"}
            hint={q ? "Try a different name, MRN, or phone." : "Register your first patient to get started."} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Patient</th><th>MRN</th><th>Age / Sex</th><th>Phone</th>
                  <th>Insurance</th><th>Portal</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <PatientRow key={p.id} p={p} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showReg && <RegisterModal onClose={() => setShowReg(false)} onCreated={load} />}
    </div>
  );
}

function SearchBox({ initial, onSearch }: { initial: string; onSearch: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  return (
    <form
      className="row"
      onSubmit={(e) => { e.preventDefault(); onSearch(value.trim()); }}
    >
      <div className="topbar-search" style={{ maxWidth: 460 }}>
        <span className="search-ico">🔍</span>
        <input placeholder="Search by name, MRN, or phone…" value={value}
          onChange={(e) => setValue(e.target.value)} />
      </div>
      <button className="btn btn-primary btn-sm" type="submit">Search</button>
      {initial && <button className="btn btn-sm" type="button" onClick={() => onSearch("")}>Clear</button>}
    </form>
  );
}

function PatientRow({ p }: { p: PatientSummary }) {
  const navigate = useNavigate();
  return (
    <tr className="row-link" onClick={() => navigate(`/patients/${p.id}`)}>
      <td>
        <div className="row" style={{ gap: 11 }}>
          <div className="avatar">{initials(p.first_name, p.last_name)}</div>
          <div>
            <div style={{ fontWeight: 700 }}>{p.first_name} {p.last_name}</div>
            <div className="sub muted">DOB {formatDate(p.date_of_birth)}</div>
          </div>
        </div>
      </td>
      <td style={{ fontVariantNumeric: "tabular-nums" }}>{p.mrn}</td>
      <td>{age(p.date_of_birth)} · {p.sex}</td>
      <td>{p.phone || "—"}</td>
      <td>{p.insurance_provider || "—"}</td>
      <td>
        {p.portal_enrolled
          ? <span className="badge badge-green">Enrolled</span>
          : <span className="badge badge-gray">No</span>}
      </td>
    </tr>
  );
}

// --- Detailed registration modal ---
const EMPTY: Record<string, unknown> = {
  title: "", first_name: "", middle_name: "", last_name: "", date_of_birth: "", sex: "Male",
  national_id: "", marital_status: "", blood_group: "", nationality: "Liberian",
  occupation: "", religion: "", disability: "", language: "English",
  phone: "", alt_phone: "", email: "", address: "", town: "", district: "", county: getRegion() || "",
  next_of_kin_name: "", next_of_kin_relationship: "", next_of_kin_phone: "",
  insurance_provider: "", insurance_id: "", insurance_scheme: "", portal_enrolled: false,
};

function RegisterModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<Record<string, unknown>>({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { notify } = useToast();
  const navigate = useNavigate();

  const set = (field: string, value: unknown) => setForm((f) => ({ ...f, [field]: value }));
  const T = (field: string) => (form[field] as string) ?? "";

  async function submit() {
    if (!form.first_name || !form.last_name || !form.date_of_birth || !form.sex) {
      setError("First name, last name, date of birth and sex are required.");
      return;
    }
    if (!form.phone) {
      setError("A primary phone number is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created: Patient = await api.createPatient(form as Partial<Patient>);
      notify(`Registered ${created.first_name} ${created.last_name} · MRN ${created.mrn}`);
      onCreated();
      onClose();
      navigate(`/patients/${created.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to register patient");
    } finally {
      setBusy(false);
    }
  }

  const Text = (field: string, label: string, opts: { req?: boolean; full?: boolean; type?: string; placeholder?: string } = {}) => (
    <div className={`field${opts.full ? " full" : ""}`}>
      <label>{label}{opts.req ? " *" : ""}</label>
      <input className="input" type={opts.type ?? "text"} value={T(field)} placeholder={opts.placeholder}
        onChange={(e) => set(field, e.target.value)} />
    </div>
  );

  return (
    <Modal
      title="Register New Patient"
      onClose={onClose}
      wide
      footer={
        <>
          <span className="muted" style={{ marginRight: "auto", fontSize: 12 }}>* required · MRN &amp; PRN auto-assigned</span>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? "Registering…" : "Register Patient"}
          </button>
        </>
      }
    >
      {error && <div className="login-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="reg-section">Identity &amp; Demographics</div>
      <div className="form-grid">
        <div className="field">
          <label>Title</label>
          <select className="select" value={T("title")} onChange={(e) => set("title", e.target.value)}>
            <option value="">—</option><option>Mr</option><option>Mrs</option><option>Ms</option>
            <option>Master</option><option>Baby</option><option>Dr</option>
          </select>
        </div>
        {Text("first_name", "First Name", { req: true })}
        {Text("middle_name", "Middle Name")}
        {Text("last_name", "Last Name", { req: true })}
        {Text("date_of_birth", "Date of Birth", { req: true, type: "date" })}
        <div className="field">
          <label>Sex *</label>
          <select className="select" value={T("sex")} onChange={(e) => set("sex", e.target.value)}>
            <option>Male</option><option>Female</option><option>Other</option>
          </select>
        </div>
        {Text("national_id", "National ID / Passport")}
        <div className="field">
          <label>Marital Status</label>
          <select className="select" value={T("marital_status")} onChange={(e) => set("marital_status", e.target.value)}>
            <option value="">—</option><option>Single</option><option>Married</option>
            <option>Divorced</option><option>Widowed</option>
          </select>
        </div>
        <div className="field">
          <label>Blood Group</label>
          <select className="select" value={T("blood_group")} onChange={(e) => set("blood_group", e.target.value)}>
            <option value="">—</option>{["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((b) => <option key={b}>{b}</option>)}
          </select>
        </div>
        {Text("nationality", "Nationality")}
        {Text("occupation", "Occupation")}
        {Text("religion", "Religion")}
        {Text("language", "Preferred Language")}
        {Text("disability", "Disability (if any)", { full: true, placeholder: "None" })}
      </div>

      <div className="reg-section">Contact &amp; Address</div>
      <div className="form-grid">
        {Text("phone", "Primary Phone", { req: true })}
        {Text("alt_phone", "Alternate Phone")}
        {Text("email", "Email")}
        <div className="field">
          <label>County / Region</label>
          <select className="select" value={T("county")} onChange={(e) => set("county", e.target.value)}>
            <option value="">—</option>
            {LIBERIA_COUNTIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        {Text("district", "District")}
        {Text("town", "Town / Community")}
        {Text("address", "Residential Address", { full: true })}
      </div>

      <div className="reg-section">Next of Kin / Emergency Contact</div>
      <div className="form-grid">
        {Text("next_of_kin_name", "Full Name")}
        <div className="field">
          <label>Relationship</label>
          <select className="select" value={T("next_of_kin_relationship")} onChange={(e) => set("next_of_kin_relationship", e.target.value)}>
            <option value="">—</option><option>Spouse</option><option>Parent</option><option>Child</option>
            <option>Sibling</option><option>Guardian</option><option>Friend</option><option>Other</option>
          </select>
        </div>
        {Text("next_of_kin_phone", "Contact Phone")}
      </div>

      <div className="reg-section">Insurance &amp; Enrollment</div>
      <div className="form-grid">
        {Text("insurance_provider", "Insurance Provider")}
        {Text("insurance_id", "Insurance / Member ID")}
        {Text("insurance_scheme", "Scheme")}
        <div className="field full">
          <label className="row" style={{ textTransform: "none", cursor: "pointer" }}>
            <input type="checkbox" checked={form.portal_enrolled as boolean}
              onChange={(e) => set("portal_enrolled", e.target.checked)} />
            &nbsp;Enroll in patient portal
          </label>
        </div>
      </div>
    </Modal>
  );
}
