import { useEffect, useMemo, useState } from "react";
import { api, ApiError, type StaffInput } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ErrorState, Loading, Modal, useToast } from "../components/ui";
import { can } from "../lib/roles";
import { formatDateTime } from "../lib/format";
import type { AuditEntry, Permission, RoleDef, User } from "../types";

type Tab = "users" | "roles" | "audit";

export default function Admin() {
  const { user } = useAuth();
  const tabs = ([
    { key: "users", label: "Users", show: can(user, "user.create", "user.edit") },
    { key: "roles", label: "Roles & Permissions", show: can(user, "role.edit", "role.assign", "permission.view_catalog") },
    { key: "audit", label: "Audit Trail", show: can(user, "audit.view") },
  ] as { key: Tab; label: string; show: boolean }[]).filter((t) => t.show);
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? "users");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Administration</h1>
          <div className="page-sub">Roles &amp; permissions are <strong>data, not code</strong> — configurable without a redeploy.</div>
        </div>
      </div>
      <div className="chart-tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`chart-tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === "users" && <UsersTab />}
      {tab === "roles" && <RolesTab canEdit={can(user, "role.edit")} />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}

// ============================ USERS ============================
function UsersTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  function load() {
    setLoading(true); setError("");
    Promise.all([api.listStaff(), api.listRoles()])
      .then(([u, r]) => { setUsers(u); setRoles(r); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load users"))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);
  if (loading) return <Loading label="Loading users…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="card">
      <div className="card-pad" style={{ paddingBottom: 8 }}>
        <div className="row between">
          <div>
            <h3 style={{ fontSize: 15 }}>Users</h3>
            <div className="muted" style={{ fontSize: 12.5 }}>Create users, assign a role + location scope, and deactivate access.</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>＋ Create User</button>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr><th>Doctor ID</th><th>Name</th><th>Role</th><th>Scope</th><th>Department</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => <UserRow key={u.id} u={u} roles={roles} onChanged={load} />)}
          </tbody>
        </table>
      </div>
      {showAdd && <CreateUserModal roles={roles} onClose={() => setShowAdd(false)} onCreated={load} />}
    </div>
  );
}

