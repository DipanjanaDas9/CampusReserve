import { ArrowDown, ArrowUp, Building, CalendarCheck, ClipboardCheck, UserX } from "lucide-react";
import { Link } from "react-router-dom";
import { AdminLayout } from "../../layouts/AdminLayout";
import { SampleDataLabel } from "../../components/SampleDataLabel";
import { cn } from "../../lib/utils";
import { useEffect, useMemo, useState } from "react";

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

function getWeeklyReservationData(reservations) {
  const today = getCampusDateParts(new Date());

  // Anchor at UTC noon to generate stable calendar dates.
  const firstDay = new Date(
    Date.UTC(today.year, today.month - 1, today.day - 6, 12)
  );

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(firstDay);
    date.setUTCDate(firstDay.getUTCDate() + index);

    const parts = getCampusDateParts(date);

    return {
      key: parts.key,
      day: date.toLocaleDateString("en-US", {
        timeZone: CAMPUS_TIMEZONE,
        weekday: "short",
      }),
      count: 0,
    };
  });

  const byDate = new Map(
    days.map((day) => [day.key, day])
  );

  for (const reservation of reservations) {
    if (!reservation.created_at) continue;

    // SQLite CURRENT_TIMESTAMP is stored in UTC.
    // Normalize PostgreSQL timestamps for JavaScript.
    let timestamp = reservation.created_at.replace(" ", "T");

    // Convert timezone offsets such as +00 or -06 to +00:00 or -06:00.
    timestamp = timestamp.replace(/([+-]\d{2})$/, "$1:00");

    // Assume UTC only when no timezone is provided.
    if (!/(Z|[+-]\d{2}:\d{2})$/i.test(timestamp)) {
      timestamp += "Z";
    }

    const created = new Date(timestamp);

    if (Number.isNaN(created.getTime())) continue;

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
    getWeeklyReservationData([]).map((day) => day.key)
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        ] = await Promise.all([
          fetch(`${baseUrl}/admin/reservations`, { headers }),
          fetch(`${baseUrl}/admin/no-shows`, { headers }),
          fetch(`${baseUrl}/facilities`, { headers }),
        ]);

        if (
          !reservationsResponse.ok ||
          !noShowsResponse.ok ||
          !facilitiesResponse.ok
        ) {
          throw new Error("Could not load admin dashboard statistics.");
        }

        const [
          reservationsData,
          noShowsData,
          facilitiesData,
        ] = await Promise.all([
          reservationsResponse.json(),
          noShowsResponse.json(),
          facilitiesResponse.json(),
        ]);

        if (!active) return;

        setReservations(reservationsData);
        setNoShows(noShowsData.no_shows);
        setFacilities(facilitiesData);
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

  const now = Date.now();

  const endedApproved = reservations.filter(
    (r) =>
      r.status === "approved" &&
      new Date(r.end_time).getTime() <= now
  );

  const noShowRate = endedApproved.length
    ? (noShows.length / endedApproved.length) * 100
    : 0;

  const weeklyReservations = getWeeklyReservationData(reservations);
  const mostUsedSpaces = getMostUsedSpaces(reservations);
  const utilization = useMemo(
    () => calculateFacilityUtilization(facilities, reservations),
    [facilities, reservations]
  );

  const cards = [
    {
      label: "Total Reservations",
      value: loading ? "..." : error ? "—" : reservations.length,
      icon: CalendarCheck,
    },
    {
      label: "Reserved Facility Utilization (7 Days)",
      value: loading
        ? "..."
        : error
          ? "—"
          : utilization === null
            ? "N/A"
            : `${utilization.toFixed(1)}%`,
      icon: Building,
    },
    {
      label: "Pending Approvals",
      value: loading ? "..." : error ? "—" : pending,
      icon: ClipboardCheck,
      to: "/admin/approvals",
    },
    {
      label: "No-Show Rate",
      value: loading ? "..." : error ? "—" : `${noShowRate.toFixed(1)}%`,
      icon: UserX,
      higherIsWorse: true,
    },
  ];


  return (
    <AdminLayout active="dashboard">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Monitor and manage campus space reservations</p>

        <section aria-label="Overview" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </section>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <WeeklyChart data={weeklyReservations} />
          <MostUsedSpaces data={mostUsedSpaces} />
        </div>
        
        <section className="mt-6 rounded-xl border bg-card p-5 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-foreground">
              No-Show Tracking
            </h2>
            <span className="text-sm text-muted-foreground">
              {loading ? "Loading..." : `${noShows.length} no-shows`}
            </span>
          </div>

          {error && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          )}

          {!loading && !error && noShows.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              No no-shows recorded.
            </p>
          )}

          {!loading && !error && noShows.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Reservation</th>
                    <th className="px-3 py-3">Student</th>
                    <th className="px-3 py-3">Facility</th>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {noShows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-3 py-3">R-{r.id}</td>
                      <td className="px-3 py-3">
                        {r.requester_name}
                      </td>
                      <td className="px-3 py-3">
                        {r.facility_name}
                      </td>
                      <td className="px-3 py-3">
                        {new Date(r.start_time).toLocaleDateString(
                          "en-US",
                          { timeZone: "America/Chicago" }
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-full bg-destructive/15 px-2.5 py-1 text-xs font-medium text-destructive">
                          No-show
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}

const trendColor = (change, higherIsWorse) => ((change > 0) !== Boolean(higherIsWorse) ? "text-success" : "text-destructive");

function StatCard({ label, value, change, icon: Icon, to, higherIsWorse }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        {label}
        <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
      </div>
      <div className="mt-2 text-3xl font-bold text-foreground">{value}</div>
      {change !== undefined && (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {change > 0 ? <ArrowUp className={cn("h-3.5 w-3.5", trendColor(change, higherIsWorse))} aria-hidden="true" /> : <ArrowDown className={cn("h-3.5 w-3.5", trendColor(change, higherIsWorse))} aria-hidden="true" />}
          {Math.abs(change)}% vs last week
        </p>
      )}
      {to && <p className="mt-1 text-xs font-medium text-primary">Review requests →</p>}
    </>
  );
  const className = "rounded-xl border bg-card p-5 shadow-card";
  return to ? (
    <Link to={to} className={cn(className, "hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** Vertical bar chart drawn with divs; the values are also in a visually hidden table. */
function WeeklyChart({ data }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <section className="rounded-xl border bg-card p-5 shadow-card" aria-labelledby="weekly-heading">
      <h2 id="weekly-heading" className="font-semibold text-foreground">Reservations (Last 7 Days)</h2>
      <div className="mt-4 flex h-48 items-end gap-3" aria-hidden="true">
        {data.map(({ day, count }) => (
          <div key={day} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs text-muted-foreground">{count}</span>
            <div className="w-full max-w-10 rounded-t-md bg-primary" style={{ height: `${(count / max) * 100}%` }} />
            <span className="text-xs text-muted-foreground">{day}</span>
          </div>
        ))}
      </div>
      <DataTable caption="Reservations per day" rows={data.map((d) => [d.day, d.count])} />
    </section>
  );
}

function MostUsedSpaces({ data }) {
  const max = Math.max(1, ...data.map((d) => d.count));

  if (data.length === 0) {
    return (
      <section className="rounded-xl border bg-card p-5 shadow-card">
        <h2 className="font-semibold text-foreground">
          Most Used Spaces
        </h2>
        <p className="mt-4 text-sm text-muted-foreground">
          No checked-in reservations recorded yet.
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-xl border bg-card p-5 shadow-card" aria-labelledby="most-used-heading">
      <h2 id="most-used-heading" className="font-semibold text-foreground">Most Used Spaces</h2>
      <ul className="mt-4 space-y-3" aria-hidden="true">
        {data.map(({ room, count }) => (
          <li key={room} className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-3 text-sm">
            <span className="truncate text-foreground">{room}</span>
            <div className="h-3 rounded-full bg-secondary">
              <div className="h-3 rounded-full bg-primary" style={{ width: `${(count / max) * 100}%` }} />
            </div>
            <span className="text-right text-muted-foreground">{count}</span>
          </li>
        ))}
      </ul>
      <DataTable caption="Reservations per space" rows={data.map((d) => [d.room, d.count])} />
    </section>
  );
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
