import { ArrowDown, ArrowUp, Building, CalendarCheck, ClipboardCheck, UserX } from "lucide-react";
import { Link } from "react-router-dom";
import { AdminLayout } from "../../layouts/AdminLayout";
import { SampleDataLabel } from "../../components/SampleDataLabel";
import { SAMPLE_MOST_USED, SAMPLE_REQUESTS, SAMPLE_STATS, SAMPLE_WEEKLY_RESERVATIONS } from "../../data/sampleAdmin";
import { cn } from "../../lib/utils";

export function AdminDashboardPage() {
  const pending = SAMPLE_REQUESTS.filter((r) => r.status === "pending").length;
  const cards = [
    { label: "Total Reservations", value: SAMPLE_STATS.totalReservations.value, change: SAMPLE_STATS.totalReservations.change, icon: CalendarCheck },
    { label: "Facility Utilization", value: `${SAMPLE_STATS.utilization.value}%`, change: SAMPLE_STATS.utilization.change, icon: Building },
    { label: "Pending Approvals", value: pending, icon: ClipboardCheck, to: "/admin/approvals" },
    { label: "No-Show Rate", value: `${SAMPLE_STATS.noShowRate.value}%`, change: SAMPLE_STATS.noShowRate.change, icon: UserX, higherIsWorse: true },
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
      </div>
    </AdminLayout>
  );
}

function StatCard({ label, value, change, icon: Icon, to, higherIsWorse }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        {label}
        <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
      </div>
      <div className="mt-2 text-3xl font-bold text-foreground">{value}</div>
      {change !== undefined && (
        <p className={cn("mt-1 flex items-center gap-1 text-xs font-medium", (change > 0) !== Boolean(higherIsWorse) ? "text-success" : "text-destructive")}>
          {change > 0 ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />}
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