function UserRow({ u, roles, onChanged }: { u: User; roles: RoleDef[]; onChanged: () => void }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  async function toggleActive() {
    setBusy(true);
    try {
      const updated = await api.deactivateStaff(u.id);
      notify(updated.is_active ? `${u.full_name} reactivated` : `${u.full_name} deactivated`);
      onChanged();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Failed", "error");
    } finally { setBusy(false); }
  }
  async function changeRole(roleKey: string) {
    setBusy(true);
    try { await api.updateStaff(u.id, { role: roleKey }); notify(`${u.full_name} role updated`); onChanged(); }
    catch (e) { notify(e instanceof ApiError ? e.message : "Failed", "error"); }
    finally { setBusy(false); }
  }

  return (
    <tr style={{ opacity: u.is_active ? 1 : 0.55 }}>
      <td><span className="id-chip">{u.doctor_id}</span></td>
      <td style={{ fontWeight: 600 }}>{u.full_name}{u.credentials ? `, ${u.credentials}` : ""}</td>
      <td>
        <select className="select" style={{ padding: "5px 8px", fontSize: 13 }} value={u.role} disabled={busy}
          onChange={(e) => changeRole(e.target.value)}>
          {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
        </select>
      </td>
      <td><span className="id-chip">{u.scope_level}{u.scope_county ? `: ${u.scope_county}` : ""}</span></td>
      <td className="muted">{u.department || "—"}</td>
      <td>{u.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Disabled</span>}</td>
      <td>
        <button className={`btn btn-sm ${u.is_active ? "btn-danger" : ""}`} disabled={busy} onClick={toggleActive}>
          {u.is_active ? "Deactivate" : "Reactivate"}
        </button>
      </td>
    </tr>
  );
}

const SCOPE_LEVELS = ["Facility", "District", "County", "National"];

function CreateUserModal({ roles, onClose, onCreated }: { roles: RoleDef[]; onClose: () => void; onCreated: () => void }) {
  const { notify } = useToast();
  const [form, setForm] = useState<StaffInput>({
    username: "", full_name: "", email: "", password: "", role: roles[0]?.key ?? "nurse",
    credentials: "", department: "", scope_level: "Facility", scope_county: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<User | null>(null);
  const set = (k: keyof StaffInput, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.full_name || !form.username || !form.email || !form.password) {
      return setError("Name, username, email, and password are required.");
    }
    setBusy(true); setError("");
    try {
      const u = await api.createStaff(form);
      setCreated(u);
      notify(`Created ${u.full_name} · ${u.doctor_id}`);
      onCreated();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create user");
    } finally { setBusy(false); }
  }

  if (created) {
    return (
      <Modal title="User Created" onClose={onClose}
        footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
        <div className="alert alert-green" style={{ marginBottom: 14 }}>
          <span>✅</span>
          <div><strong>{created.full_name}</strong> can now sign in as <code>{created.username}</code> and will see exactly the access their role &amp; scope grant.</div>
        </div>
        <div className="demo-grid">
          <div className="demo-item"><div className="demo-label">Doctor ID</div><div className="demo-value">{created.doctor_id}</div></div>
          <div className="demo-item"><div className="demo-label">Role</div><div className="demo-value">{created.role}</div></div>
          <div className="demo-item"><div className="demo-label">Scope</div><div className="demo-value">{created.scope_level}{created.scope_county ? `: ${created.scope_county}` : ""}</div></div>
          <div className="demo-item"><div className="demo-label">Permissions granted</div><div className="demo-value">{created.permissions.length}</div></div>
          <div className="demo-item"><div className="demo-label">First login</div><div className="demo-value">Must change password</div></div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Create User" onClose={onClose} wide
      footer={<>
        <span className="muted" style={{ marginRight: "auto", fontSize: 12 }}>Access = role permissions ∩ scope</span>
        <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create User"}</button>
      </>}>
      {error && <div className="login-error" style={{ marginBottom: 16 }}>{error}</div>}
      <div className="reg-section">Identity</div>
      <div className="form-grid">
        <div className="field"><label>Full Name *</label><input className="input" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} autoFocus /></div>
        <div className="field"><label>Credentials</label><input className="input" value={form.credentials} onChange={(e) => set("credentials", e.target.value)} placeholder="MD, RN, PharmD…" /></div>
        <div className="field"><label>Username *</label><input className="input" value={form.username} onChange={(e) => set("username", e.target.value)} /></div>
        <div className="field"><label>Email *</label><input className="input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
        <div className="field full"><label>Temporary Password *</label><input className="input" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="User must change on first login" /></div>
      </div>
      <div className="reg-section">Role &amp; Location Scope</div>
      <div className="form-grid">
        <div className="field">
          <label>Role *</label>
          <select className="select" value={form.role} onChange={(e) => set("role", e.target.value)}>
            {roles.map((r) => <option key={r.key} value={r.key}>{r.name} ({r.permissions.length} perms)</option>)}
          </select>
        </div>
        <div className="field"><label>Department</label><input className="input" value={form.department} onChange={(e) => set("department", e.target.value)} placeholder="e.g. Ward A" /></div>
        <div className="field">
          <label>Scope Level *</label>
          <select className="select" value={form.scope_level} onChange={(e) => set("scope_level", e.target.value)}>
            {SCOPE_LEVELS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="field"><label>County (if county-scoped)</label><input className="input" value={form.scope_county} onChange={(e) => set("scope_county", e.target.value)} placeholder="e.g. Montserrado" /></div>
      </div>
    </Modal>
  );
}

// ============================ ROLES ============================
function RolesTab({ canEdit }: { canEdit: boolean }) {
  const { notify } = useToast();
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [perms, setPerms] = useState<Permission[]>([]);
  const [sel, setSel] = useState<RoleDef | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true); setError("");
    Promise.all([api.listRoles(), api.listPermissions()])
      .then(([r, p]) => {
        setRoles(r); setPerms(p);
        setSel((cur) => r.find((x) => x.id === cur?.id) ?? r[0] ?? null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load roles"))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);
  useEffect(() => { if (sel) setDraft(new Set(sel.permissions)); }, [sel?.id, roles]);

  const byDomain = useMemo(() => {
    const m: Record<string, Permission[]> = {};
    for (const p of perms) (m[p.domain] ??= []).push(p);
    return m;
  }, [perms]);

  if (loading) return <Loading label="Loading roles…" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const dirty = sel && JSON.stringify([...draft].sort()) !== JSON.stringify([...sel.permissions].sort());
  function toggle(code: string) {
    setDraft((d) => { const n = new Set(d); n.has(code) ? n.delete(code) : n.add(code); return n; });
  }
  async function save() {
    if (!sel) return;
    setBusy(true);
    try {
      await api.updateRole(sel.id, { permissions: [...draft] });
      notify(`${sel.name} permissions saved — effective immediately`);
      load();
    } catch (e) { notify(e instanceof ApiError ? e.message : "Failed", "error"); }
    finally { setBusy(false); }
  }

  return (
    <div className="two-col">
      <div className="card card-pad">
        <div className="section-title" style={{ marginBottom: 10 }}>Roles</div>
        <div className="stack" style={{ gap: 4 }}>
          {roles.map((r) => (
            <button key={r.id} className={`role-item${sel?.id === r.id ? " active" : ""}`} onClick={() => setSel(r)}>
              <div style={{ fontWeight: 600 }}>{r.name}</div>
              <div className="sub muted">{r.key} · {r.permissions.length} permissions{r.is_system ? " · system" : ""}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card card-pad">
        {sel && (
          <>
            <div className="row between" style={{ marginBottom: 12 }}>
              <div>
                <h3 style={{ fontSize: 16 }}>{sel.name}</h3>
                <div className="muted" style={{ fontSize: 12.5 }}>{draft.size} of {perms.length} permissions granted</div>
              </div>
              {canEdit && (
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-sm" disabled={!dirty || busy} onClick={() => setDraft(new Set(sel.permissions))}>Reset</button>
                  <button className="btn btn-primary btn-sm" disabled={!dirty || busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
                </div>
              )}
            </div>
            {Object.entries(byDomain).map(([domain, list]) => (
              <div key={domain} style={{ marginBottom: 14 }}>
                <div className="perm-domain">{domain}</div>
                <div className="perm-grid">
                  {list.map((p) => (
                    <label key={p.code} className={`perm-item${draft.has(p.code) ? " on" : ""}`} title={p.description}>
                      <input type="checkbox" checked={draft.has(p.code)} disabled={!canEdit}
                        onChange={() => toggle(p.code)} />
                      <span>{p.code}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ============================ AUDIT ============================
function AuditTab() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fUser, setFUser] = useState("");
  const [fAction, setFAction] = useState("");

  function load() {
    setLoading(true); setError("");
    api.auditLog({ user: fUser || undefined, action: fAction || undefined })
      .then(setRows)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load audit"))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  return (
    <div className="card">
      <div className="card-pad" style={{ paddingBottom: 12 }}>
        <div className="filter-bar">
          <div className="filter-fields">
            <div className="field"><label>User</label><input className="input" value={fUser} onChange={(e) => setFUser(e.target.value)} placeholder="username" /></div>
            <div className="field"><label>Action</label><input className="input" value={fAction} onChange={(e) => setFAction(e.target.value)} placeholder="e.g. view_clinical, transfer" /></div>
          </div>
          <div className="filter-actions">
            <button className="btn btn-primary btn-sm" onClick={load}>▶ Run</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setFUser(""); setFAction(""); setTimeout(load, 0); }}>Clear</button>
          </div>
        </div>
      </div>
      {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={load} /> : (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr><th>Time</th><th>User</th><th>Role</th><th>Scope</th><th>Action</th><th>Patient</th><th>Decision</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} className="muted">No audit entries.</td></tr>}
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{formatDateTime(a.timestamp)}</td>
                  <td style={{ fontWeight: 600 }}>{a.username}</td>
                  <td>{a.role}</td>
                  <td className="muted">{a.scope}</td>
                  <td><span className="chip" style={{ fontSize: 11.5 }}>{a.action}</span></td>
                  <td>{a.patient_name || (a.patient_id ? `#${a.patient_id}` : "—")}</td>
                  <td>{a.decision === "deny"
                    ? <span className="badge badge-red">deny</span>
                    : <span className="badge badge-green">allow</span>}</td>
                  <td className="muted" style={{ maxWidth: 260 }}>{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
