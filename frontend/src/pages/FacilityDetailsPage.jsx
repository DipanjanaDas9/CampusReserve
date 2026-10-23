import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Building2, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Info, MapPin, Monitor, Users } from "lucide-react";
import { StudentLayout } from "../layouts/StudentLayout";
import { SLOT_HOURS, getAvailability, startOfWeek, toISODate } from "../api/availability";
import { checkSelection, toggleSlot } from "../lib/slotSelection";
import { BOOKING_RULES, OPERATING_HOURS, findSampleRoom } from "../data/sampleRooms";
import { SampleDataLabel } from "../components/SampleDataLabel";
import { StatusMessage } from "../components/StatusMessage";
import { formatTime } from "../lib/datetime";
import { cn } from "../lib/utils";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "availability", label: "Availability" },
  { key: "equipment", label: "Equipment" },
  { key: "rules", label: "Rules" },
];

const pad = (h) => `${String(h).padStart(2, "0")}:00`;

export function FacilityDetailsPage() {
  const { id } = useParams();
  const { state } = useLocation();
  // Sample rooms are looked up by id; rooms from the backend arrive with the link (no GET /rooms/{id} yet).
  const room = findSampleRoom(id) ?? state?.room ?? null;
  const [tab, setTab] = useState("overview");

  if (!room) {
    return (
      <StudentLayout active="search">
        <div className="mx-auto max-w-4xl">
          <BackLink />
          <StatusMessage kind="error">We couldn't find that space. Open it again from Search Spaces.</StatusMessage>
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout active="search">
      <div className="mx-auto max-w-5xl">
        <BackLink />
        <div className="overflow-hidden rounded-xl border bg-card shadow-card">
          <div className="flex flex-col gap-5 p-4 md:flex-row md:p-6">
            {room.photo ? (
              <img src={room.photo} alt="" className="h-48 w-full rounded-lg bg-secondary object-cover md:h-44 md:w-72" />
            ) : (
              <div className="flex h-48 w-full items-center justify-center rounded-lg bg-secondary md:h-44 md:w-72">
                <Building2 className="h-10 w-10 text-primary" aria-hidden="true" />
              </div>
            )}
            <div className="flex flex-1 flex-col justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold text-foreground">{room.name}</h1>
                  {room.isSample && <SampleDataLabel />}
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" aria-hidden="true" /> {room.location}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setTab("availability")}
                  className="rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-brand hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Reserve
                </button>
                <span className="text-sm text-muted-foreground">Pick a time on the Availability tab to continue.</span>
              </div>
            </div>
          </div>

          <Tabs value={tab} onChange={setTab} />

          <div className="p-4 md:p-6">
            <section id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" hidden={tab !== "overview"}>
              <Overview room={room} />
            </section>
            <section id="panel-availability" role="tabpanel" aria-labelledby="tab-availability" hidden={tab !== "availability"}>
              {tab === "availability" && <AvailabilityTab roomId={String(room.id)} />}
            </section>
            <section id="panel-equipment" role="tabpanel" aria-labelledby="tab-equipment" hidden={tab !== "equipment"}>
              <EquipmentList items={room.equipment} />
            </section>
            <section id="panel-rules" role="tabpanel" aria-labelledby="tab-rules" hidden={tab !== "rules"}>
              <Rules />
            </section>
          </div>
        </div>
      </div>
    </StudentLayout>
  );
}

function BackLink() {
  return (
    <Link to="/search" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to search
    </Link>
  );
}

/** WAI-ARIA tabs: arrow keys move between tabs, only the active tab is in the tab order. */
function Tabs({ value, onChange }) {
  const refs = useRef({});
  function onKeyDown(e) {
    const index = TABS.findIndex((t) => t.key === value);
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length].key;
    onChange(next);
    refs.current[next]?.focus();
  }
  return (
    <div role="tablist" aria-label="Facility information" className="flex gap-1 overflow-x-auto border-y px-4 md:px-6" onKeyDown={onKeyDown}>
      {TABS.map(({ key, label }) => (
        <button
          key={key}
          ref={(el) => (refs.current[key] = el)}
          id={`tab-${key}`}
          type="button"
          role="tab"
          aria-selected={value === key}
          aria-controls={`panel-${key}`}
          tabIndex={value === key ? 0 : -1}
          onClick={() => onChange(key)}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            value === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Overview({ room }) {
  const items = [
    { icon: Users, label: "Capacity", value: `${room.capacity} people` },
    { icon: Monitor, label: "Equipment", value: room.equipment?.length ? room.equipment.join(", ") : "None listed" },
    { icon: Clock, label: "Operating Hours", value: OPERATING_HOURS },
    { icon: MapPin, label: "Location", value: room.location },
  ];
  return (
    <>
      <dl className="grid gap-5 sm:grid-cols-2">
        {items.map(({ icon: Icon, label, value }) => (
          <div key={label}>
            <dt className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              {label}
            </dt>
            <dd className="ml-7 text-sm text-muted-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      {room.description && (
        <div className="mt-5">
          <h2 className="text-sm font-semibold text-foreground">Description</h2>
          <p className="mt-1 text-sm text-muted-foreground">{room.description}</p>
        </div>
      )}
    </>
  );
}

function EquipmentList({ items }) {
  if (!items?.length) return <p className="text-sm text-muted-foreground">No equipment is listed for this space.</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item} className="flex items-center gap-3 rounded-lg border p-3 text-sm text-foreground">
          <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" /> {item}
        </li>
      ))}
    </ul>
  );
}

function Rules() {
  return (
    <>
      <ol className="space-y-3">
        {BOOKING_RULES.map((rule) => (
          <li key={rule.title} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">{rule.title}</h2>
              {!rule.enforced && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">Draft — not enforced yet</span>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{rule.text}</p>
          </li>
        ))}
      </ol>
      <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Rules marked draft are waiting for the administrator approval rules.
      </p>
    </>
  );
}

/** Compact week view built on the same availability data and slot selection as the Availability page. */
function AvailabilityTab({ roomId }) {
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [data, setData] = useState({ key: null, slots: [], isSample: false, error: "" });
  const [selection, setSelection] = useState(null);
  const key = `${roomId}|${toISODate(weekStart)}`;

  useEffect(() => {
    let cancelled = false;
    getAvailability(roomId, weekStart)
      .then((r) => !cancelled && setData({ key, slots: r.slots, isSample: r.isSample, error: "" }))
      .catch((e) => !cancelled && setData({ key, slots: [], isSample: false, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [roomId, weekStart, key]);

  const loaded = data.key === key;
  const lookup = useMemo(() => new Map(data.slots.map((s) => [`${s.date}-${s.hour}`, s.status])), [data.slots]);
  const status = (date, hour) => (loaded ? lookup.get(`${date}-${hour}`) : undefined);
  const now = new Date();
  const today = toISODate(now);
  const isPast = (iso, hour) => iso < today || (iso === today && hour <= now.getHours());
  const check = checkSelection(selection, (date, h) => (isPast(date, h) ? "booked" : status(date, h)));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const shiftWeek = (n) => {
    setSelection(null);
    setWeekStart((w) => {
      const d = new Date(w);
      d.setDate(d.getDate() + n * 7);
      return d;
    });
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous week" onClick={() => shiftWeek(-1)} className="rounded-md p-1.5 hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="text-sm font-semibold text-foreground">
            {days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
          <button type="button" aria-label="Next week" onClick={() => shiftWeek(1)} className="rounded-md p-1.5 hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {data.isSample && <SampleDataLabel>Sample availability</SampleDataLabel>}
      </div>

      <StatusMessage kind="error">{data.error}</StatusMessage>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-xs">
          <caption className="sr-only">Hourly availability; select consecutive available hours on one day</caption>
          <thead>
            <tr>
              <th className="w-20" scope="col"><span className="sr-only">Time</span></th>
              {days.map((d) => (
                <th key={toISODate(d)} scope="col" className={cn("px-1 py-2 font-medium", toISODate(d) === today ? "text-primary" : "text-foreground")}>
                  {d.toLocaleDateString("en-US", { weekday: "short" })}
                  <span className="block font-normal text-muted-foreground">{d.getMonth() + 1}/{d.getDate()}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOT_HOURS.map((hour) => (
              <tr key={hour}>
                <th scope="row" className="pr-2 text-right font-normal text-muted-foreground">{formatTime(pad(hour))}</th>
                {days.map((d) => {
                  const iso = toISODate(d);
                  const s = status(iso, hour);
                  const past = isPast(iso, hour);
                  const selected = selection?.date === iso && selection.hours.includes(hour);
                  return (
                    <td key={iso} className="h-8 border p-0.5">
                      {s && (
                        <button
                          type="button"
                          disabled={s !== "available" || past}
                          aria-pressed={selected}
                          aria-label={`${d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}, ${formatTime(pad(hour))}: ${past ? "past" : s}`}
                          onClick={() => setSelection((sel) => toggleSlot(sel, iso, hour, (date, h) => (isPast(date, h) ? "past" : status(date, h))))}
                          className={cn(
                            "h-full w-full rounded text-[11px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            past
                              ? "bg-muted text-muted-foreground"
                              : s === "booked"
                                ? "bg-destructive/10 text-destructive"
                                : selected
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-success/15 text-foreground hover:bg-success/25"
                          )}
                        >
                          {past ? "–" : s === "booked" ? "Booked" : selected ? "Selected" : "Free"}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!check.ok}
          onClick={() =>
            navigate(`/spaces/${encodeURIComponent(roomId)}/book?${new URLSearchParams({ date: check.date, start: pad(check.startHour), end: pad(check.endHour) })}`)
          }
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CalendarDays className="h-4 w-4" aria-hidden="true" /> Continue to Reservation
        </button>
        <span className={cn("text-sm", check.reason === "empty" || check.ok ? "text-muted-foreground" : "text-destructive")}>
          {check.ok
            ? `${formatTime(pad(check.startHour))} – ${formatTime(pad(check.endHour))} selected`
            : check.reason === "empty"
              ? "Select consecutive free hours on one day."
              : check.reason === "spans-booked"
                ? "Your selection spans a booked slot."
                : "Selected hours must be consecutive."}
        </span>
      </div>
    </div>
  );
}
