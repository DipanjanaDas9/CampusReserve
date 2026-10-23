import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Building2, CalendarDays, Info, MapPin, Users } from "lucide-react";
import { StudentLayout } from "../layouts/StudentLayout";
import { getRoom } from "../api/rooms";
import { getAvailability, startOfWeek, toISODate } from "../api/availability";
import { fmtDate } from "../lib/format";
import { EquipmentTags, ErrorMessage, Loading, primaryButton } from "../components/ui";

export function FacilityDetailsPage() {
  const { id } = useParams();
  const [loaded, setLoaded] = useState({ id: null, room: null, error: "", freeToday: null });
  const current = loaded.id === id ? loaded : { room: null, error: "", freeToday: null };
  const { room, error, freeToday } = current;

  useEffect(() => {
    let cancelled = false;
    const today = toISODate(new Date());
    Promise.all([
      getRoom(id),
      getAvailability(id, startOfWeek(new Date())).catch(() => null),
    ])
      .then(([r, availability]) => {
        if (cancelled) return;
        const free = availability ? availability.slots.filter((s) => s.date === today && s.status === "available").length : null;
        setLoaded({ id, room: r, error: "", freeToday: free });
      })
      .catch((e) => !cancelled && setLoaded({ id, room: null, error: e.message, freeToday: null }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <StudentLayout active="search">
      <div className="mx-auto max-w-3xl">
        <Link to="/search" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to search
        </Link>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        {!room && !error && <Loading label="Loading facility…" />}
        {room && (
          <article className="overflow-hidden rounded-xl border bg-card shadow-card">
            <div className="flex h-36 items-center justify-center bg-secondary">
              <Building2 className="h-12 w-12 text-primary" aria-hidden="true" />
            </div>
            <div className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h1 className="text-2xl font-bold">{room.name}</h1>
                {room.is_sample && <span className="rounded-full bg-chart-4/25 px-2.5 py-0.5 text-xs font-medium">Sample room</span>}
              </div>
              <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <dt className="sr-only">Location</dt>
                  <dd>{room.location}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <dt className="sr-only">Capacity</dt>
                  <dd>Up to {room.capacity} people</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="mb-1.5 font-medium">Equipment</dt>
                  <dd>
                    <EquipmentTags items={room.equipment} />
                  </dd>
                </div>
                {room.description && (
                  <div className="sm:col-span-2">
                    <dt className="mb-1 font-medium">About this space</dt>
                    <dd className="text-muted-foreground">{room.description}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-6 flex flex-wrap items-center gap-4 border-t pt-6">
                <Link to={`/availability?space=${room.id}`} className={primaryButton}>
                  <CalendarDays className="h-4 w-4" aria-hidden="true" /> Check availability & book
                </Link>
                {freeToday !== null && (
                  <span className="text-sm text-muted-foreground">
                    {freeToday} free hour{freeToday === 1 ? "" : "s"} left today ({fmtDate(toISODate(new Date()), { month: "short", day: "numeric" })})
                  </span>
                )}
              </div>
              {room.is_sample && (
                <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Sample rooms are seeded for local development and do not represent verified campus facilities.
                </p>
              )}
            </div>
          </article>
        )}
      </div>
    </StudentLayout>
  );
}
