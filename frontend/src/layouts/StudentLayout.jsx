import { Link, useNavigate } from "react-router-dom";
import { Bell, Building2, CalendarCheck, Clock3, LayoutDashboard, LogOut, Search } from "lucide-react";
import { cn } from "../lib/utils";
import { clearSession, currentUser } from "../api/client";

const STUDENT_NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, to: "/" },
  { key: "search", label: "Search Spaces", icon: Search, to: "/search" },
  { key: "reservations", label: "My Reservations", icon: CalendarCheck, to: "/reservations" },
  { key: "check-in", label: "Check In", icon: Clock3, to: "/check-in" },
  { key: "notifications", label: "Notifications", icon: Bell, to: "/notifications" },
];

export function AppShell({ nav, active, badge, children }) {
  const navigate = useNavigate();
  const user = currentUser();
  const initials = user?.name?.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "ST";
  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <aside className="flex w-full shrink-0 flex-col bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-60">
        <div className="flex items-center gap-2 px-5 py-6 text-base font-bold">
          <Building2 className="h-6 w-6 shrink-0 text-sidebar-primary" aria-hidden="true" />
          CampusReserve
          {badge && <span className="rounded bg-sidebar-primary px-1.5 py-0.5 text-[10px] uppercase">{badge}</span>}
        </div>
        <nav className="flex-1 space-y-1 px-3" aria-label="Main navigation">
          {nav.map(({ key, label, icon: Icon, to }) => (
            <Link
              to={to}
              key={key}
              aria-current={key === active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
                key === active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/85 hover:bg-sidebar-accent"
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 border-t border-sidebar-border px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold">{initials}</div>
          <div className="min-w-0 flex-1 text-sm">
            <div className="truncate font-medium">{user?.name || "Student"}</div>
            <div className="truncate text-xs text-sidebar-foreground/75">{user?.email}</div>
          </div>
          <button
            type="button"
            aria-label="Log out"
            title="Log out"
            className="rounded-md p-1.5 hover:bg-sidebar-accent"
            onClick={() => {
              clearSession();
              navigate("/login");
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto p-6 md:p-10">{children}</main>
    </div>
  );
}

export function StudentLayout({ active, children }) {
  return (
    <AppShell nav={STUDENT_NAV} active={active}>
      {children}
    </AppShell>
  );
}
