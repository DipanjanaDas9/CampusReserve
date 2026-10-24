import { Link, useNavigate } from "react-router-dom";
import { BarChart3, Bell, Building, Building2, ClipboardCheck, LayoutDashboard, LogOut, Users } from "lucide-react";
import { cn } from "../lib/utils";
import { currentUser } from "../lib/adminAccess";

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, to: "/admin" },
  { key: "requests", label: "Reservation Requests", icon: ClipboardCheck, to: "/admin/approvals" },
  { key: "facilities", label: "Manage Facilities", icon: Building, to: "/admin/facilities" },
  { key: "users", label: "Users", icon: Users, to: "/admin/users" },
  { key: "reports", label: "Reports", icon: BarChart3, to: "/admin/reports" },
  { key: "notifications", label: "Notifications", icon: Bell, to: "/admin/notifications" },
];

/** Same look as StudentLayout, with the administrator navigation. */
export function AdminLayout({ active, children }) {
  const navigate = useNavigate();
  const user = currentUser();
  const initials = user?.name?.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "AD";
  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <aside className="flex w-full shrink-0 flex-col bg-sidebar text-sidebar-foreground md:w-60">
        <div className="flex items-center gap-2 px-5 py-6 text-base font-bold">
          <Building2 className="h-6 w-6 shrink-0 text-sidebar-primary" aria-hidden="true" />
          CampusReserve
        </div>
        <nav className="flex-1 space-y-1 px-3" aria-label="Admin navigation">
          {NAV.map(({ key, label, icon: Icon, to }) => (
            <Link
              key={key}
              to={to}
              aria-current={key === active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                key === active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent"
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
            <div className="truncate font-medium">{user?.name || "Admin User"}</div>
            <div className="text-xs text-sidebar-foreground/60">Administrator</div>
          </div>
          <button
            type="button"
            aria-label="Log out"
            title="Log out"
            className="rounded-md p-1.5 hover:bg-sidebar-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            onClick={() => {
              sessionStorage.removeItem("access_token");
              sessionStorage.removeItem("campus_user");
              navigate("/login");
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto">
        <div className="p-6 md:p-10">{children}</div>
      </main>
    </div>
  );
}
