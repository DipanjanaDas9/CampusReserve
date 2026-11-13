
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StudentPageHeader } from "../components/StudentPageHeader";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  Info,
  ShieldCheck,
  Timer,
  Users,
} from "lucide-react";

import { StudentLayout } from "../layouts/StudentLayout";
import {
  getMyReservations,
  checkInReservation,
} from "../api/reservations";

const CAMPUS_TIMEZONE = "America/Chicago";

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-US", {
    timeZone: CAMPUS_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("en-US", {
    timeZone: CAMPUS_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CheckInPage() {
  const [reservations, setReservations] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = setInterval(refresh, 1000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await getMyReservations();

        if (!active) return;

        setReservations(data);

        const firstApproved = data.find(
          (r) =>
            r.status === "approved" &&
            !r.checked_in_at &&
            new Date(r.end_time) > new Date()
        );

        if (firstApproved) {
          setSelectedId(String(firstApproved.id));
        }
      } catch (err) {
        if (active) {
          setError(err.message || "Could not load reservations.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const approvedReservations = reservations.filter(
    (r) =>
      r.status === "approved" &&
      !r.checked_in_at &&
      new Date(r.end_time).getTime() > now
  );

  const selected = reservations.find(
    (r) => String(r.id) === selectedId
  );


  const withinCheckInWindow =
    selected &&
    now >= new Date(selected.start_time).getTime() - 15 * 60 * 1000 &&
    now < new Date(selected.end_time).getTime();

  const rows = selected
    ? [
        {
          icon: CalendarDays,
          label: "Date",
          value: formatDate(selected.start_time),
        },
        {
          icon: Clock,
          label: "Time",
          value:
            `${formatTime(selected.start_time)} – ` +
            formatTime(selected.end_time),
        },
        {
          icon: Users,
          label: "Group Size",
          value: `${selected.attendees ?? 1} people`,
        },
        {
          icon: ShieldCheck,
          label: "Status",
          value: "Approved",
          badge: true,
        },
        {
          icon: Timer,
          label: "Check-in Opens",
          value: formatTime(
            new Date(
              new Date(selected.start_time).getTime() -
                15 * 60 * 1000
            )
          ),
        },
      ]
    : [];

  async function handleCheckIn() {
    if (!selected || busy) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await checkInReservation(selected.id);

      setMessage(
        `Successfully checked in to ${
          selected.facility_name || "your reservation"
        }!`
      );

      const updated = await getMyReservations();
      setReservations(updated);
      setSelectedId("");
    } catch (err) {
      setError(err.message || "Check-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StudentLayout active="reservations">
      <div className="student-page checkin-page mx-auto max-w-5xl">
        <StudentPageHeader eyebrow="YOU’RE RIGHT WHERE YOU NEED TO BE" title="Arrive. Check in. Settle in." description="Your space is waiting. Confirm your arrival and make it yours." />
        <div className="checkin-layout"><div>
        {loading ? (
          <p className="student-empty" role="status">
            Loading your reservations...
          </p>
        ) : (
          <>
            {approvedReservations.length > 0 && (
              <div className="mt-6">
                <label
                  htmlFor="check-in-reservation"
                  className="mb-2 block text-sm font-medium"
                >
                  Select your reservation
                </label>

                <select
                  id="check-in-reservation"
                  value={selectedId}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setError("");
                    setMessage("");
                  }}
                  className="w-full rounded-md border bg-card p-3 text-sm"
                >
                  <option value="">Choose a reservation</option>
                  {approvedReservations.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.facility_name || `Facility #${r.facility_id}`}
                      {" — "}
                      {formatDate(r.start_time)}
                      {" at "}
                      {formatTime(r.start_time)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selected && (
              <div className="checkin-ticket">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-20 items-center justify-center rounded-md bg-secondary">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>

                  <div>
                    <div className="font-semibold text-foreground">
                      {selected.facility_name ||
                        `Facility #${selected.facility_id}`}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Reservation R-{selected.id}
                    </div>
                  </div>
                </div>

                <dl className="mt-5 divide-y border-t text-sm">
                  {rows.map(({ icon: Icon, label, value, badge }) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <dt className="flex items-center gap-2 text-muted-foreground">
                        <Icon className="h-4 w-4 shrink-0" />
                        {label}
                      </dt>

                      <dd className="text-right font-medium text-foreground">
                        {badge ? (
                          <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs text-success">
                            {value}
                          </span>
                        ) : (
                          value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>

                <button
                  type="button"
                  onClick={handleCheckIn}
                  disabled={busy || !withinCheckInWindow}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {busy ? "Checking in..." : "Check In"}
                </button>

                <div className="mt-4 flex items-start gap-2 rounded-md bg-primary/10 p-3 text-sm text-primary">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  {withinCheckInWindow
                    ? "Your check-in window is open."
                    : "Check-in opens 15 minutes before your reservation and closes when it ends."}
                </div>
              </div>
            )}

            {!selected && !message && !error && (
              <div className="student-empty"><span className="student-empty-icon"><CalendarDays size={28} /></span><h2>{approvedReservations.length ? "Choose your space above" : "No check-ins just yet"}</h2><p>{approvedReservations.length ? "Select a reservation to see its details and check-in window." : "Your approved upcoming reservations will appear here when they’re ready."}</p><Link to="/reservations">View my reservations</Link></div>
            )}

            {message && (
              <p
                role="status"
                className="checkin-success"
              >
                {message}
              </p>
            )}

            {error && (
              <p
                role="alert"
                className="mt-4 text-center text-sm text-destructive"
              >
                {error}
              </p>
            )}
          </>
        )}
        </div></div>
      </div>
    </StudentLayout>
  );
}
