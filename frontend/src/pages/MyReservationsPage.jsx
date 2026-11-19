import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpDown,
  Building2,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Clock3,
  Eye,
  Grid2X2,
  MapPin,
  Search,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";

import { StudentLayout } from "../layouts/StudentLayout";
import {
  getMyReservations,
  cancelReservation,
} from "../api/reservations";
import { listFacilities } from "../api/facilities";
import { ROOM_PHOTOS } from "../data/sampleRooms";

const CAMPUS_TIMEZONE = "America/Chicago";

const STATUS_LABEL = {
  approved: "Approved",
  pending: "Pending",
  denied: "Rejected",
  cancelled: "Cancelled",
  completed: "Completed",
};

const STATUS_FILTERS = [
  { value: "all", label: "All", icon: Grid2X2 },
  { value: "approved", label: "Approved", icon: CheckCircle2 },
  { value: "pending", label: "Pending", icon: Clock3 },
  { value: "completed", label: "Completed", icon: CheckSquare },
  { value: "cancelled", label: "Cancelled", icon: XCircle },
];

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIMEZONE,
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

function matchesStatus(reservation, filter) {
  if (filter === "all") return true;
  if (filter === "cancelled") {
    return reservation.status === "cancelled" || reservation.status === "denied";
  }

  return reservation.status === filter;
}

function matchesDateRange(reservation, range, now) {
  if (range === "all") return true;

  const start = new Date(reservation.start_time).getTime();
  if (!Number.isFinite(start)) return false;
  if (range === "past") return start < now;

  const days = range === "week" ? 7 : 30;
  return start >= now && start <= now + days * 24 * 60 * 60 * 1000;
}

function getLocation(facility) {
  if (!facility) return "Campus facility";

  const floor = facility.floor_number == null
    ? null
    : Number(facility.floor_number) === 0
      ? "Ground Floor"
      : `${facility.floor_number}${getOrdinalSuffix(Number(facility.floor_number))} Floor`;
  const building = [facility.building_name, floor].filter(Boolean).join(" · ");

  return building || facility.location || "Campus facility";
}

