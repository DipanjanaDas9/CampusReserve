import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Clock, Loader2 } from "lucide-react";
import { StudentLayout } from "../layouts/StudentLayout";
import { cancelReservation, listMyReservations } from "../api/reservations";
import { campusParts } from "../lib/datetime";
import { cn } from "../lib/utils";
const BADGE = {
    approved: "bg-success/15 text-success",
    pending: "bg-chart-4/20 text-foreground",
    cancelled: "bg-muted text-muted-foreground",
    denied: "bg-destructive/15 text-destructive",
};
const TABS = ["pending", "approved", "denied", "cancelled"];
const CANCELLABLE = ["pending", "approved"];
export function MyReservationsPage() {
    const [items, setItems] = useState(null);
    const [tab, setTab] = useState("pending");
    const [error, setError] = useState("");
    const [busyId, setBusyId] = useState(null);
    function load() {
        return listMyReservations().then((list) => { setItems(list); setError(""); }).catch((e) => setError(e.message));
    }
    useEffect(() => void load(), []);
    async function onCancel(r) {
        if (!window.confirm(`Cancel your reservation for ${r.facility_name}?`))
            return;
        setBusyId(r.id);
        try {
            await cancelReservation(r.id);
            await load();
        }
        catch (e) {
            setError(e.message);
        }
        finally {
            setBusyId(null);
        }
    }
    const shown = (items ?? []).filter((r) => r.status === tab);
    return (<StudentLayout active="reservations">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">My Reservations</h1>
            <p className="text-sm text-muted-foreground">Requests stay pending until an administrator approves or denies them</p>
          </div>
          <Link to="/search" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-brand">
            New Reservation
          </Link>
        </div>

        <div role="tablist" aria-label="Reservation status" className="mb-4 inline-flex flex-wrap rounded-lg bg-secondary p-1">
          {TABS.map((t) => (<button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("rounded-md px-4 py-1.5 text-sm font-medium capitalize", tab === t ? "bg-card shadow-card" : "text-muted-foreground")}>
              {t} ({(items ?? []).filter((r) => r.status === t).length})
            </button>))}
        </div>

        {error && <p role="alert" className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {items === null && !error && (<p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true"/> Loading reservations…
          </p>)}

        <div className="space-y-3">
          {items && shown.length === 0 && (<div className="rounded-xl border bg-card py-14 text-center text-muted-foreground shadow-card">No {tab} reservations.</div>)}
          {shown.map((r) => {
            const start = campusParts(r.start_time);
            const end = campusParts(r.end_time);
            return (<div key={r.id} className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5 shadow-card">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{r.facility_name}</span>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", BADGE[r.status])}>{r.status}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" aria-hidden="true"/>{start.date}</span>
                  <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden="true"/>{start.time} – {end.time}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Booking ID R-{r.id}</div>
              </div>
              {CANCELLABLE.includes(r.status) && (<button type="button" disabled={busyId === r.id} onClick={() => onCancel(r)} className="rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive disabled:opacity-50">
                  {busyId === r.id ? "Cancelling…" : "Cancel"}
                </button>)}
            </div>);
        })}
        </div>
      </div>
    </StudentLayout>);
}
