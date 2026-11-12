import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Bell,
  Building,
  Building2,
  ClipboardCheck,
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
  { key: "notifications", label: "Notifications", icon: Bell, to: "/admin/notifications" },
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
    navigate("/login", { replace: true });
  }

  return (
    <div className="dashboard">
      <aside className="dashboard-sidebar">
        <Link to="/admin" className="dashboard-brand">
          <Building2 aria-hidden="true" />
          <span>CampusReserve</span>
        </Link>

        <nav className="dashboard-nav" aria-label="Admin navigation">
          {NAV.map(({ key, label, icon: Icon, to }) => {
            const isActive =
              active === key ||
              (key === "dashboard" && location.pathname === "/admin");

            return (
              <Link
                key={key}
                to={to}
                aria-current={isActive ? "page" : undefined}
                className={`dashboard-nav-link${isActive ? " is-active" : ""}`}
              >
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="dashboard-account">
          <div className="account-avatar">{initials}</div>
          <div className="account-details">
            <strong>{user?.name || "Administrator"}</strong>
            <span>{user?.email || "Campus administrator"}</span>
          </div>
          <button
            type="button"
            className="sidebar-logout"
            onClick={handleLogout}
            aria-label="Log out"
            title="Log out"
          >
            <LogOut aria-hidden="true" />
          </button>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <Link
            to="/admin/notifications"
            className="topbar-icon-button"
            aria-label="Notifications"
          >
            <Bell aria-hidden="true" />
          </Link>
          <div className="topbar-avatar" aria-label={user?.name || "Administrator"}>
            {initials}
          </div>
        </header>

        <div className="dashboard-content admin-page-content">{children}</div>
      </main>
    </div>
  );
}
