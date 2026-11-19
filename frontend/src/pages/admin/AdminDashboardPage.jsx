import {
  ArrowRight,
  BarChart3,
  Bell,
  Building,
  CalendarCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  MapPin,
  ShieldCheck,
  Users,
  UserX,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { AdminLayout } from "../../layouts/AdminLayout";
import { useEffect, useMemo, useState } from "react";
import { ROOM_PHOTOS } from "../../data/sampleRooms";
import { campusParts } from "../../lib/datetime";

const CAMPUS_TIMEZONE = "America/Chicago";

function getCampusDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    key: `${values.year}-${values.month}-${values.day}`,
  };
}

function parseTimestamp(value) {
  if (!value || typeof value !== "string") return null;

  let timestamp = value.replace(" ", "T");

  timestamp = timestamp.replace(/([+-]\d{2})$/, "$1:00");

  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(timestamp)) {
    timestamp += "Z";
  }

  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getReservationTrendData(reservations, numberOfDays = 30) {
  const today = getCampusDateParts(new Date());

  // Anchor at UTC noon to generate stable calendar dates.
  const firstDay = new Date(
    Date.UTC(today.year, today.month - 1, today.day - numberOfDays + 1, 12)
  );

  const days = Array.from({ length: numberOfDays }, (_, index) => {
    const date = new Date(firstDay);
    date.setUTCDate(firstDay.getUTCDate() + index);

    const parts = getCampusDateParts(date);

    return {
      key: parts.key,
      label: date.toLocaleDateString("en-US", {
        timeZone: CAMPUS_TIMEZONE,
        month: "short",
        day: "numeric",
      }),
      count: 0,
    };
  });

  const byDate = new Map(
    days.map((day) => [day.key, day])
  );

  for (const reservation of reservations) {
    const created = parseTimestamp(reservation.created_at);
    if (!created) continue;

    const key = getCampusDateParts(created).key;
    const day = byDate.get(key);

    if (day) {
      day.count += 1;
    }
  }

  return days;
}

function getMostUsedSpaces(reservations) {
  const counts = new Map();

  for (const reservation of reservations) {
    if (
      !reservation.checked_in_at ||
      reservation.status !== "approved"
    ) {
      continue;
    }

    const id = reservation.facility_id;

    if (!counts.has(id)) {
      counts.set(id, {
        room:
          reservation.facility_name ||
          `Facility #${id}`,
        count: 0,
      });
    }

    counts.get(id).count += 1;
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function calculateFacilityUtilization(facilities, reservations) {
  const dayKeys = new Set(
    getReservationTrendData([], 7).map((day) => day.key)
  );

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  function parseTime(value) {
    if (!value) return null;

    const parts = String(value).split(":").map(Number);

    if (
      parts.length !== 2 ||
      !Number.isInteger(parts[0]) ||
      !Number.isInteger(parts[1]) ||
      parts[0] < 0 ||
      parts[0] > 23 ||
      parts[1] < 0 ||
      parts[1] > 59
    ) {
      return null;
    }

    return parts[0] * 60 + parts[1];
  }

  const schedules = facilities
    .map((facility) => ({
      id: Number(facility.id),
      opening: parseTime(facility.opening_time),
      closing: parseTime(facility.closing_time),
    }))
    .filter(
      (facility) =>
        facility.opening !== null &&
        facility.closing !== null &&
        facility.closing > facility.opening
    );

  if (schedules.length === 0) return null;

  const bookings = reservations
    .filter((r) => r.status === "approved")
    .map((r) => ({
      facilityId: Number(r.facility_id),
      start: new Date(r.start_time).getTime(),
      end: new Date(r.end_time).getTime(),
    }))
    .filter(
      (r) =>
        Number.isFinite(r.start) &&
        Number.isFinite(r.end) &&
        r.end > r.start
    );

  let availableMinutes = 0;
  let bookedMinutes = 0;

  const now = Date.now();
  const minute = 60 * 1000;

  // Scan elapsed minutes, respecting campus local dates and DST.
  const firstMinute = Math.floor(
    (now - 8 * 24 * 60 * minute) / minute
  ) * minute;

  for (let time = firstMinute; time < now; time += minute) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(time))
        .map(({ type, value }) => [type, value])
    );

    const dateKey =
      `${parts.year}-${parts.month}-${parts.day}`;

    if (!dayKeys.has(dateKey)) continue;

    const localMinute =
      Number(parts.hour) * 60 + Number(parts.minute);

    for (const facility of schedules) {
      if (
        localMinute < facility.opening ||
        localMinute >= facility.closing
      ) {
        continue;
      }

      availableMinutes += 1;

      const occupied = bookings.some(
        (booking) =>
          booking.facilityId === facility.id &&
          booking.start < time + minute &&
          booking.end > time
      );

      if (occupied) {
        bookedMinutes += 1;
      }
    }
  }

  return availableMinutes > 0
    ? (bookedMinutes / availableMinutes) * 100
    : null;
}



