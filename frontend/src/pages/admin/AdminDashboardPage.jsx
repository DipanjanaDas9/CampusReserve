import { ArrowDown, ArrowUp, Building, CalendarCheck, ClipboardCheck, UserX } from "lucide-react";
import { Link } from "react-router-dom";
import { AdminLayout } from "../../layouts/AdminLayout";
import { SampleDataLabel } from "../../components/SampleDataLabel";
import {
  SAMPLE_MOST_USED,
  SAMPLE_STATS,
  SAMPLE_WEEKLY_RESERVATIONS,
} from "../../data/sampleAdmin";
import { cn } from "../../lib/utils";
import { useEffect, useState } from "react";


export function AdminDashboardPage() {
  const [reservations, setReservations] = useState([]);
  const [noShows, setNoShows] = useState([]);
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

        const [reservationsResponse, noShowsResponse] =
          await Promise.all([
            fetch(`${baseUrl}/admin/reservations`, { headers }),
            fetch(`${baseUrl}/admin/no-shows`, { headers }),
          ]);

        if (!reservationsResponse.ok || !noShowsResponse.ok) {
          throw new Error("Could not load admin dashboard statistics.");
        }

        const reservationsData = await reservationsResponse.json();
        const noShowsData = await noShowsResponse.json();

        if (!active) return;

        setReservations(reservationsData);
        setNoShows(noShowsData.no_shows);
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

  
  const cards = [
    {
      label: "Total Reservations",
      value: loading ? "..." : error ? "—" : reservations.length,
      icon: CalendarCheck,
    },
    {
      label: "Facility Utilization (Sample)",
      value: `${SAMPLE_STATS.utilization.value}%`,
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
          <SampleDataLabel />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Monitor and manage campus space reservations</p>

        <section aria-label="Overview" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </section>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <WeeklyChart data={SAMPLE_WEEKLY_RESERVATIONS} />
          <MostUsedSpaces data={SAMPLE_MOST_USED} />
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
  const max = Math.max(...data.map((d) => d.count));
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
  const max = Math.max(...data.map((d) => d.count));
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
