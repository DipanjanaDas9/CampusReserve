import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Clock, MapPin } from "lucide-react";
import { StudentLayout } from "../layouts/StudentLayout";
import { cn } from "../lib/utils";
const SAMPLE = [
    { id: "R-1042", space: "Library Study Room 204", date: "Thu, Oct 22", time: "2:00 PM – 4:00 PM", purpose: "Group study session", status: "confirmed" },
    { id: "R-1043", space: "Engineering Room 312", date: "Fri, Oct 23", time: "10:00 AM – 11:00 AM", purpose: "Project meeting", status: "pending" },
    { id: "R-1031", space: "Student Center 101", date: "Mon, Oct 12", time: "9:00 AM – 12:00 PM", purpose: "Club workshop", status: "completed" },
    { id: "R-1027", space: "Library Study Room 204", date: "Wed, Oct 7", time: "1:00 PM – 2:00 PM", purpose: "Exam prep", status: "cancelled" },
];
const BADGE = {
    confirmed: "bg-success/15 text-success",
    pending: "bg-chart-4/20 text-foreground",
    cancelled: "bg-destructive/15 text-destructive",
    completed: "bg-muted text-muted-foreground",
};
const TABS = ["upcoming", "past", "cancelled"];
function inTab(r, t) {
    if (t === "upcoming")
        return r.status === "confirmed" || r.status === "pending";
    if (t === "past")
        return r.status === "completed";
    return r.status === "cancelled";
}
export function MyReservationsPage() {
    const [items, setItems] = useState(SAMPLE);
    const [tab, setTab] = useState("upcoming");
    const shown = items.filter((r) => inTab(r, tab));
    return (<StudentLayout active="reservations">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">My Reservations</h1>
            <p className="text-sm text-muted-foreground">Sample reservations shown until the backend is connected</p>
          </div>
          <Link to="/availability" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-brand">
            New Reservation
          </Link>
        </div>

        <div className="mb-4 inline-flex rounded-lg bg-secondary p-1">
          {TABS.map((t) => (<button key={t} onClick={() => setTab(t)} className={cn("rounded-md px-4 py-1.5 text-sm font-medium capitalize", tab === t ? "bg-card shadow-card" : "text-muted-foreground")}>
              {t} ({items.filter((r) => inTab(r, t)).length})
            </button>))}
        </div>

        <div className="space-y-3">
          {shown.length === 0 && (<div className="rounded-xl border bg-card py-14 text-center text-muted-foreground shadow-card">No reservations here.</div>)}
          {shown.map((r) => (<div key={r.id} className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5 shadow-card">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{r.space}</span>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", BADGE[r.status])}>{r.status}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4"/>{r.date}</span>
                  <span className="flex items-center gap-1.5"><Clock className="h-4 w-4"/>{r.time}</span>
                  <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4"/>{r.purpose}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Booking ID {r.id}</div>
              </div>
              {tab === "upcoming" && (<button onClick={() => setItems((xs) => xs.map((x) => (x.id === r.id ? { ...x, status: "cancelled" } : x)))} className="rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive">
                  Cancel
                </button>)}
            </div>))}
        </div>
      </div>
    </StudentLayout>);
}