export function AdminDashboardPage() {
  const [reservations, setReservations] = useState([]);
  const [noShows, setNoShows] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedAt, setLoadedAt] = useState(0); // when the data was fetched; "ended" is judged against it
  const [busyReservationId, setBusyReservationId] = useState(null);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      try {
        const token = sessionStorage.getItem("access_token");

        if (!token) {
          throw new Error("Please log in as an administrator.");
        }

        const baseUrl = (
          import.meta.env.VITE_BOOKING_API_BASE_URL ||
          "http://localhost:8000"
        ).replace(/\/$/, "");

        const headers = {
          Authorization: `Bearer ${token}`,
        };

        const [
          reservationsResponse,
          noShowsResponse,
          facilitiesResponse,
          notificationsResponse,
        ] = await Promise.all([
          fetch(`${baseUrl}/admin/reservations`, { headers }),
          fetch(`${baseUrl}/admin/no-shows`, { headers }),
          fetch(`${baseUrl}/facilities`, { headers }),
          fetch(`${baseUrl}/notifications`, { headers }),
        ]);

        if (
          !reservationsResponse.ok ||
          !noShowsResponse.ok ||
          !facilitiesResponse.ok ||
          !notificationsResponse.ok
        ) {
          throw new Error("Could not load admin dashboard data.");
        }

        const [
          reservationsData,
          noShowsData,
          facilitiesData,
          notificationsData,
        ] = await Promise.all([
          reservationsResponse.json(),
          noShowsResponse.json(),
          facilitiesResponse.json(),
          notificationsResponse.json(),
        ]);

        if (
          !Array.isArray(reservationsData) ||
          !Array.isArray(noShowsData.no_shows) ||
          !Array.isArray(facilitiesData) ||
          !Array.isArray(notificationsData)
        ) {
          throw new Error("The server returned unexpected dashboard data.");
        }

        if (!active) return;

        setReservations(reservationsData);
        setNoShows(noShowsData.no_shows);
        setFacilities(facilitiesData);
        setNotifications(notificationsData);
        setLoadedAt(Date.now());
        setError("");
      } catch (err) {
        if (active) {
          setError(err.message || "Could not load dashboard.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }


    loadDashboard();

    return () => {
      active = false;
    };
  }, []);

  const pending = reservations.filter(
    (r) => r.status === "pending"
  ).length;

  const now = loadedAt;

  const endedApproved = reservations.filter(
    (r) =>
      r.status === "approved" &&
      new Date(r.end_time).getTime() <= now
  );

  const noShowRate = endedApproved.length
    ? (noShows.length / endedApproved.length) * 100
    : 0;

  const trendData = getReservationTrendData(reservations);
  const mostUsedSpaces = getMostUsedSpaces(reservations);
  const pendingRequests = reservations
    .filter((reservation) => reservation.status === "pending")
    .slice(0, 5);
  const activeFacilities = facilities.filter(isFacilityActive);
  const utilization = useMemo(
    () => calculateFacilityUtilization(facilities, reservations),
    [facilities, reservations]
  );

  const cards = [
    {
      label: "Total Reservations",
      value: loading ? "…" : error ? "—" : reservations.length.toLocaleString(),
      caption: "All requests",
      icon: CalendarCheck,
    },
    {
      label: "Facility Utilization",
      value: loading
        ? "…"
        : error
          ? "—"
          : utilization === null
            ? "N/A"
            : `${utilization.toFixed(1)}%`,
      caption: "Last 7 days",
      icon: Building,
    },
    {
      label: "Pending Approvals",
      value: loading ? "…" : error ? "—" : pending.toLocaleString(),
      caption: "Awaiting review",
      icon: ClipboardCheck,
      to: "/admin/approvals?status=pending",
    },
    {
      label: "Active Facilities",
      value: loading ? "…" : error ? "—" : activeFacilities.length.toLocaleString(),
      caption: "Ready to reserve",
      icon: Building,
      to: "/admin/facilities",
    },
    {
      label: "No-Show Rate",
      value: loading ? "…" : error ? "—" : `${noShowRate.toFixed(1)}%`,
      caption: `${noShows.length} recorded no-shows`,
      icon: UserX,
    },
  ];

  async function decideReservation(reservation, status) {
    let reason = "";
    if (status === "denied") {
      const enteredReason = window.prompt(
        `Why are you denying ${reservation.requester_name || "this reservation"}?`
      );
      if (enteredReason === null) return;
      reason = enteredReason.trim();
      if (!reason) {
        setActionMessage("Please provide a reason before denying a request.");
        return;
      }
    }

    setBusyReservationId(reservation.id);
    setActionMessage("");
    try {
      const token = sessionStorage.getItem("access_token");
      const response = await fetch(
        `${(import.meta.env.VITE_BOOKING_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "")}/reservations/${reservation.id}/decision`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status, reason: reason || null }),
        }
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof result?.detail === "string"
            ? result.detail
            : "Could not update this reservation."
        );
      }

      setReservations((previous) =>
        previous.map((item) =>
          item.id === reservation.id
            ? {
                ...item,
                status,
                rejection_reason: status === "denied" ? reason : null,
              }
            : item
        )
      );
      setActionMessage(
        `Reservation ${status === "approved" ? "approved" : "denied"}.`
      );
    } catch (decisionError) {
      setActionMessage(
        decisionError.message || "Could not update this reservation."
      );
    } finally {
      setBusyReservationId(null);
    }
  }


  return (
    <AdminLayout active="dashboard">
      <div className="admin-dashboard-page mx-auto max-w-6xl">
        <header
          className="campus-page-banner admin-dashboard-banner"
          style={{
            "--admin-dashboard-hero-image":
              'url("https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1800&q=85")',
          }}
        >
          <div className="admin-dashboard-banner-copy">
            <h1>
              Administrator Dashboard
              <ShieldCheck aria-hidden="true" />
            </h1>
            <p>Manage facilities, reservations, users, and campus space operations.</p>
          </div>
        </header>

        {error && <p className="admin-dashboard-error" role="alert">{error}</p>}

        <section className="admin-dashboard-metrics" aria-label="Reservation overview">
          {cards.map((card) => <StatCard key={card.label} {...card} />)}
        </section>

        <div className="admin-dashboard-grid">
          <QuickActions />
          <ReservationsTrend data={trendData} />
          <MostUsedSpaces data={mostUsedSpaces} />
          <PendingRequests
            requests={pendingRequests}
            busyReservationId={busyReservationId}
            actionMessage={actionMessage}
            onDecision={decideReservation}
          />
          <RecentActivity notifications={notifications} loading={loading} />
        </div>

        <FacilitySnapshot facilities={activeFacilities} loading={loading} />
      </div>
    </AdminLayout>
  );
}