function getOrdinalSuffix(number) {
  const lastTwoDigits = number % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return "th";

  switch (number % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

export function MyReservationsPage() {
  const [items, setItems] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const [spaceId, setSpaceId] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [now, setNow] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [facilityError, setFacilityError] = useState("");

  async function loadReservations() {
    const data = await getMyReservations();
    setItems(data);
  }

  useEffect(() => {
    let active = true;

    async function load() {
      const [reservationResult, facilityResult] = await Promise.allSettled([
        getMyReservations(),
        listFacilities(),
      ]);

      if (!active) return;

      setNow(Date.now());

      if (reservationResult.status === "fulfilled") {
        setItems(reservationResult.value);
      } else {
        setError(
          reservationResult.reason.message || "Could not load reservations."
        );
      }

      if (facilityResult.status === "fulfilled") {
        setFacilities(facilityResult.value);
      } else {
        setFacilityError(
          facilityResult.reason.message ||
            "Facility locations could not be loaded."
        );
      }

      setLoading(false);
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

  const facilityById = new Map(
    facilities.map((facility) => [String(facility.id), facility])
  );
  const spaceOptions = [
    ...new Map(
      items.map((reservation) => [
        String(reservation.facility_id),
        {
          id: String(reservation.facility_id),
          name: reservation.facility_name || `Facility #${reservation.facility_id}`,
        },
      ])
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const normalizedQuery = query.trim().toLowerCase();
  const shown = items
    .filter((reservation) => {
      const facility = facilityById.get(String(reservation.facility_id));
      const location = getLocation(facility);
      const searchText = [
        reservation.facility_name,
        location,
        reservation.purpose,
        formatDate(reservation.start_time),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        matchesStatus(reservation, tab) &&
        matchesDateRange(reservation, dateRange, now) &&
        (spaceId === "all" || String(reservation.facility_id) === spaceId) &&
        (!normalizedQuery || searchText.includes(normalizedQuery))
      );
    })
    .sort((a, b) => {
      const difference =
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      return sortOrder === "newest" ? -difference : difference;
    });

  return (
    <StudentLayout active="reservations">
      <div className="student-page reservations-page mx-auto max-w-6xl">
        <header
          className="campus-page-banner reservations-hero"
          style={{
            "--reservations-hero-image":
              'url("https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=1800&q=85")',
          }}
        >
          <span className="reservations-hero-icon">
            <CalendarDays aria-hidden="true" />
          </span>
          <div>
            <h1>My Reservations</h1>
            <p>Manage and track all your space reservations.</p>
          </div>
        </header>

        <nav className="reservation-status-tabs" aria-label="Reservation status filters">
          {STATUS_FILTERS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
              className={tab === value ? "is-active" : ""}
            >
              <Icon aria-hidden="true" />
              <span>{label} ({items.filter((r) => matchesStatus(r, value)).length})</span>
            </button>
          ))}
        </nav>

        <div className="reservation-controls" role="search">
          <label className="reservation-search-control">
            <Search aria-hidden="true" />
            <input
              type="search"
              aria-label="Search reservations"
              placeholder="Search your reservations by space, building, or date..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <label className="reservation-select-control">
            <CalendarDays aria-hidden="true" />
            <select
              aria-label="Date range"
              value={dateRange}
              onChange={(event) => setDateRange(event.target.value)}
            >
              <option value="all">Date Range</option>
              <option value="week">Next 7 Days</option>
              <option value="month">Next 30 Days</option>
              <option value="past">Past Dates</option>
            </select>
          </label>

          <label className="reservation-select-control">
            <Building2 aria-hidden="true" />
            <select
              aria-label="Filter by space"
              value={spaceId}
              onChange={(event) => setSpaceId(event.target.value)}
            >
              <option value="all">All Spaces</option>
              {spaceOptions.map((space) => (
                <option key={space.id} value={space.id}>{space.name}</option>
              ))}
            </select>
          </label>

          <label className="reservation-select-control">
            <ArrowUpDown aria-hidden="true" />
            <select
              aria-label="Sort reservations"
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </label>
        </div>

        {error && (
          <p role="alert" className="reservation-error">
            Reservations could not be loaded: {error}
          </p>
        )}
        {facilityError && (
          <p role="status" className="reservation-facility-note">
            {facilityError} Showing reservations without location details.
          </p>
        )}

        <div className="reservation-list" aria-live="polite" aria-busy={loading}>
          {loading && (
            <div className="student-empty" role="status">
              Loading reservations...
            </div>
          )}

          {!loading && shown.length === 0 && (
            <div className="student-empty">
              <span className="student-empty-icon">
                <CalendarDays size={28} aria-hidden="true" />
              </span>
              <h2>
                {items.length === 0
                  ? "No reservations yet"
                  : "No reservations match these filters"}
              </h2>
              <p>
                {items.length === 0
                  ? "Find a space for your next study session, meeting, or team project."
                  : "Try another status, date range, or search term to find a reservation."}
              </p>
              {items.length === 0 ? (
                <Link to="/search">Explore campus spaces <ArrowRight size={15} /></Link>
              ) : (
                <button
                  type="button"
                  className="reservation-clear-filters"
                  onClick={() => {
                    setTab("all");
                    setQuery("");
                    setDateRange("all");
                    setSpaceId("all");
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {!loading && shown.map((reservation) => {
            const facility = facilityById.get(String(reservation.facility_id));
            const name =
              reservation.facility_name || `Facility #${reservation.facility_id}`;
            const location = getLocation(facility);
            const photoIndex =
              Math.abs(Number(reservation.facility_id) || 0) % ROOM_PHOTOS.length;
            const attendeeCount = reservation.attendees ?? 1;
            const canCancel =
              ["pending", "approved"].includes(reservation.status) &&
              new Date(reservation.end_time).getTime() > now;
            const statusClass =
              reservation.status === "denied" ? "cancelled" : reservation.status;
            const StatusIcon =
              reservation.status === "pending"
                ? Clock3
                : ["denied", "cancelled"].includes(reservation.status)
                  ? XCircle
                  : CheckCircle2;

            return (
              <article key={reservation.id} className="reservation-card">
                <img
                  className="reservation-photo"
                  src={ROOM_PHOTOS[photoIndex]}
                  alt=""
                  loading="lazy"
                />
                <div className="reservation-primary">
                  <h2>{name}</h2>
                  <p><MapPin aria-hidden="true" /> {location}</p>
                  {reservation.status === "denied" && reservation.rejection_reason && (
                    <small className="reservation-rejection">
                      Rejected: {reservation.rejection_reason}
                    </small>
                  )}
                </div>
                <div className="reservation-schedule">
                  <span><CalendarDays aria-hidden="true" /> {formatDate(reservation.start_time)}</span>
                  <span><Clock3 aria-hidden="true" /> {formatTime(reservation.start_time)} – {formatTime(reservation.end_time)}</span>
                </div>
                <span className="reservation-attendees">
                  <Users aria-hidden="true" />
                  {attendeeCount} {attendeeCount === 1 ? "person" : "people"}
                </span>
                <span className={`reservation-status is-${statusClass}`}>
                  <StatusIcon aria-hidden="true" />
                  {STATUS_LABEL[reservation.status] || reservation.status}
                </span>
                <div className="reservation-actions">
                  <Link
                    className="reservation-view-button"
                    to={`/spaces/${reservation.facility_id}`}
                  >
                    <Eye aria-hidden="true" />
                    View Details
                  </Link>
                  {canCancel && (
                    <button
                      type="button"
                      disabled={busyId === reservation.id}
                      onClick={() => handleCancel(reservation.id)}
                      aria-label={`Cancel reservation for ${name}`}
                      className="reservation-cancel-button"
                    >
                      <Trash2 aria-hidden="true" />
                      {busyId === reservation.id ? "Cancelling..." : "Cancel"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </StudentLayout>
  );
}
