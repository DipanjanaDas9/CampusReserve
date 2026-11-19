import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Bell,
  Building,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Users,
} from "lucide-react";
import { currentUser } from "../lib/adminAccess";
import "../App.css";

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, to: "/admin" },
  { key: "requests", label: "Reservation Requests", icon: ClipboardCheck, to: "/admin/approvals" },
  { key: "facilities", label: "Manage Facilities", icon: Building, to: "/admin/facilities" },
  { key: "users", label: "Users", icon: Users, to: "/admin/users" },
  { key: "reports", label: "Reports", icon: BarChart3, to: "/admin/reports" },
];

export function AdminLayout({ active, children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = currentUser();
  const initials =
    user?.name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "AD";

  function handleLogout() {
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("campus_user");
    localStorage.removeItem("access_token");
    localStorage.removeItem("campus_user");
    navigate("/login", { replace: true });
  }

  return (
    <div className="student-shell admin-shell">
      <header className="student-topbar admin-topbar">
        <Link to="/admin" className="student-brand" aria-label="CampusReserve admin home">
          <GraduationCap aria-hidden="true" />
          <span>
            Campus<span>Reserve</span>
          </span>
        </Link>

        <nav className="student-nav admin-nav" aria-label="Admin navigation">
          {NAV.map(({ key, label, icon: Icon, to }) => {
            const isActive =
              active === key ||
              (key === "dashboard" && location.pathname === "/admin");

            return (
              <Link
                key={key}
                to={to}
                aria-current={isActive ? "page" : undefined}
                className={`student-nav-link${isActive ? " is-active" : ""}`}
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="student-topbar-actions">
          <Link
            to="/admin/notifications"
            aria-current={active === "notifications" ? "page" : undefined}
            className={`student-notification-link${active === "notifications" ? " is-active" : ""}`}
            aria-label="Notifications"
          >
            <Bell aria-hidden="true" />
          </Link>
          <details className="student-profile">
            <summary aria-label={`${user?.name || "Administrator"} account menu`}>
              {initials}
            </summary>
            <div className="student-profile-menu">
              <strong>{user?.name || "Administrator"}</strong>
              <span>{user?.email || "Campus administrator"}</span>
              <button type="button" onClick={handleLogout}>
                <LogOut aria-hidden="true" /> Sign out
              </button>
            </div>
          </details>
        </div>
      </header>

      <main className="student-main">
        <div className="dashboard-content student-content admin-page-content">
          {children}
        </div>
      </main>
    </div>
  );
}
