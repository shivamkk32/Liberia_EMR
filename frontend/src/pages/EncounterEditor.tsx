import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type EncounterInput } from "../api/client";
import { ErrorState, Loading, useToast } from "../components/ui";
import { formatDateTime, statusBadge } from "../lib/format";
import { flagVital, isAbnormal, medAllergyConflict, vitalClass, vitalLabel } from "../lib/clinicalSafety";
import type { Allergy, Diagnosis, Encounter, Icd10Item, Medication, Order, Patient } from "../types";

const MED_FREQ = ["QD", "BID", "TID", "QID", "HS", "PRN", "Q6H", "Q8H", "Weekly"];
const ORDER_TYPES = ["Lab", "Imaging", "Referral", "Procedure"];

type Draft = {
  reason: string;
  chief_complaint: string;
  history_present_illness: string;
  review_of_systems: string;
  physical_exam: string;
  patient_instructions: string;
  follow_up: string;
  bp_systolic: string; bp_diastolic: string; heart_rate: string; resp_rate: string;
  temperature_f: string; spo2: string; weight_kg: string; height_cm: string; pain_score: string;
  diagnoses: Diagnosis[];
  orders: Order[];
  medications: Partial<Medication>[];
};

const EMPTY_DRAFT: Draft = {
  reason: "", chief_complaint: "", history_present_illness: "", review_of_systems: "",
  physical_exam: "", patient_instructions: "", follow_up: "",
  bp_systolic: "", bp_diastolic: "", heart_rate: "", resp_rate: "",
  temperature_f: "", spo2: "", weight_kg: "", height_cm: "", pain_score: "",
  diagnoses: [], orders: [], medications: [],
};

