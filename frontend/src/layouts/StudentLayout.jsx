import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  CalendarDays,
  CalendarCheck,
  GraduationCap,
  Home,
  LogOut,
  Search,
  Sparkles,
} from "lucide-react";
import "../App.css";

const navigation = [
  { label: "Home", to: "/", icon: Home },
  { label: "Search", to: "/search", icon: Search },
  { label: "AI Finder", to: "/ai-finder", icon: Sparkles },
  { label: "Check In", to: "/check-in", icon: CalendarCheck },
  { label: "Reservations", to: "/reservations", icon: CalendarDays },
];

export function StudentLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = JSON.parse(sessionStorage.getItem("campus_user") || "null");
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
    localStorage.removeItem("access_token");
    localStorage.removeItem("campus_user");
    navigate("/login", { replace: true });
  }

  return (
    <div className="student-shell">
      <header className="student-topbar">
        <Link to="/" className="student-brand" aria-label="CampusReserve home">
          <GraduationCap aria-hidden="true" />
          <span>
            Campus<span>Reserve</span>
          </span>
        </Link>

        <nav className="student-nav" aria-label="Main navigation">
          {navigation.map(({ label, to, icon: Icon }) => {
            const isActive =
              location.pathname === to ||
              (to === "/search" && location.pathname.startsWith("/spaces/"));
            return (
              <Link
                key={to}
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
            to="/notifications"
            className="student-notification-link"
            aria-label="Notifications"
          >
            <Bell aria-hidden="true" />
          </Link>
          <details className="student-profile">
            <summary aria-label={`${user?.name || "Student"} account menu`}>
              {initials}
            </summary>
            <div className="student-profile-menu">
              <strong>{user?.name || "Student"}</strong>
              <span>{user?.email || "Campus member"}</span>
              <button type="button" onClick={handleLogout}>
                <LogOut aria-hidden="true" /> Sign out
              </button>
            </div>
          </details>
        </div>
      </header>

      <main className="student-main">
        <div className="dashboard-content student-content">{children}</div>
      </main>
    </div>
  );
}
