import { Link } from "react-router-dom";
import UpcomingAppointments from "../components/UpcomingAppointments";
import { useAuth } from "../auth/AuthContext";
import { isFrontDesk } from "../lib/roles";

export default function Schedule() {
  const { user } = useAuth();
  const fd = isFrontDesk(user?.role);
  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Schedule</h1>
          <div className="page-sub">
            {fd
              ? "Book and manage appointments across all departments and doctors."
              : "Your appointments — filter by date range, type, and reason."}
          </div>
        </div>
        <Link to="/patients" className="btn">＋ Register / Find Patient</Link>
      </div>
      <UpcomingAppointments />
    </div>
  );
}
