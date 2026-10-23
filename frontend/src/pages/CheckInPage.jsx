import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Building2, CalendarDays, CheckCircle2, Clock, Info, ShieldCheck, Timer, Users } from "lucide-react";
import { StudentLayout } from "../layouts/StudentLayout";
import { checkInReservation, listMyReservations } from "../api/reservations";
import { fmtDate, fmtRange, fmtTime } from "../lib/format";
import { EmptyState, ErrorMessage, Loading, PageHeader, StatusBadge, inputClass } from "../components/ui";

export function CheckInPage() {
  const [query] = useSearchParams();
  const [candidates, setCandidates] = useState(null);
  const [selectedId, setSelectedId] = useState(query.get("id"));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listMyReservations()
      .then((all) => {
        // Approved reservations that have not ended yet, soonest first.
        const upcoming = all.filter((r) => r.status === "approved" && !r.is_past).reverse();
        setCandidates(upcoming);
        setSelectedId((id) => (id && upcoming.some((r) => String(r.id) === id) ? id : String(upcoming[0]?.id ?? "")));
      })
      .catch((e) => setError(e.message));
  }, []);

  const r = candidates?.find((c) => String(c.id) === selectedId);

  async function onCheckIn() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const updated = await checkInReservation(r.id);
      setCandidates((xs) => xs.map((x) => (x.id === updated.id ? updated : x)));
      setMessage("You're checked in. Enjoy your session!");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <StudentLayout active="check-in">
      <div className="mx-auto max-w-lg">
        <PageHeader title="Check In to Your Reservation" subtitle="Confirm your arrival and start using the space" />
        {!candidates && !error && <Loading />}
        {candidates?.length === 0 && (
          <EmptyState icon={CalendarDays}>
            You have no approved upcoming reservations.
            <Link to="/reservations" className="text-sm font-medium text-primary hover:underline">
              View my reservations
            </Link>
          </EmptyState>
        )}
        {candidates?.length > 1 && (
          <div className="mb-4">
            <label htmlFor="pick" className="mb-1 block text-sm font-medium">
              Reservation
            </label>
            <select id="pick" className={inputClass} value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setMessage(""); setError(""); }}>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.room.name} · {fmtDate(c.date)} · {fmtRange(c)}
                </option>
              ))}
            </select>
          </div>
        )}
        {r && (
          <div className="rounded-xl border bg-card p-5 shadow-card">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-20 items-center justify-center rounded-md bg-secondary">
                <Building2 className="h-6 w-6 text-primary" aria-hidden="true" />
              </div>
              <div>
                <div className="font-semibold text-foreground">{r.room.name}</div>
                <div className="text-sm text-muted-foreground">{r.room.location}</div>
              </div>
            </div>

            <dl className="mt-5 divide-y border-t text-sm">
              <Row icon={CalendarDays} label="Date">{fmtDate(r.date)}</Row>
              <Row icon={Clock} label="Time">{fmtRange(r)}</Row>
              <Row icon={Users} label="Group Size">{r.attendees} {r.attendees === 1 ? "person" : "people"}</Row>
              <Row icon={ShieldCheck} label="Status"><StatusBadge status={r.status} /></Row>
              <Row icon={Timer} label="Check-in Window">
                {fmtTime(r.check_in_window.opens)} – {fmtTime(r.check_in_window.closes)}
              </Row>
            </dl>

            {r.checked_in_at ? (
              <p role="status" className="mt-5 flex items-center justify-center gap-2 rounded-md bg-success/15 py-2.5 text-sm font-semibold text-success-strong">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Checked in
              </p>
            ) : (
              <button
                type="button"
                onClick={onCheckIn}
                disabled={!r.can_check_in || busy}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {busy ? "Checking in…" : "Check In"}
              </button>
            )}
            {!r.can_check_in && !r.checked_in_at && (
              <p className="mt-2 text-center text-xs text-muted-foreground">Check-in opens at {fmtTime(r.check_in_window.opens)} on {fmtDate(r.date)}.</p>
            )}
            {message && <p role="status" className="mt-3 text-center text-sm text-success-strong">{message}</p>}

            <div className="mt-4 flex items-start gap-2 rounded-md bg-primary/10 p-3 text-sm text-accent-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Please check in within 30 minutes of your reservation start time, or the booking is recorded as a no-show.
            </div>
          </div>
        )}
        <div className="mt-3">
          <ErrorMessage>{error}</ErrorMessage>
        </div>
      </div>
    </StudentLayout>
  );
}

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center justify-between py-3">
      <dt className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4" aria-hidden="true" />{label}</dt>
      <dd className="font-medium text-foreground">{children}</dd>
    </div>
  );
}
