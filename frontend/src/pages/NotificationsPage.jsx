import { useState } from "react";
import { Bell, CalendarCheck, CalendarX, Clock, Info } from "lucide-react";
import { StudentLayout } from "../layouts/StudentLayout";
import { cn } from "../lib/utils";
const SAMPLE = [
    { id: 1, kind: "confirmed", title: "Reservation confirmed", body: "Study Room 204 is booked for Thu, 2:00 PM – 4:00 PM.", time: "10 min ago", read: false },
    { id: 2, kind: "reminder", title: "Upcoming reservation", body: "Your booking for Library Room A starts in 1 hour.", time: "1 hour ago", read: false },
    { id: 3, kind: "cancelled", title: "Reservation cancelled", body: "Your booking for Lab 3 on Mon, 9:00 AM was cancelled.", time: "Yesterday", read: true },
    { id: 4, kind: "system", title: "Maintenance notice", body: "Conference Hall B will be unavailable this Saturday.", time: "2 days ago", read: true },
];
const ICONS = { confirmed: CalendarCheck, reminder: Clock, cancelled: CalendarX, system: Info };
const TONES = {
    confirmed: "bg-success/15 text-success",
    reminder: "bg-primary/15 text-primary",
    cancelled: "bg-destructive/15 text-destructive",
    system: "bg-muted text-muted-foreground",
};
export function NotificationsPage() {
    const [notes, setNotes] = useState(SAMPLE);
    const [filter, setFilter] = useState("all");
    const unread = notes.filter((n) => !n.read).length;
    const shown = filter === "all" ? notes : notes.filter((n) => !n.read);
    return (<StudentLayout active="notifications">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              {unread} unread · Sample notifications shown until the backend is connected
            </p>
          </div>
          <button onClick={() => setNotes((ns) => ns.map((n) => ({ ...n, read: true })))} disabled={unread === 0} className="text-sm font-medium text-primary disabled:opacity-40">
            Mark all as read
          </button>
        </div>

        <div className="mb-4 inline-flex rounded-lg bg-secondary p-1">
          {["all", "unread"].map((f) => (<button key={f} onClick={() => setFilter(f)} className={cn("rounded-md px-4 py-1.5 text-sm font-medium capitalize", filter === f ? "bg-card shadow-card" : "text-muted-foreground")}>
              {f}
            </button>))}
        </div>

        <div className="overflow-hidden rounded-xl border bg-card shadow-card">
          {shown.length === 0 ? (<div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <Bell className="h-8 w-8"/>
              You're all caught up.
            </div>) : (shown.map((n) => {
            const Icon = ICONS[n.kind];
            return (<button key={n.id} onClick={() => setNotes((ns) => ns.map((x) => (x.id === n.id ? { ...x, read: true } : x)))} className={cn("flex w-full items-start gap-4 border-b px-5 py-4 text-left last:border-b-0", !n.read && "bg-accent/50")}>
                  <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", TONES[n.kind])}>
                    <Icon className="h-5 w-5"/>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{n.title}</span>
                      <span className="text-xs text-muted-foreground">{n.time}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{n.body}</p>
                  </div>
                  {!n.read && <span className="mt-2 h-2.5 w-2.5 rounded-full bg-primary"/>}
                </button>);
        }))}
        </div>
      </div>
    </StudentLayout>);
}
