import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import EagisLogo from "../components/EagisLogo";
import LiberiaMap from "../components/LiberiaMap";
import { LIBERIA_COUNTIES, getRegion, setRegion } from "../lib/regions";

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [region, setRegionState] = useState(getRegion() || "Montserrado");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!region) {
      setError("Please select your county / region.");
      return;
    }
    setBusy(true);
    try {
      setRegion(region);
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-split">
        <div className="login-map-panel">
          <div className="map-panel-head">
            <div className="map-title">Republic of Liberia</div>
            <div className="map-sub">National EMR/EHR · 15-County Deployment</div>
          </div>
          <LiberiaMap selected={region} onSelect={setRegionState} />
          <div className="map-foot">Select your county to sign in — your facility scope is set from it.</div>
        </div>
        <div className="login-card">
        <div className="login-secbar">
          <span><i>🩺</i>CLINICAL</span>
          <span><i>💊</i>PHARMACY</span>
          <span><i>🔬</i>LABORATORY</span>
          <span><i>💉</i>IMMUNIZATION</span>
        </div>
        <div className="login-body">
          <div className="login-badge"><EagisLogo size={40} /></div>
          <h1 className="login-title">National EMR/EHR Platform</h1>
          <p className="login-poweredby">powered by{" "}
            <a className="brand-link" href="https://francordsoft.com/" target="_blank" rel="noreferrer">Francordsoft</a>
          </p>
          <p className="login-sub">Secure access for healthcare workers across all connected counties</p>

          {error && <div className="login-error">{error}</div>}

          <form onSubmit={onSubmit} className="stack">
            <div className="field">
              <label>Username / Email</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                autoFocus
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
              />
            </div>
            <div className="field">
              <label>County / Region</label>
              <select
                className="select"
                value={region}
                onChange={(e) => setRegionState(e.target.value)}
              >
                <option value="">Select your county…</option>
                {LIBERIA_COUNTIES.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} — {c.capital}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary btn-block" disabled={busy} type="submit">
              {busy ? "Signing in…" : "→ Sign In Securely"}
            </button>
          </form>
        </div>
        </div>
      </div>
    </div>
  );
}
