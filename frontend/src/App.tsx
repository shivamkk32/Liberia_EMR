import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import Layout from "./components/Layout";
import { Loading } from "./components/ui";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import PatientChart from "./pages/PatientChart";
import EncounterEditor from "./pages/EncounterEditor";
import Schedule from "./pages/Schedule";
import Tasks from "./pages/Tasks";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import { can } from "./lib/roles";
import type { ReactNode } from "react";

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Restoring session…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Permission-gated route wrapper — redirect home if the permission isn't held.
function RequirePerm({ perm, children }: { perm: string[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!can(user, ...perm)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={loading ? <Loading /> : user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="patients" element={<Patients />} />
        <Route path="patients/:id" element={<PatientChart />} />
        <Route path="patients/:patientId/encounters/new" element={<RequirePerm perm={["encounter.create"]}><EncounterEditor /></RequirePerm>} />
        <Route path="encounters/:encounterId" element={<RequirePerm perm={["encounter.view"]}><EncounterEditor /></RequirePerm>} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="reports" element={<Reports />} />
        <Route path="admin" element={<RequirePerm perm={["user.create", "user.edit", "role.edit", "role.assign", "audit.view"]}><Admin /></RequirePerm>} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
