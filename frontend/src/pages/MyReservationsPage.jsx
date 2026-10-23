import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, CalendarDays, CheckCircle2, Clock, MapPin, Users } from "lucide-react";
import { StudentLayout } from "../layouts/StudentLayout";
import { cancelReservation, listMyReservations } from "../api/reservations";
import { fmtDate, fmtRange } from "../lib/format";
import { cn } from "../lib/utils";
import { EmptyState, ErrorMessage, Loading, PageHeader, StatusBadge, primaryButton } from "../components/ui";

const TABS = ["upcoming", "past", "cancelled"];

function inTab(r, t) {
  if (t === "cancelled") return r.status === "cancelled" || r.status === "rejected";
  if (t === "upcoming") return !r.is_past && (r.status === "pending" || r.status === "approved");
  return r.is_past && r.status === "approved";
}

export function MyReservationsPage() {
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState("upcoming");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  function load() {
    listMyReservations().then(setItems).catch((e) => setError(e.message));
  }
  useEffect(load, []);
  function retry() {
    setError("");
    load();
  }

  async function onCancel(r) {
    if (!window.confirm(`Cancel your reservation for ${r.room.name} on ${fmtDate(r.date)}?`)) return;
    setBusyId(r.id);
    setError("");
    try {
      const updated = await cancelReservation(r.id);
      setItems((xs) => xs.map((x) => (x.id === r.id ? updated : x)));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  // Upcoming first-soonest; past and cancelled most-recent first.
  const shown = (items || []).filter((r) => inTab(r, tab));
  if (tab === "upcoming") shown.reverse();

  return (
    <StudentLayout active="reservations">
      <div className="mx-auto max-w-4xl">
        <PageHeader title="My Reservations" subtitle="Track requests, approvals and past bookings">
          <Link to="/search" className={primaryButton}>
            New Reservation
          </Link>
        </PageHeader>

        <div role="tablist" aria-label="Reservation filter" className="mb-4 inline-flex rounded-lg bg-secondary p-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn("rounded-md px-4 py-1.5 text-sm font-medium capitalize", tab === t ? "bg-card shadow-card" : "text-muted-foreground")}
            >
              {t} ({(items || []).filter((r) => inTab(r, t)).length})
            </button>
          ))}
        </div>

        <div className="mb-3">
          <ErrorMessage onRetry={items ? undefined : retry}>{error}</ErrorMessage>
        </div>
        {!items && !error && <Loading label="Loading reservations…" />}

        <div className="space-y-3">
          {items && shown.length === 0 && <EmptyState icon={CalendarCheck}>No reservations here.</EmptyState>}
          {shown.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5 shadow-card">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.room.name}</span>
                  <StatusBadge status={r.status} />
                  {r.checked_in_at && (
                    <span className="flex items-center gap-1 text-xs font-medium text-success-strong">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Checked in
                    </span>
                  )}
                  {r.is_no_show && <span className="text-xs font-medium text-destructive-strong">Missed check-in</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" aria-hidden="true" />{fmtDate(r.date)}</span>
                  <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden="true" />{fmtRange(r)}</span>
                  <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden="true" />{r.room.location}</span>
                  <span className="flex items-center gap-1.5"><Users className="h-4 w-4" aria-hidden="true" />{r.attendees} · {r.purpose}</span>
                </div>
                {r.status === "rejected" && r.decision_reason && <p className="mt-1 text-sm text-destructive-strong">Reason: {r.decision_reason}</p>}
                <div className="mt-1 text-xs text-muted-foreground">Booking ID R-{r.id}</div>
              </div>
              <div className="flex gap-2">
                {r.can_check_in && (
                  <Link to={`/check-in?id=${r.id}`} className={primaryButton}>
                    Check in
                  </Link>
                )}
                {r.can_cancel && (
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => onCancel(r)}
                    className="rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive-strong disabled:opacity-50"
                  >
                    {busyId === r.id ? "Cancelling…" : "Cancel"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </StudentLayout>
  );
}
