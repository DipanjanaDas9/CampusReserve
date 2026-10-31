
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  Building2,
  CalendarCheck,
  Clock3,
  LayoutDashboard,
  LogOut,
  Search,
  Sparkles,
} from "lucide-react";

import "../App.css";

const navigation = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Search Spaces", to: "/search", icon: Search },
  { label: "My Reservations", to: "/reservations", icon: CalendarCheck },
  { label: "Notifications", to: "/notifications", icon: Bell },
  { label: "AI Assistant", to: "/ai-finder", icon: Sparkles },
  { label: "Check in", to: "/check-in", icon: Clock3 },
];

export function StudentLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  const user = JSON.parse(
    sessionStorage.getItem("campus_user") || "null"
  );

  const initials =
    user?.name
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "ST";

  function handleLogout() {
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("campus_user");
    navigate("/login", { replace: true });
  }

  return (
    <div className="dashboard">
      <aside className="dashboard-sidebar">
        <Link to="/" className="dashboard-brand">
          <Building2 aria-hidden="true" />
          <span>CampusReserve</span>
        </Link>

        <nav className="dashboard-nav" aria-label="Main navigation">
          {navigation.map(({ label, to, icon: Icon }) => {
            const isActive = location.pathname === to;

            return (
              <Link
                key={to}
                to={to}
                aria-current={isActive ? "page" : undefined}
                className={`dashboard-nav-link${
                  isActive ? " is-active" : ""
                }`}
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
            <strong>{user?.name || "Student"}</strong>
            <span>{user?.email || "Campus member"}</span>
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
            to="/search"
            className="dashboard-search"
            aria-label="Search spaces"
          >
            <Search aria-hidden="true" />
            <span>Search spaces...</span>
          </Link>

          <Link
            to="/notifications"
            className="topbar-icon-button"
            aria-label="Notifications"
          >
            <Bell aria-hidden="true" />
          </Link>

          <div
            className="topbar-avatar"
            aria-label={user?.name || "Student"}
          >
            {initials}
          </div>
        </header>

        <div className="dashboard-content">
          {children}
        </div>
      </main>
    </div>
  );
}
