import { useAuth } from "../auth/AuthContext";
import { roleTitle } from "../lib/roles";
import { getRegion } from "../lib/regions";

export default function Settings() {
  const { user } = useAuth();
  if (!user) return null;

  const profile: [string, string][] = [
    ["Full Name", `${user.full_name}${user.credentials ? ", " + user.credentials : ""}`],
    ["Staff / Doctor ID", user.doctor_id],
    ["Username", user.username],
    ["Role", roleTitle(user.role)],
    ["Department", user.department || "—"],
    ["Location Scope", `${user.scope_level}${user.scope_county ? ": " + user.scope_county : ""}`],
    ["Email", user.email],
    ["Facility", `Facility #${user.facility_id ?? "—"}`],
    ["County / Region", getRegion() || "—"],
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Settings</h1>
          <div className="page-sub">Your profile, access, and application information.</div>
        </div>
      </div>

      <div className="two-col">
        <div className="card card-pad">
          <div className="section-title" style={{ marginBottom: 12 }}>My Profile</div>
          <div className="stack" style={{ gap: 10 }}>
            {profile.map(([k, v]) => (
              <div className="row between" key={k} style={{ borderBottom: "1px solid var(--line-soft)", paddingBottom: 8 }}>
                <span className="muted">{k}</span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          <div className="card card-pad">
            <div className="section-title" style={{ marginBottom: 12 }}>My Permissions</div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
              {user.permissions.length} effective permissions from your role. Access is enforced server-side.
            </div>
            <div className="perm-grid">
              {user.permissions.map((p) => (
                <span key={p} className="perm-item on" style={{ cursor: "default" }}>{p}</span>
              ))}
            </div>
          </div>
          <div className="card card-pad">
            <div className="section-title" style={{ marginBottom: 10 }}>About</div>
            <div style={{ fontSize: 13 }}>
              <div><strong>National EMR/EHR Platform</strong> · MVP1</div>
              <div className="muted" style={{ marginTop: 4 }}>powered by{" "}
                <a className="brand-link" href="https://francordsoft.com/" target="_blank" rel="noreferrer">Francordsoft LLC</a></div>
              <div className="muted" style={{ marginTop: 8 }}>
                Standards: FHIR R4 · ICD-10 · RBAC with location scope &amp; audit
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
