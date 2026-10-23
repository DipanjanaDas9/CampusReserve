import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, CalendarDays, MapPin, Search, Sparkles, Users } from "lucide-react";
import { StudentLayout } from "../layouts/StudentLayout";
import { aiSearchRooms, listRooms, searchRooms } from "../api/rooms";
import { toISODate } from "../api/availability";
import { fmtDate, fmtTime } from "../lib/format";
import { cn } from "../lib/utils";
import { EmptyState, EquipmentTags, ErrorMessage, Loading, PageHeader, inputClass, primaryButton, secondaryButton } from "../components/ui";

const TABS = [
  { key: "browse", label: "Browse & filter", icon: Search },
  { key: "ai", label: "AI Smart Finder", icon: Sparkles },
];

const EXAMPLES = [
  "Find a room for 5 people tomorrow from 2 PM to 4 PM with a projector",
  "Quiet room for 2 on Friday morning 9 to 11",
  "Space for 15 students with computers next Monday 1-3 PM",
];

export function SearchSpacesPage() {
  const [tab, setTab] = useState("browse");
  const [rooms, setRooms] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [results, setResults] = useState(null);
  const [interpreted, setInterpreted] = useState(null);
  const [searchWhen, setSearchWhen] = useState(null);

  function loadRooms() {
    listRooms().then(setRooms).catch((e) => setLoadError(e.message));
  }
  useEffect(loadRooms, []);
  function retryRooms() {
    setLoadError("");
    loadRooms();
  }

  function showResults(found, when, understood = null) {
    setResults(found);
    setSearchWhen(when);
    setInterpreted(understood);
  }

  return (
    <StudentLayout active="search">
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Search Spaces" subtitle="Filter by time, group size and equipment, or describe what you need." />

        <div role="tablist" aria-label="Search mode" className="mb-4 inline-flex rounded-lg bg-secondary p-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => {
                setTab(key);
                setResults(null);
                setInterpreted(null);
              }}
              className={cn("flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium", tab === key ? "bg-card shadow-card" : "text-muted-foreground")}
            >
              <Icon className="h-4 w-4" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>

        {tab === "browse" ? <FilterForm onResults={showResults} /> : <AiFinder onResults={showResults} />}

        {interpreted && <Interpretation requirements={interpreted} />}

        <section className="mt-6" aria-live="polite">
          {results ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">
                  {results.length} space{results.length === 1 ? "" : "s"} available
                  {searchWhen && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · {fmtDate(searchWhen.date)}, {fmtTime(searchWhen.start)} – {fmtTime(searchWhen.end)}
                    </span>
                  )}
                </h2>
                <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => showResults(null, null)}>
                  Show all spaces
                </button>
              </div>
              {results.length === 0 ? (
                <EmptyState icon={Building2}>No spaces match those needs at that time. Try a different time or fewer requirements.</EmptyState>
              ) : (
                <RoomGrid rooms={results} when={searchWhen} />
              )}
            </>
          ) : (
            <AllRooms rooms={rooms} error={loadError} onRetry={retryRooms} />
          )}
        </section>
      </div>
    </StudentLayout>
  );
}

function FilterForm({ onResults }) {
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("11:00");
  const [capacity, setCapacity] = useState("1");
  const [equipment, setEquipment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (end <= start) return setError("End time must be later than start time.");
    const n = Number(capacity);
    if (!Number.isInteger(n) || n < 1) return setError("Group size must be a whole number of at least 1.");
    const items = equipment.split(",").map((s) => s.trim()).filter(Boolean);
    setBusy(true);
    try {
      const found = await searchRooms({ date, startTime: start, endTime: end, minCapacity: n, equipment: items });
      onResults(found, { date, start, end });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border bg-card p-4 shadow-card md:p-6" aria-label="Search filters">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Date" id="f-date">
          <input id="f-date" type="date" className={inputClass} value={date} min={toISODate(new Date())} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Start time" id="f-start">
          <input id="f-start" type="time" step="900" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} required />
        </Field>
        <Field label="End time" id="f-end">
          <input id="f-end" type="time" step="900" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} required />
        </Field>
        <Field label="Group size" id="f-cap">
          <input id="f-cap" type="number" min="1" className={inputClass} value={capacity} onChange={(e) => setCapacity(e.target.value)} required />
        </Field>
        <Field label="Equipment" id="f-eq" hint="Comma-separated; all must match">
          <input id="f-eq" className={inputClass} value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="Projector, Whiteboard" />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" className={primaryButton} disabled={busy}>
          <Search className="h-4 w-4" aria-hidden="true" /> {busy ? "Searching…" : "Find available spaces"}
        </button>
        <ErrorMessage>{error}</ErrorMessage>
      </div>
    </form>
  );
}

