import { Link, useNavigate } from "react-router-dom";
import { Bell, Building2, CalendarCheck, LayoutDashboard, Search, Sparkles } from "lucide-react";
import { cn } from "../lib/utils";
const NAV = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "search", label: "Search Spaces", icon: Search },
    { key: "reservations", label: "My Reservations", icon: CalendarCheck },
    { key: "notifications", label: "Notifications", icon: Bell },
    { key: "ai", label: "AI Assistant", icon: Sparkles },
];
export function StudentLayout({ active, children }) {
 const navigate=useNavigate();
 const user=JSON.parse(sessionStorage.getItem("campus_user") || "null");
 const paths={dashboard:"/",search:"/search",reservations:"/reservations",notifications:"/notifications",ai:"/ai-finder"};
    return (<div className="flex flex-col md:flex-row min-h-screen bg-background">
      <aside className="w-full md:w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground flex">
        <div className="flex items-center gap-2 px-5 py-6 text-base font-bold">
          <Building2 className="h-6 w-6 text-sidebar-primary"/>
          CampusReserve
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map(({ key, label, icon: Icon }) => (<Link to={paths[key]} key={key} aria-current={key === active ? "page" : undefined} className={cn("flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium", key === active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground/80")}>
              <Icon className="h-4 w-4"/>
              {label}
            </Link>))}
        <Link to="/check-in" className="block px-3 py-2 text-sm">Check In</Link><button className="px-3 py-2 text-sm" onClick={()=>{sessionStorage.removeItem("access_token");sessionStorage.removeItem("campus_user");navigate("/login");}}>Log out</button></nav>
        <div className="flex items-center gap-3 border-t border-sidebar-border px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold">
            ST
          </div>
          <div className="text-sm">
            <div className="font-medium">{user?.name || "Student"}</div>
            <div className="text-xs text-sidebar-foreground/60">{user?.email}</div>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto p-6 md:p-10">{children}</main>
    </div>);
}
