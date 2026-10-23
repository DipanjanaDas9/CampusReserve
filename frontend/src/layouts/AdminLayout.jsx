import { Building, ClipboardCheck, LayoutDashboard } from "lucide-react";
import { AppShell } from "./StudentLayout";

const ADMIN_NAV = [
  { key: "dashboard", label: "Admin Dashboard", icon: LayoutDashboard, to: "/admin" },
  { key: "approvals", label: "Reservation Approvals", icon: ClipboardCheck, to: "/admin/approvals" },
  { key: "facilities", label: "Manage Facilities", icon: Building, to: "/admin/facilities" },
];

export function AdminLayout({ active, children }) {
  return (
    <AppShell nav={ADMIN_NAV} active={active} badge="Admin">
      {children}
    </AppShell>
  );
}