function num(s: string): number | null {
  if (s === "" || s == null) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

export default function EncounterEditor() {
  const { patientId: patientParam, encounterId: encParam } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isNew = !encParam;
  const readOnly = encounter?.status === "signed";

  useEffect(() => {
    setLoading(true);
    setError("");
    const work = isNew
      ? api.getPatient(Number(patientParam)).then((p) => { setPatient(p); })
      : api.getEncounter(Number(encParam)).then(async (e) => {
          setEncounter(e);
          setDraft(fromEncounter(e));
          const p = await api.getPatient(e.patient_id);
          setPatient(p);
        });
    work
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load encounter"))
      .finally(() => setLoading(false));
  }, [patientParam, encParam]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function toInput(): EncounterInput {
    return {
      patient_id: patient!.id,
      reason: draft.reason,
      chief_complaint: draft.chief_complaint,
      history_present_illness: draft.history_present_illness,
      review_of_systems: draft.review_of_systems,
      physical_exam: draft.physical_exam,
      patient_instructions: draft.patient_instructions,
      follow_up: draft.follow_up,
      bp_systolic: num(draft.bp_systolic), bp_diastolic: num(draft.bp_diastolic),
      heart_rate: num(draft.heart_rate), resp_rate: num(draft.resp_rate),
      temperature_f: num(draft.temperature_f), spo2: num(draft.spo2),
      weight_kg: num(draft.weight_kg), height_cm: num(draft.height_cm),
      pain_score: num(draft.pain_score),
      diagnoses: draft.diagnoses,
      orders: draft.orders,
      medications: draft.medications,
    };
  }

  async function save(): Promise<Encounter | null> {
    if (!patient) return null;
    setSaving(true);
    setError("");
    try {
      const saved = isNew
        ? await api.createEncounter(toInput())
        : await api.updateEncounter(encounter!.id, toInput());
      setEncounter(saved);
      setDraft(fromEncounter(saved));
      if (isNew) navigate(`/encounters/${saved.id}`, { replace: true });
      notify("Encounter saved as draft");
      return saved;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save");
      notify(e instanceof ApiError ? e.message : "Failed to save", "error");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function sign() {
    const saved = isNew ? await save() : await save();
    if (!saved) return;
    if (saved.diagnoses.length === 0) {
      notify("Add at least one diagnosis before signing", "error");
      return;
    }
    setSaving(true);
    try {
      const signed = await api.signEncounter(saved.id);
      setEncounter(signed);
      setDraft(fromEncounter(signed));
      notify("Encounter signed ✓");
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Failed to sign", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading label="Loading encounter…" />;
  if (error && !patient) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (!patient) return <ErrorState message="Patient not found" />;

  return (
    <div>
      {/* Toolbar */}
      <div className="editor-toolbar">
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>
            {patient.first_name} {patient.last_name}
            <span className="muted" style={{ fontWeight: 400 }}> · MRN {patient.mrn}</span>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            <span className="badge badge-blue">Office Visit (SOAP)</span>
            {encounter && <span className={`badge ${statusBadge(encounter.status)}`}>{encounter.status}</span>}
            {encounter?.signed_at && <span className="muted">Signed {formatDateTime(encounter.signed_at)}</span>}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={() => navigate(`/patients/${patient.id}`)}>Close</button>
          {!readOnly && (
            <>
              <button className="btn" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save Draft"}
              </button>
              <button className="btn btn-primary" onClick={sign} disabled={saving}>Sign &amp; Save</button>
            </>
          )}
        </div>
      </div>

      {patient.allergies.filter((a) => a.status === "Active").length > 0 && (
        <div className="alert alert-red" style={{ marginBottom: 16 }}>
          <span>⚠️</span>
          <div><strong>Allergies:</strong>{" "}
            {patient.allergies.filter((a) => a.status === "Active")
              .map((a) => `${a.substance} (${a.severity})`).join(", ")}</div>
        </div>
      )}

      {readOnly && (
        <div className="alert alert-green" style={{ marginBottom: 16 }}>
          <span>🔒</span>
          <div>This encounter is <strong>signed and locked</strong>. Signed notes are immutable; create a new encounter to amend.</div>
        </div>
      )}

      {/* Reason */}
      <div className="editor-section card card-pad">
        <div className="field">
          <label>Visit Reason</label>
          <input className="input" value={draft.reason} disabled={readOnly}
            onChange={(e) => update("reason", e.target.value)}
            placeholder="e.g. Follow-up Visit, Annual Physical" />
        </div>
      </div>

      {/* S */}
      <Section letter="S" title="Subjective" sub="Patient-reported information">
        <TextField label="Chief Complaint" value={draft.chief_complaint} readOnly={readOnly}
          onChange={(v) => update("chief_complaint", v)} placeholder="Primary reason for the visit…" />
        <TextField label="History of Present Illness" value={draft.history_present_illness} readOnly={readOnly}
          onChange={(v) => update("history_present_illness", v)} rows={3} />
        <TextField label="Review of Systems" value={draft.review_of_systems} readOnly={readOnly}
          onChange={(v) => update("review_of_systems", v)} rows={2} />
      </Section>

      {/* O */}
      <Section letter="O" title="Objective" sub="Clinical findings and measurable data">
        <label className="section-title" style={{ display: "block", marginBottom: 10 }}>Vitals</label>
        <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
          <VitalInput label="BP Systolic" vkey="bp_systolic" value={draft.bp_systolic} readOnly={readOnly} onChange={(v) => update("bp_systolic", v)} />
          <VitalInput label="BP Diastolic" vkey="bp_diastolic" value={draft.bp_diastolic} readOnly={readOnly} onChange={(v) => update("bp_diastolic", v)} />
          <VitalInput label="Heart Rate" vkey="heart_rate" value={draft.heart_rate} readOnly={readOnly} onChange={(v) => update("heart_rate", v)} />
          <VitalInput label="Resp Rate" vkey="resp_rate" value={draft.resp_rate} readOnly={readOnly} onChange={(v) => update("resp_rate", v)} />
          <VitalInput label="Temp °F" vkey="temperature_f" value={draft.temperature_f} readOnly={readOnly} onChange={(v) => update("temperature_f", v)} />
          <VitalInput label="SpO₂ %" vkey="spo2" value={draft.spo2} readOnly={readOnly} onChange={(v) => update("spo2", v)} />
          <VitalInput label="Weight kg" vkey="weight_kg" value={draft.weight_kg} readOnly={readOnly} onChange={(v) => update("weight_kg", v)} />
          <VitalInput label="Height cm" vkey="height_cm" value={draft.height_cm} readOnly={readOnly} onChange={(v) => update("height_cm", v)} />
          <VitalInput label="Pain 0–10" vkey="pain_score" value={draft.pain_score} readOnly={readOnly} onChange={(v) => update("pain_score", v)} />
        </div>
        <div style={{ marginTop: 14 }}>
          <TextField label="Physical Exam" value={draft.physical_exam} readOnly={readOnly}
            onChange={(v) => update("physical_exam", v)} rows={3} />
        </div>
      </Section>

      {/* A */}
      <Section letter="A" title="Assessment" sub="Diagnoses (ICD-10)">
        <DiagnosisEditor value={draft.diagnoses} readOnly={readOnly} onChange={(v) => update("diagnoses", v)} />
      </Section>

      {/* P */}
      <Section letter="P" title="Plan" sub="Medications, orders, and instructions">
        <label className="section-title" style={{ display: "block", marginBottom: 8 }}>Medications</label>
        <MedicationEditor value={draft.medications} readOnly={readOnly} allergies={patient.allergies}
          onChange={(v) => update("medications", v)} />
        <div className="divider" />
        <label className="section-title" style={{ display: "block", marginBottom: 8 }}>Orders</label>
        <OrderEditor value={draft.orders} readOnly={readOnly} onChange={(v) => update("orders", v)} />
        <div className="divider" />
        <TextField label="Patient Instructions" value={draft.patient_instructions} readOnly={readOnly}
          onChange={(v) => update("patient_instructions", v)} rows={2} />
        <TextField label="Follow-up" value={draft.follow_up} readOnly={readOnly}
          onChange={(v) => update("follow_up", v)} placeholder="e.g. Return in 2 weeks" />
      </Section>

      {error && <div className="login-error" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  );
}

function fromEncounter(e: Encounter): Draft {
  const s = (n: number | null | undefined) => (n == null ? "" : String(n));
  return {
    reason: e.reason ?? "",
    chief_complaint: e.chief_complaint ?? "",
    history_present_illness: e.history_present_illness ?? "",
    review_of_systems: e.review_of_systems ?? "",
    physical_exam: e.physical_exam ?? "",
    patient_instructions: e.patient_instructions ?? "",
    follow_up: e.follow_up ?? "",
    bp_systolic: s(e.bp_systolic), bp_diastolic: s(e.bp_diastolic), heart_rate: s(e.heart_rate),
    resp_rate: s(e.resp_rate), temperature_f: s(e.temperature_f), spo2: s(e.spo2),
    weight_kg: s(e.weight_kg), height_cm: s(e.height_cm), pain_score: s(e.pain_score),
    diagnoses: e.diagnoses.map((d) => ({ ...d })),
    orders: e.orders.map((o) => ({ ...o })),
    medications: e.medications.map((m) => ({ ...m })),
  };
}

// --- Building blocks ---
function Section({ letter, title, sub, children }: {
  letter: "S" | "O" | "A" | "P"; title: string; sub: string; children: React.ReactNode;
}) {
  return (
    <div className="editor-section card">
      <div className="card-pad">
        <div className="soap-head">
          <div className={`soap-letter soap-${letter}`}>{letter}</div>
          <div><div className="t">{title}</div><div className="s">{sub}</div></div>
        </div>
        {children}
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, readOnly, rows = 2, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; readOnly?: boolean; rows?: number; placeholder?: string;
}) {
  return (
    <div className="field" style={{ marginBottom: 12 }}>
      <label>{label}</label>
      <textarea className="textarea" value={value} disabled={readOnly} rows={rows}
        placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function VitalInput({ label, vkey, value, onChange, readOnly }: {
  label: string; vkey: string; value: string; onChange: (v: string) => void; readOnly?: boolean;
}) {
  const level = flagVital(vkey, value === "" ? null : Number(value));
  const abn = isAbnormal(level);
  const warnClass = level === "critical" ? "input-crit" : level === "low" ? "input-low" : "input-warn";
  return (
    <div className="field">
      <label className="row between" style={{ gap: 4 }}>
        <span>{label}</span>
        {abn && <span className={`vital-tag tag-${vitalClass(level)}`}>{vitalLabel(level)}</span>}
      </label>
      <input className={`input ${abn ? warnClass : ""}`} value={value} disabled={readOnly}
        inputMode="decimal" onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

// --- Assessment (ICD-10 typeahead) ---
function DiagnosisEditor({ value, onChange, readOnly }: {
  value: Diagnosis[]; onChange: (v: Diagnosis[]) => void; readOnly?: boolean;
}) {
  function add(item?: Icd10Item) {
    onChange([...value, {
      description: item?.description ?? "", icd10_code: item?.code ?? "",
      status: "Active", onset_date: null,
    }]);
  }
  function set(i: number, patch: Partial<Diagnosis>) {
    onChange(value.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }
  function remove(i: number) { onChange(value.filter((_, idx) => idx !== i)); }

  return (
    <div>
      {value.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div className="dx-row" style={{ borderBottom: "1px solid var(--line)", fontWeight: 700 }}>
            <span className="section-title">Diagnosis</span>
            <span className="section-title">ICD-10</span>
            <span className="section-title">Status</span>
            <span />
          </div>
          {value.map((d, i) => (
            <div className="dx-row" key={i}>
              <input className="input" value={d.description} disabled={readOnly}
                onChange={(e) => set(i, { description: e.target.value })} placeholder="Diagnosis" />
              <input className="input" value={d.icd10_code} disabled={readOnly}
                onChange={(e) => set(i, { icd10_code: e.target.value })} placeholder="Code" />
              <select className="select" value={d.status} disabled={readOnly}
                onChange={(e) => set(i, { status: e.target.value })}>
                <option>Active</option><option>Chronic</option><option>Resolved</option>
              </select>
              {!readOnly && <button className="icon-btn" onClick={() => remove(i)} title="Remove">🗑</button>}
            </div>
          ))}
        </div>
      )}
      {!readOnly && <Icd10Typeahead onPick={add} onManual={() => add()} />}
      {value.length === 0 && readOnly && <div className="muted">No diagnoses documented.</div>}
    </div>
  );
}

function Icd10Typeahead({ onPick, onManual }: { onPick: (i: Icd10Item) => void; onManual: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Icd10Item[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      api.searchIcd10(q).then((r) => { setResults(r); setOpen(true); }).catch(() => setResults([]));
    }, 220);
    return () => window.clearTimeout(timer.current);
  }, [q]);

  return (
    <div className="line-add">
      <div className="typeahead" style={{ flex: 1, minWidth: 260 }}>
        <input className="input" value={q} placeholder="🔍 Search ICD-10 by code or description…"
          onChange={(e) => setQ(e.target.value)} onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)} />
        {open && results.length > 0 && (
          <div className="typeahead-list">
            {results.map((r) => (
              <button key={r.code} onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onPick(r); setQ(""); setResults([]); setOpen(false); }}>
                <span className="code">{r.code}</span>{r.description}
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="btn btn-sm" onClick={onManual}>＋ Add blank</button>
    </div>
  );
}

// --- Medications (with real-time allergy checking) ---
function MedicationEditor({ value, onChange, readOnly, allergies = [] }: {
  value: Partial<Medication>[]; onChange: (v: Partial<Medication>[]) => void;
  readOnly?: boolean; allergies?: Allergy[];
}) {
  function add() {
    onChange([...value, { name: "", dose: "", form: "Tablet", route: "Oral", frequency: "QD", status: "Active" }]);
  }
  function set(i: number, patch: Partial<Medication>) {
    onChange(value.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }
  function remove(i: number) { onChange(value.filter((_, idx) => idx !== i)); }

  const conflicts = value
    .map((m) => ({ name: m.name ?? "", conflict: medAllergyConflict(m.name ?? "", allergies) }))
    .filter((c) => c.conflict);

  return (
    <div>
      {conflicts.length > 0 && (
        <div className="alert alert-red" style={{ marginBottom: 10 }}>
          <span>⚠️</span>
          <div>
            <strong>Allergy alert:</strong>{" "}
            {conflicts.map((c) => `"${c.name}" conflicts with the patient's ${c.conflict} allergy`).join("; ")}.
            Review before signing.
          </div>
        </div>
      )}
      {value.map((m, i) => {
        const conflict = medAllergyConflict(m.name ?? "", allergies);
        return (
          <div className="med-row" key={i}>
            <input className={`input ${conflict ? "input-crit" : ""}`} value={m.name ?? ""} disabled={readOnly}
              title={conflict ? `Allergy conflict: ${conflict}` : undefined}
              onChange={(e) => set(i, { name: e.target.value })} placeholder="Medication name" />
            <input className="input" value={m.dose ?? ""} disabled={readOnly}
              onChange={(e) => set(i, { dose: e.target.value })} placeholder="Dose" />
            <input className="input" value={m.form ?? ""} disabled={readOnly}
              onChange={(e) => set(i, { form: e.target.value })} placeholder="Form" />
            <select className="select" value={m.frequency ?? "QD"} disabled={readOnly}
              onChange={(e) => set(i, { frequency: e.target.value })}>
              {MED_FREQ.map((f) => <option key={f}>{f}</option>)}
            </select>
            {!readOnly && <button className="icon-btn" onClick={() => remove(i)} title="Remove">🗑</button>}
          </div>
        );
      })}
      {!readOnly && <div className="line-add"><button className="btn btn-sm" onClick={add}>＋ Add medication</button></div>}
      {value.length === 0 && readOnly && <div className="muted">No medications prescribed.</div>}
    </div>
  );
}

// --- Orders ---
function OrderEditor({ value, onChange, readOnly }: {
  value: Order[]; onChange: (v: Order[]) => void; readOnly?: boolean;
}) {
  function add() { onChange([...value, { order_type: "Lab", description: "", status: "Ordered" }]); }
  function set(i: number, patch: Partial<Order>) {
    onChange(value.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }
  function remove(i: number) { onChange(value.filter((_, idx) => idx !== i)); }

  return (
    <div>
      {value.map((o, i) => (
        <div className="order-row" key={i}>
          <select className="select" value={o.order_type} disabled={readOnly}
            onChange={(e) => set(i, { order_type: e.target.value })}>
            {ORDER_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <input className="input" value={o.description} disabled={readOnly}
            onChange={(e) => set(i, { description: e.target.value })} placeholder="Order description" />
          {!readOnly && <button className="icon-btn" onClick={() => remove(i)} title="Remove">🗑</button>}
        </div>
      ))}
      {!readOnly && <div className="line-add"><button className="btn btn-sm" onClick={add}>＋ Add order</button></div>}
      {value.length === 0 && readOnly && <div className="muted">No orders placed.</div>}
    </div>
  );
}
