import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { StudentLayout } from "../layouts/StudentLayout";
import {
  SLOT_HOURS,
  getFacilities,
  getAvailability,
  startOfWeek,
  toISODate,
} from "../api/availability";
import { cn } from "../lib/utils";
import { useNavigate } from "react-router-dom";
import { checkSelection, toggleSlot } from "../lib/slotSelection";
const pad = (h) => `${String(h).padStart(2, "0")}:00`;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmtMonthDay = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtHour = (h) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;
export function AvailabilityPage() {
  const [spaces, setSpaces] = useState([]);
  const [spaceId, setSpaceId] = useState("");
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [today] = useState(() => toISODate(new Date()));
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selection, setSelection] = useState(null);

  const navigate = useNavigate();

  // Load real facilities from FastAPI
  useEffect(() => {
    let active = true;

    async function loadRooms() {
      try {
        const facilities = await getFacilities();

        if (!active) return;

        setSpaces(facilities);

        if (facilities.length > 0) {
          setSpaceId(String(facilities[0].id));
        }

        setError(null);
      } catch (err) {
        if (active) {
          setError(err.message || "Could not load rooms.");
        }
      } finally {
        if (active) {
          setRoomsLoading(false);
        }
      }
    }

    loadRooms();

    return () => {
      active = false;
    };
  }, []);

  // Load real availability when room or week changes
  useEffect(() => {
    if (!weekStart || !spaceId) return;

    let cancelled = false;

    setData(null);
    setError(null);

    getAvailability(spaceId, weekStart)
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Could not load availability.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [spaceId, weekStart]);

  // Calculate seven days for the calendar
  const days = useMemo(() => {
    if (!weekStart) return [];

    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      return day;
    });
  }, [weekStart]);

  // Build a lookup of hourly availability
  const lookup = useMemo(() => {
    const map = new Map();

    data?.slots?.forEach((slot) => {
      map.set(`${slot.date}-${slot.hour}`, slot.status);
    });

    return map;
  }, [data]);

  const getStatus = (date, hour) =>
    lookup.get(`${date}-${hour}`);

  const check = checkSelection(selection, getStatus);
    const shiftWeek = (n) => {setSelection(null);setData(null);setError(null);setWeekStart((w) => {
        if (!w)
            return w;
        const d = new Date(w);
        d.setDate(d.getDate() + n * 7);
        return d;
    }); };
    return (<StudentLayout active="search">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Room Availability</h1>
            <p className="mt-1 text-sm text-muted-foreground">View available time slots for this space</p>
          </div>
          <label className="relative flex items-center">
            <span className="sr-only">Space</span>
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground"/>
            <select value={spaceId} onChange={(e) => {setSelection(null);setData(null);setError(null);setSpaceId(e.target.value);}} className="h-10 rounded-md border border-input bg-card pl-9 pr-8 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring">
              {spaces.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
            </select>
          </label>
        </div>

        <div className="mt-6 rounded-xl border bg-card p-4 shadow-card md:p-6">
          <div className="relative mb-4 flex items-center justify-center gap-4">
            <button aria-label="Previous week" onClick={() => shiftWeek(-1)} className="rounded-md p-1.5 hover:bg-accent">
              <ChevronLeft className="h-4 w-4"/>
            </button>
            <span className="min-w-40 text-center text-sm font-semibold text-foreground">
              {days[0] && days[6] ? `${fmtMonthDay(days[0])} – ${fmtMonthDay(days[6])}, ${days[6].getFullYear()}` : "…"}
            </span>
            <button aria-label="Next week" onClick={() => shiftWeek(1)} className="rounded-md p-1.5 hover:bg-accent">
              <ChevronRight className="h-4 w-4"/>
            </button>
            <button onClick={() => {setSelection(null);setData(null);setError(null);setWeekStart(startOfWeek(new Date()));}} className="absolute right-0 rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-accent">
              Today
            </button>
          </div>

          {error ? (
            <p className="py-10 text-center text-sm text-destructive">
              {error}
            </p>
          ) : roomsLoading || (spaceId && !data) ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Loading room availability...
            </p>
          ) : (
            <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] table-fixed border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="w-20"/>
                    {days.map((d, i) => {
                const iso = toISODate(d);
                return (<th key={iso} className={cn("border-b px-1 py-2 font-medium", iso === today ? "text-primary" : "text-foreground")}>
                          <div>{DAY_NAMES[i]}</div>
                          <div className="font-normal text-muted-foreground">
                            {d.getMonth() + 1}/{d.getDate()}
                          </div>
                        </th>);
            })}
                  </tr>
                </thead>
                <tbody>
                  {SLOT_HOURS.map((h) => (<tr key={h}>
                      <td className="pr-3 text-right align-middle text-muted-foreground">{fmtHour(h)}</td>
                      {days.map((d) => {
                    const status = lookup.get(`${toISODate(d)}-${h}`);
                    return (<td key={toISODate(d)} className="h-9 border p-1">
                            {status && (() => {
                            const iso = toISODate(d);
                            const selected = selection?.date === iso && selection.hours.includes(h);
                            return (<button type="button" disabled={status !== "available"} aria-pressed={selected} onClick={() => setSelection((s) => toggleSlot(s, iso, h, getStatus))} className={cn( "flex h-full w-full items-center justify-center rounded-md font-medium", status === "booked"
                                        ? "cursor-not-allowed bg-destructive/10 text-destructive"
                                        : status === "unavailable"
                                          ? "cursor-not-allowed bg-muted text-muted-foreground"
                                          : selected
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-success/15 text-success hover:bg-success/25")}>
                                  {status === "booked"
                                    ? "Booked"
                                    : status === "unavailable"
                                      ? "Unavailable"
                                      : selected
                                        ? "Selected"
                                        : "Available"}
                                </button>);
                        })()}
                          </td>);
                })}
                    </tr>))}
                </tbody>
              </table>
            </div>)}

          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">  
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-success/30"/> Available</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-destructive/25"/> Booked</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-primary"/> Selected</span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-muted" />
              Unavailable
            </span>
          </div>
        </div>

        <div className="mt-6 rounded-xl border bg-card p-4 shadow-card md:p-6">
          <h2 className="text-base font-semibold text-foreground">Booking Summary</h2>
          {check.ok ? (<dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div><dt className="text-muted-foreground">Date</dt><dd className="font-medium">{new Date(`${check.date}T00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</dd></div>
              <div><dt className="text-muted-foreground">Start time</dt><dd className="font-medium">{fmtHour(check.startHour)}</dd></div>
              <div><dt className="text-muted-foreground">End time</dt><dd className="font-medium">{fmtHour(check.endHour)}</dd></div>
              <div><dt className="text-muted-foreground">Total duration</dt><dd className="font-medium">{check.durationHours} hour{check.durationHours > 1 ? "s" : ""}</dd></div>
            </dl>) : (<p className={cn("mt-3 text-sm", check.reason === "empty" ? "text-muted-foreground" : "text-destructive")}>
              {check.reason === "empty"
                ? "Select one or more consecutive available time slots on the same day."
                : check.reason === "spans-booked"
                    ? "Your selection spans a booked slot. Choose consecutive available slots only."
                    : "Selected time slots are not consecutive. Choose back-to-back hours for one reservation."}
            </p>)}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" disabled={!check.ok} onClick={() => check.ok &&
            navigate(`/spaces/${encodeURIComponent(spaceId)}/book?${new URLSearchParams({ date: check.date, start: pad(check.startHour), end: pad(check.endHour) })}`)} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              Continue to Reservation
            </button>
            {selection && (<button type="button" onClick={() => setSelection(null)} className="text-sm text-muted-foreground hover:underline">
                Clear selection
              </button>)}
            <span className="text-xs text-muted-foreground">Availability is rechecked by the server when you submit.</span>
          </div>
        </div>
      </div>
    </StudentLayout>);
}
