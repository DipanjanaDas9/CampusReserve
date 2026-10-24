
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Clock, MapPin } from "lucide-react";

import { StudentLayout } from "../layouts/StudentLayout";
import { cn } from "../lib/utils";
import {
  getMyReservations,
  cancelReservation,
} from "../api/reservations";

const CAMPUS_TIMEZONE = "America/Chicago";

const BADGE = {
  approved: "bg-success/15 text-success",
  pending: "bg-chart-4/20 text-foreground",
  denied: "bg-destructive/15 text-destructive",
  cancelled: "bg-destructive/15 text-destructive",
  completed: "bg-muted text-muted-foreground",
};

const STATUS_LABEL = {
  approved: "Confirmed",
  pending: "Pending",
  denied: "Rejected",
  cancelled: "Cancelled",
  completed: "Completed",
};

const TABS = ["upcoming", "past", "cancelled"];

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function inTab(reservation, tab) {
  const end = new Date(reservation.end_time);
  const now = new Date();

  if (tab === "cancelled") {
    return (
      reservation.status === "cancelled" ||
      reservation.status === "denied"
    );
  }

  if (tab === "past") {
    return (
      reservation.status === "completed" ||
      (
        reservation.status !== "cancelled" &&
        reservation.status !== "denied" &&
        end <= now
      )
    );
  }

  return (
    (reservation.status === "pending" ||
      reservation.status === "approved") &&
    end > now
  );
}

export function MyReservationsPage() {
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("upcoming");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  async function loadReservations() {
    const data = await getMyReservations();
    setItems(data);
  }

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await getMyReservations();

        if (active) {
          setItems(data);
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

  async function handleCancel(id) {
    if (!window.confirm("Cancel this reservation?")) {
      return;
    }

    setBusyId(id);
    setError("");

    try {
      await cancelReservation(id);
      await loadReservations();
    } catch (err) {
      setError(err.message || "Could not cancel reservation.");
    } finally {
      setBusyId(null);
    }
  }

  const shown = items.filter((r) => inTab(r, tab));

  return (
    <StudentLayout active="reservations">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">My Reservations</h1>
            <p className="text-sm text-muted-foreground">
              View and manage your reservation requests.
            </p>
          </div>

          <Link
            to="/availability"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-brand"
          >
            New Reservation
          </Link>
        </div>

        <div className="mb-4 inline-flex rounded-lg bg-secondary p-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium capitalize",
                tab === t
                  ? "bg-card shadow-card"
                  : "text-muted-foreground"
              )}
            >
              {t} ({items.filter((r) => inTab(r, t)).length})
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="space-y-3">
          {loading && (
            <div className="rounded-xl border bg-card py-14 text-center text-muted-foreground">
              Loading reservations...
            </div>
          )}

          {!loading && shown.length === 0 && (
            <div className="rounded-xl border bg-card py-14 text-center text-muted-foreground shadow-card">
              No reservations here.
            </div>
          )}

          {!loading && shown.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5 shadow-card"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">
                    {r.facility_name || `Facility #${r.facility_id}`}
                  </span>

                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium",
                      BADGE[r.status] || "bg-muted text-foreground"
                    )}
                  >
                    {STATUS_LABEL[r.status] || r.status}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4" />
                    {formatDate(r.start_time)}
                  </span>

                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {formatTime(r.start_time)} – {formatTime(r.end_time)}
                  </span>

                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {r.purpose || "No purpose provided"}
                  </span>
                </div>

                <div className="mt-1 text-xs text-muted-foreground">
                  Booking ID R-{r.id}
                </div>
              </div>

              {tab === "upcoming" && (
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => handleCancel(r.id)}
                  className="rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive disabled:opacity-50"
                >
                  {busyId === r.id ? "Cancelling..." : "Cancel"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </StudentLayout>
  );
}
