
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Clock3,
  CheckCircle2,
  UserX,
  RefreshCw,
} from "lucide-react";
import { AdminLayout } from "../../layouts/AdminLayout";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export function ReportsPage() {
  const [reservations, setReservations] = useState([]);
  const [noShows, setNoShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadReports() {
      setLoading(true);
      setError("");

      try {
        const token = sessionStorage.getItem("access_token");

        if (!token) {
          throw new Error("Please log in as an administrator.");
        }

        const headers = {
          Authorization: `Bearer ${token}`,
        };

        const [reservationsResponse, noShowsResponse] =
          await Promise.all([
            fetch(`${API_BASE_URL}/admin/reservations`, {
              headers,
              signal: controller.signal,
            }),
            fetch(`${API_BASE_URL}/admin/no-shows`, {
              headers,
              signal: controller.signal,
            }),
          ]);

        if (!reservationsResponse.ok || !noShowsResponse.ok) {
          if (
            reservationsResponse.status === 401 ||
            noShowsResponse.status === 401
          ) {
            throw new Error("Session expired. Please log in again.");
          }

          if (
            reservationsResponse.status === 403 ||
            noShowsResponse.status === 403
          ) {
            throw new Error("Administrator access is required.");
          }

          throw new Error("Unable to load reports.");
        }

        const reservationsData = await reservationsResponse.json();
        const noShowsData = await noShowsResponse.json();

        if (
          !Array.isArray(reservationsData) ||
          !Array.isArray(noShowsData.no_shows)
        ) {
          throw new Error("Unexpected response from the server.");
        }

        if (!controller.signal.aborted) {
          setReservations(reservationsData);
          setNoShows(noShowsData.no_shows);
        }
      } catch (err) {
        if (err.name !== "AbortError" && !controller.signal.aborted) {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadReports();

    return () => controller.abort();
  }, [refreshKey]);

  const summary = useMemo(() => ({
    total: reservations.length,
    pending: reservations.filter(r => r.status === "pending").length,
    approved: reservations.filter(r => r.status === "approved").length,
    noShows: noShows.length,
  }), [reservations, noShows]);

  const facilityReports = useMemo(() => {
    const grouped = new Map();

    for (const reservation of reservations) {
      const facilityId = reservation.facility_id;
      const key = String(facilityId);

      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          name: reservation.facility_name || `Facility ${facilityId}`,
          total: 0,
          approved: 0,
          pending: 0,
          rejected: 0,
          cancelled: 0,
          noShows: 0,
        });
      }

      const facility = grouped.get(key);
      facility.total += 1;

      if (Object.hasOwn(facility, reservation.status)) {
        facility[reservation.status] += 1;
      }
    }

    for (const noShow of noShows) {
      const facility = grouped.get(String(noShow.facility_id));

      if (facility) {
        facility.noShows += 1;
      }
    }

    return [...grouped.values()].sort((a, b) => b.total - a.total);
  }, [reservations, noShows]);

  const maxRequests = Math.max(
    1,
    ...facilityReports.map(facility => facility.total)
  );

  const cards = [
    {
      label: "Total Reservations",
      value: summary.total,
      Icon: CalendarDays,
    },
    {
      label: "Pending Approvals",
      value: summary.pending,
      Icon: Clock3,
    },
    {
      label: "Approved Reservations",
      value: summary.approved,
      Icon: CheckCircle2,
    },
    {
      label: "No-Shows",
      value: summary.noShows,
      Icon: UserX,
    },
  ];

  return (
    <AdminLayout active="reports">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Reservation Reports
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              All-time reservation activity and facility usage.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setRefreshKey(key => key + 1)}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-destructive p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">
            Loading reports...
          </div>
        ) : !error ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cards.map(({ label, value, Icon }) => (
                <div
                  key={label}
                  className="rounded-xl border bg-card p-5 shadow-card"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {label}
                    </span>
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-3xl font-bold text-foreground">
                    {value}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border bg-card p-6 shadow-card">
              <h2 className="text-lg font-semibold text-foreground">
                Reservations by Facility
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Number of reservation requests for each facility.
              </p>

              <div className="mt-6 space-y-5">
                {facilityReports.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No reservation activity recorded yet.
                  </p>
                ) : (
                  facilityReports.map(facility => (
                    <div key={facility.id}>
                      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-foreground">
                          {facility.name}
                        </span>
                        <span className="text-muted-foreground">
                          {facility.total} requests
                        </span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-blue-600"
                          style={{
                            width: `${(facility.total / maxRequests) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border bg-card shadow-card">
              <div className="p-5">
                <h2 className="text-lg font-semibold text-foreground">
                  Facility Activity Breakdown
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-y bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3">Facility</th>
                      <th className="px-5 py-3">Requests</th>
                      <th className="px-5 py-3">Approved</th>
                      <th className="px-5 py-3">Pending</th>
                      <th className="px-5 py-3">Rejected</th>
                      <th className="px-5 py-3">Cancelled</th>
                      <th className="px-5 py-3">No-Shows</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facilityReports.map(facility => (
                      <tr key={facility.id} className="border-b last:border-0">
                        <td className="px-5 py-4 font-medium text-foreground">
                          {facility.name}
                        </td>
                        <td className="px-5 py-4">{facility.total}</td>
                        <td className="px-5 py-4">{facility.approved}</td>
                        <td className="px-5 py-4">{facility.pending}</td>
                        <td className="px-5 py-4">{facility.rejected}</td>
                        <td className="px-5 py-4">{facility.cancelled}</td>
                        <td className="px-5 py-4">{facility.noShows}</td>
                      </tr>
                    ))}

                    {facilityReports.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-5 py-8 text-center text-muted-foreground"
                        >
                          No facility activity to report.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}
