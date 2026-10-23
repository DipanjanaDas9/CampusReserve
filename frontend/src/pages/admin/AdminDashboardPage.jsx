import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Building, CalendarCheck, ClipboardCheck, GraduationCap, UserX } from "lucide-react";
import { AdminLayout } from "../../layouts/AdminLayout";
import { getAdminStats, listAdminReservations } from "../../api/admin";
import { fmtDate, fmtRange } from "../../lib/format";
import { EmptyState, ErrorMessage, Loading, PageHeader, primaryButton } from "../../components/ui";

const CARDS = [
  { key: "pending", label: "Pending approvals", icon: ClipboardCheck, to: "/admin/approvals", tone: "text-chart-1" },
  { key: "approved_today", label: "Approved for today", icon: CalendarCheck, to: "/admin/approvals?status=approved", tone: "text-primary" },
  { key: "upcoming_approved", label: "Upcoming approved", icon: CalendarCheck, to: "/admin/approvals?status=approved", tone: "text-success-strong" },
  { key: "no_shows", label: "No-shows", icon: UserX, to: "/admin/approvals?status=approved", tone: "text-destructive-strong" },
  { key: "rooms", label: "Facilities", icon: Building, to: "/admin/facilities", tone: "text-primary" },
  { key: "students", label: "Registered students", icon: GraduationCap, tone: "text-primary" },
];

export function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getAdminStats(), listAdminReservations("pending")])
      .then(([s, p]) => {
        setStats(s);
        setPending(p);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <AdminLayout active="dashboard">
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Admin Dashboard" subtitle="Reservation requests, usage and facilities at a glance" />
        <ErrorMessage>{error}</ErrorMessage>
        {!stats && !error && <Loading />}
        {stats && (
          <>
            <section aria-label="Overview" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CARDS.map(({ key, label, icon: Icon, to, tone }) => {
                const body = (
                  <>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Icon className={`h-5 w-5 ${tone}`} aria-hidden="true" /> {label}
                    </div>
                    <div className="mt-2 text-3xl font-bold">{stats[key]}</div>
                  </>
                );
                return to ? (
                  <Link key={key} to={to} className="rounded-xl border bg-card p-5 shadow-card hover:border-primary/40">
                    {body}
                  </Link>
                ) : (
                  <div key={key} className="rounded-xl border bg-card p-5 shadow-card">
                    {body}
                  </div>
                );
              })}
            </section>

            <section className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Waiting for approval</h2>
                <Link to="/admin/approvals" className="text-sm font-medium text-primary hover:underline">
                  Review all
                </Link>
              </div>
              {pending.length === 0 ? (
                <EmptyState icon={ClipboardCheck}>No requests are waiting. You're all caught up.</EmptyState>
              ) : (
                <div className="overflow-hidden rounded-xl border bg-card shadow-card">
                  {pending.slice(0, 5).map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center gap-4 border-b px-5 py-4 last:border-b-0">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{r.room.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {fmtDate(r.date)} · {fmtRange(r)} · {r.user.name} · {r.attendees} people
                        </div>
                      </div>
                      <Link to="/admin/approvals" className={primaryButton}>
                        Review
                      </Link>
                    </div>
                  ))}
                </div>
              )}
              {stats.no_shows > 0 && (
                <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 text-chart-1" aria-hidden="true" />
                  {stats.no_shows} approved reservation{stats.no_shows === 1 ? " was" : "s were"} not checked in within 30 minutes of the start.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