function isFacilityActive(facility) {
  return facility.is_active !== false && facility.is_active !== 0;
}

function StatCard({ label, value, caption, icon: Icon, to }) {
  const body = (
    <>
      <span className="admin-dashboard-metric-icon">
        <Icon aria-hidden="true" />
      </span>
      <span className="admin-dashboard-metric-copy">
        <span className="admin-dashboard-metric-label">{label}</span>
        <strong className="admin-dashboard-metric-value">{value}</strong>
        <span className="admin-dashboard-metric-caption">{caption}</span>
      </span>
    </>
  );
  return to ? (
    <Link to={to} className="admin-dashboard-metric is-link">
      {body}
    </Link>
  ) : (
    <div className="admin-dashboard-metric">{body}</div>
  );
}

function QuickActions() {
  const actions = [
    { label: "Manage Facilities", description: "Add, edit, and organize spaces", to: "/admin/facilities", icon: Building },
    { label: "Reservation Requests", description: "Browse and manage all bookings", to: "/admin/approvals", icon: CalendarCheck },
    { label: "Users", description: "Manage student and admin accounts", to: "/admin/users", icon: Users },
    { label: "Reports", description: "Review usage and reservation insights", to: "/admin/reports", icon: BarChart3 },
    { label: "Notifications", description: "Review updates and messages", to: "/admin/notifications", icon: Bell },
  ];

  return (
    <section className="admin-dashboard-card admin-quick-actions" aria-labelledby="quick-actions-heading">
      <header className="admin-dashboard-section-heading">
        <h2 id="quick-actions-heading">Quick Admin Actions</h2>
      </header>
      <nav aria-label="Quick admin actions" className="admin-quick-actions-list">
        {actions.map(({ label, description, to, icon: Icon }) => (
          <Link key={to} to={to} className="admin-quick-action">
            <span className="admin-quick-action-icon"><Icon aria-hidden="true" /></span>
            <span className="admin-quick-action-copy">
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </section>
  );
}

function ReservationsTrend({ data }) {
  const chart = buildTrendChart(data);
  const xLabels = [0, 6, 12, 18, 24, data.length - 1];
  const tickIntervals = Math.min(chart.max, 4);
  const ticks = Array.from({ length: tickIntervals + 1 }, (_, index) => index / tickIntervals);

  return (
    <section className="admin-dashboard-card admin-reservations-trend" aria-labelledby="reservations-trend-heading">
      <header className="admin-dashboard-section-heading">
        <div className="admin-dashboard-heading-with-icon">
          <BarChart3 aria-hidden="true" />
          <h2 id="reservations-trend-heading">Reservations Trend</h2>
        </div>
        <Link to="/admin/reports" className="admin-dashboard-view-link">View All <ArrowRight aria-hidden="true" /></Link>
      </header>
      <div className="admin-trend-subheading">
        <span>Reservation requests</span>
        <span className="admin-trend-range">Last 30 Days <Clock3 aria-hidden="true" /></span>
      </div>
      <svg
        className="admin-trend-chart"
        viewBox="0 0 640 230"
        role="img"
        aria-label="Daily reservation requests for the last 30 days"
      >
        <defs>
          <linearGradient id="reservation-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0d6dfd" stopOpacity=".24" />
            <stop offset="100%" stopColor="#0d6dfd" stopOpacity=".02" />
          </linearGradient>
        </defs>
        {ticks.map((fraction) => {
          const y = chart.bottom - fraction * chart.height;
          return (
            <g key={fraction} className="admin-trend-gridline">
              <line x1={chart.left} x2={chart.right} y1={y} y2={y} />
              <text x={chart.left - 10} y={y + 4} textAnchor="end">
                {Math.round(chart.max * fraction)}
              </text>
            </g>
          );
        })}
        <path d={chart.areaPath} fill="url(#reservation-area)" />
        <path d={chart.linePath} className="admin-trend-line" />
        {chart.points.map(({ x, y, label, count }) => (
          <circle
            key={label}
            cx={x}
            cy={y}
            r={count === chart.max && count > 0 ? 4 : 2}
            className={count === chart.max && count > 0 ? "is-peak" : ""}
          >
            <title>{`${label}: ${count} reservations`}</title>
          </circle>
        ))}
        {xLabels.map((index) => {
          const point = chart.points[index];
          if (!point) return null;
          return (
            <text
              key={point.label}
              x={point.x}
              y={chart.bottom + 22}
              textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
              className="admin-trend-date"
            >
              {point.label}
            </text>
          );
        })}
      </svg>
      <DataTable caption="Reservations per day over the last 30 days" rows={data.map(({ label, count }) => [label, count])} />
    </section>
  );
}

function buildTrendChart(data) {
  const left = 42;
  const right = 624;
  const top = 14;
  const bottom = 188;
  const max = Math.max(1, ...data.map(({ count }) => count));
  const width = right - left;
  const height = bottom - top;
  const points = data.map(({ label, count }, index) => ({
    label,
    count,
    x: left + (index / Math.max(data.length - 1, 1)) * width,
    y: bottom - (count / max) * height,
  }));
  const linePath = points
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");
  const first = points[0];
  const last = points[points.length - 1];

  return {
    left,
    right,
    top,
    bottom,
    width,
    height,
    max,
    points,
    linePath,
    areaPath: `${linePath} L ${last.x} ${bottom} L ${first.x} ${bottom} Z`,
  };
}

function MostUsedSpaces({ data }) {
  const max = Math.max(1, ...data.map((space) => space.count));

  return (
    <section className="admin-dashboard-card admin-most-used" aria-labelledby="most-used-heading">
      <header className="admin-dashboard-section-heading">
        <div className="admin-dashboard-heading-with-icon">
          <span className="admin-most-used-icon"><Building aria-hidden="true" /></span>
          <h2 id="most-used-heading">Most-Used Spaces</h2>
        </div>
        <Link to="/admin/reports" className="admin-dashboard-view-link">View All <ArrowRight aria-hidden="true" /></Link>
      </header>
      {data.length === 0 ? (
        <p className="admin-dashboard-empty">No checked-in reservations recorded yet.</p>
      ) : (
        <ul className="admin-most-used-list">
          {data.slice(0, 5).map(({ room, count }) => (
            <li key={room} className="admin-most-used-row">
              <span className="admin-most-used-mark"><Building aria-hidden="true" /></span>
              <span className="admin-most-used-name">
                <strong>{room}</strong>
                <small>{count} {count === 1 ? "reservation" : "reservations"}</small>
              </span>
              <span className="admin-most-used-track" aria-label={`${Math.round((count / max) * 100)} percent of top space usage`}>
                <span style={{ width: `${(count / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PendingRequests({
  requests,
  busyReservationId,
  actionMessage,
  onDecision,
}) {
  return (
    <section className="admin-dashboard-card admin-pending-requests" aria-labelledby="pending-requests-heading">
      <header className="admin-dashboard-section-heading">
        <div className="admin-dashboard-heading-with-icon">
          <CheckCircle2 aria-hidden="true" />
          <h2 id="pending-requests-heading">Pending Approval Requests</h2>
        </div>
        <Link to="/admin/approvals" className="admin-dashboard-view-link">
          View All ({requests.length}) <ArrowRight aria-hidden="true" />
        </Link>
      </header>
      {actionMessage && <p className="admin-action-message" role="status">{actionMessage}</p>}
      <div className="admin-pending-table-wrap">
        <table className="admin-pending-table">
          <thead>
            <tr>
              <th scope="col">Requester</th>
              <th scope="col">Space</th>
              <th scope="col">Date / Time</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((reservation) => {
              const start = campusParts(reservation.start_time);
              const end = campusParts(reservation.end_time);
              const isBusy = busyReservationId === reservation.id;
              return (
                <tr key={reservation.id}>
                  <td>
                    <span className="admin-requester">
                      <span className="admin-requester-avatar">{getInitials(reservation.requester_name)}</span>
                      <span>
                        <strong>{reservation.requester_name || reservation.requester_email || "Student"}</strong>
                        <small>Student</small>
                      </span>
                    </span>
                  </td>
                  <td>{reservation.facility_name || `Facility #${reservation.facility_id}`}</td>
                  <td>
                    <span className="admin-request-time">{start.date}</span>
                    <small>{start.time} – {end.time}</small>
                  </td>
                  <td><span className="admin-pending-badge">Pending</span></td>
                  <td>
                    <span className="admin-request-actions">
                      <button
                        type="button"
                        className="admin-approve-button"
                        aria-label={`Approve reservation ${reservation.id}`}
                        disabled={isBusy}
                        onClick={() => onDecision(reservation, "approved")}
                      >
                        <Check aria-hidden="true" /> Approve
                      </button>
                      <button
                        type="button"
                        className="admin-deny-button"
                        aria-label={`Deny reservation ${reservation.id}`}
                        disabled={isBusy}
                        onClick={() => onDecision(reservation, "denied")}
                      >
                        <X aria-hidden="true" /> Deny
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
            {requests.length === 0 && (
              <tr>
                <td colSpan={5} className="admin-table-empty">No pending requests right now.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RecentActivity({ notifications, loading }) {
  return (
    <section className="admin-dashboard-card admin-recent-activity" aria-labelledby="recent-activity-heading">
      <header className="admin-dashboard-section-heading">
        <div className="admin-dashboard-heading-with-icon">
          <Clock3 aria-hidden="true" />
          <h2 id="recent-activity-heading">Recent Activity</h2>
        </div>
        <Link to="/admin/notifications" className="admin-dashboard-view-link">View All <ArrowRight aria-hidden="true" /></Link>
      </header>
      {loading ? (
        <p className="admin-dashboard-empty">Loading activity…</p>
      ) : notifications.length === 0 ? (
        <p className="admin-dashboard-empty">No recent activity yet.</p>
      ) : (
        <ul className="admin-activity-list">
          {notifications.slice(0, 5).map((notification) => {
            const Icon = getActivityIcon(notification);
            return (
              <li key={notification.id} className="admin-activity-item">
                <span className="admin-activity-icon"><Icon aria-hidden="true" /></span>
                <span className="admin-activity-copy">
                  <strong>{notification.title}</strong>
                  <small>{notification.body}</small>
                </span>
                <time dateTime={notification.created_at}>{formatRelativeTime(notification.created_at)}</time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FacilitySnapshot({ facilities, loading }) {
  return (
    <section className="admin-dashboard-card admin-facility-snapshot" aria-labelledby="facility-snapshot-heading">
      <header className="admin-dashboard-section-heading">
        <div className="admin-dashboard-heading-with-icon">
          <Building aria-hidden="true" />
          <h2 id="facility-snapshot-heading">Facility Management Snapshot</h2>
        </div>
        <Link to="/admin/facilities" className="admin-dashboard-view-link">View All Facilities <ArrowRight aria-hidden="true" /></Link>
      </header>
      {loading ? (
        <p className="admin-dashboard-empty">Loading facilities…</p>
      ) : facilities.length === 0 ? (
        <p className="admin-dashboard-empty">No active facilities are available.</p>
      ) : (
        <div className="admin-facility-grid">
          {facilities.slice(0, 4).map((facility, index) => {
            const location = [
              facility.building_name,
              facility.floor_number !== null && facility.floor_number !== undefined
                ? `Floor ${facility.floor_number}`
                : null,
            ].filter(Boolean).join(" · ") || facility.location || "Campus facility";
            return (
              <Link to="/admin/facilities" key={facility.id} className="admin-facility-card">
                <span className="admin-facility-image-wrap">
                  <img
                    src={facility.image_url || ROOM_PHOTOS[index % ROOM_PHOTOS.length]}
                    alt=""
                    loading="lazy"
                  />
                </span>
                <span className="admin-facility-card-content">
                  <strong>{facility.name}</strong>
                  <small><MapPin aria-hidden="true" /> {location}</small>
                  <span className="admin-facility-meta">
                    <span>Capacity: {facility.capacity}</span>
                    <span className="admin-facility-active"><span aria-hidden="true" /> Active</span>
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function getActivityIcon(notification) {
  const description = `${notification.title} ${notification.body}`.toLowerCase();
  if (description.includes("facility") || description.includes("space")) return Building;
  if (description.includes("approved") || description.includes("confirmed")) return CheckCircle2;
  if (description.includes("request") || description.includes("reservation")) return CalendarDays;
  if (description.includes("user") || description.includes("account")) return Users;
  return Bell;
}

function getInitials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase() || "ST";
}

function formatRelativeTime(value) {
  const date = parseTimestamp(value);
  if (!date) return "Unknown time";

  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days} day${days === 1 ? "" : "s"} ago` : date.toLocaleDateString();
}

function DataTable({ caption, rows }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