function AiFinder({ onResults }) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (!query.trim()) return setError("Describe the space you need.");
    setBusy(true);
    try {
      const data = await aiSearchRooms({ query: query.trim() });
      const r = data.interpreted_requirements;
      onResults(data.results, r.date && r.start_time && r.end_time ? { date: r.date, start: r.start_time, end: r.end_time } : null, r);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border bg-card p-4 shadow-card md:p-6" aria-label="AI Smart Finder">
      <label htmlFor="ai-query" className="mb-1 block text-sm font-medium">
        Describe the space you need
      </label>
      <textarea
        id="ai-query"
        rows={3}
        maxLength={500}
        className={inputClass}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g. A room for 6 people tomorrow from 2 to 4 PM with a whiteboard"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button key={example} type="button" className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-accent" onClick={() => setQuery(example)}>
            {example}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" className={primaryButton} disabled={busy}>
          <Sparkles className="h-4 w-4" aria-hidden="true" /> {busy ? "Understanding your request…" : "Find with AI"}
        </button>
        <ErrorMessage>{error}</ErrorMessage>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Your request text is sent to Google Gemini to extract the date, time, group size and equipment. Availability is always checked by CampusReserve, not the AI.
      </p>
    </form>
  );
}

function Interpretation({ requirements: r }) {
  const parts = [
    r.group_size && `${r.group_size} people`,
    r.date && fmtDate(r.date),
    r.start_time && r.end_time && `${fmtTime(r.start_time)} – ${fmtTime(r.end_time)}`,
    r.equipment?.length && r.equipment.join(", "),
  ].filter(Boolean);
  return (
    <div className="mt-4 rounded-lg border border-primary/30 bg-accent p-3 text-sm text-accent-foreground">
      <span className="font-semibold">We understood:</span> {parts.length ? parts.join(" · ") : "no specific requirements"}
      {r.missing_information?.length > 0 && <span className="block text-xs">Not specified: {r.missing_information.join(", ")}</span>}
    </div>
  );
}

function AllRooms({ rooms, error, onRetry }) {
  const [text, setText] = useState("");
  const shown = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!rooms || !q) return rooms;
    return rooms.filter((room) => [room.name, room.location, ...room.equipment].join(" ").toLowerCase().includes(q));
  }, [rooms, text]);

  if (error) return <ErrorMessage onRetry={onRetry}>{error}</ErrorMessage>;
  if (!rooms) return <Loading label="Loading spaces…" />;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">All spaces ({rooms.length})</h2>
        <label className="relative">
          <span className="sr-only">Filter spaces by name, location or equipment</span>
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input type="search" className={cn(inputClass, "w-64 pl-9")} placeholder="Filter by name or equipment" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      </div>
      {shown.length === 0 ? <EmptyState icon={Building2}>No spaces match “{text}”.</EmptyState> : <RoomGrid rooms={shown} />}
    </>
  );
}

function RoomGrid({ rooms, when }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rooms.map((room) => {
        const availability = `/availability?${new URLSearchParams({ space: room.id, ...(when ? { date: when.date } : {}) })}`;
        return (
          <article key={room.id} className="flex flex-col rounded-xl border bg-card p-5 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-foreground">{room.name}</h3>
              {room.is_sample && <span className="rounded-full bg-chart-4/25 px-2 py-0.5 text-[11px] font-medium">Sample</span>}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" aria-hidden="true" /> {room.location}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="h-4 w-4" aria-hidden="true" /> Up to {room.capacity} people
            </p>
            <div className="mt-3 flex-1">
              <EquipmentTags items={room.equipment} />
            </div>
            <div className="mt-4 flex gap-2">
              <Link to={`/spaces/${room.id}`} className={cn(secondaryButton, "flex-1")}>
                Details
              </Link>
              <Link to={availability} className={cn(primaryButton, "flex-1")}>
                <CalendarDays className="h-4 w-4" aria-hidden="true" /> Book
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Field({ label, id, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
