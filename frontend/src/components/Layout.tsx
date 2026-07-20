import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { initials, roleLabel } from "../lib/format";
import { getRegion } from "../lib/regions";
import { can } from "../lib/roles";
import EagisLogo from "./EagisLogo";
import type { User } from "../types";

// Nav is generated from the user's effective permissions (UI-02). An item with
// no `perm` is always shown; otherwise it renders only if a permission is held.
const NAV: { to: string; label: string; icon: string; end?: boolean; perm?: string[] }[] = [
  { to: "/", label: "Dashboard", icon: "▦", end: true },
  { to: "/patients", label: "Patients", icon: "👥", perm: ["patient.view_demographics"] },
  { to: "/schedule", label: "Schedule", icon: "📅", perm: ["appointment.view", "appointment.book"] },
  { to: "/tasks", label: "Tasks", icon: "✔" },
  { to: "/reports", label: "Reports", icon: "📊", perm: ["report.facility.view", "report.national.view"] },
  { to: "/admin", label: "Administration", icon: "🛡", perm: ["user.create", "user.edit", "role.edit", "role.assign", "audit.view"] },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

function visibleNav(user: User | null) {
  return NAV.filter((n) => !n.perm || can(user, ...n.perm));
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate(`/patients${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ""}`);
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="logo-mark"><EagisLogo size={30} /></span>
          <span className="brand-text">
            <span className="brand-title">National EMR</span>
            <span className="brand-sub">powered by{" "}
              <a className="brand-link" href="https://francordsoft.com/" target="_blank" rel="noreferrer">Francordsoft</a>
            </span>
          </span>
        </div>
        <nav className="sidebar-nav">
          {visibleNav(user).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
            >
              <span className="ico">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          National EMR · powered by{" "}
          <a className="brand-link" href="https://francordsoft.com/" target="_blank" rel="noreferrer">Francordsoft</a><br />
          {getRegion() && <>📍 {getRegion()} County · </>}Facility #{user?.facility_id ?? "—"}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <form className="topbar-search" onSubmit={onSearch}>
            <span className="search-ico">🔍</span>
            <input
              placeholder="Search patients by name, MRN, or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
          <div className="topbar-spacer" />
          <div className="userchip">
            <div className="avatar">{initials(user?.full_name?.split(" ")[0] ?? "", user?.full_name?.split(" ")[1] ?? "")}</div>
            <div className="meta">
              <div className="name">
                {user?.full_name}{user?.credentials ? `, ${user.credentials}` : ""}
              </div>
              <div className="role">
                {roleLabel(user?.role ?? "")}
                {user?.department ? ` · ${user.department}` : ""} · {user?.doctor_id}
              </div>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={logout} title="Sign out">Sign out</button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
