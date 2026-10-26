import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { StudentLayout } from "../layouts/StudentLayout";
import { searchRooms } from "../api/rooms";
import { toISODate } from "../api/availability";
import { EQUIPMENT_OPTIONS } from "../data/sampleRooms";
import { RoomCard, SortSelect } from "../components/RoomCard";
import { SampleDataLabel } from "../components/SampleDataLabel";
import { StatusMessage } from "../components/StatusMessage";
import { sortRooms } from "../lib/rooms";
import { todayISO } from "../lib/datetime";
import { cn } from "../lib/utils";

const fieldClass =
  "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

const pad = (h) => `${String(h).padStart(2, "0")}:00`;

/** Next whole hour today within 8 AM – 7 PM, otherwise 10–11 AM tomorrow. */
function defaultFilters() {
  const now = new Date();
  const next = now.getHours() + 1;
  if (next >= 8 && next <= 18) return { date: toISODate(now), start: pad(next), end: pad(next + 1) };
  const day = new Date(now);
  if (next > 18) day.setDate(day.getDate() + 1);
  return { date: toISODate(day), start: "10:00", end: "11:00" };
}

const buildingOf = (room) => room.building ?? room.location;

function validate({ date, start, end, groupSize }) {
  if (!date || date < todayISO()) return "Choose today or a future date.";
  if (!start || !end || end <= start) return "End time must be later than start time.";
  const n = Number(groupSize);
  if (!Number.isInteger(n) || n < 1) return "Group size must be a whole number of at least 1.";
  return "";
}

export function SearchSpacesPage() {
  const [filters, setFilters] = useState(() => ({ ...defaultFilters(), groupSize: "1", equipment: [], building: "" }));
  const [searched, setSearched] = useState(null); // filters used for the current results
  const [result, setResult] = useState(null); // { rooms, isSample }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState("capacity");

  function load(f) {
    return searchRooms({ date: f.date, startTime: f.start, endTime: f.end, minCapacity: Number(f.groupSize), equipment: f.equipment })
      .then(
        (data) => {
          setResult(data);
          setSearched(f);
          setError("");
        },
        (err) => {
          setResult(null);
          setError(err.message);
        }
      )
      .finally(() => setLoading(false));
  }

  // Show rooms for the default time once, when the page opens; later searches use the form.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void load(filters), []);

  function onSubmit(e) {
    e.preventDefault();
    const problem = validate(filters);
    if (problem) return setError(problem);
    setLoading(true);
    load(filters);
  }

  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const toggleEquipment = (item) =>
    setFilters((f) => ({ ...f, equipment: f.equipment.includes(item) ? f.equipment.filter((x) => x !== item) : [...f.equipment, item] }));

  const buildings = useMemo(
  () =>
    [
      ...new Set(
        (result?.rooms ?? [])
          .map(buildingOf)
          .filter(Boolean)
      ),
    ].sort(),
    [result]
  );
  const shown = useMemo(() => {
    if (!result) return [];
    const inBuilding = filters.building ? result.rooms.filter((room) => buildingOf(room) === filters.building) : result.rooms;
    return sortRooms(inBuilding, sortBy);
  }, [result, filters.building, sortBy]);

  return (
    <StudentLayout active="search">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold text-foreground">Find a Space</h1>
        <p className="mt-1 text-sm text-muted-foreground">Search and filter available campus spaces</p>

        <form onSubmit={onSubmit} className="mt-6 rounded-xl border bg-card p-4 shadow-card md:p-6" aria-label="Search filters">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field id="s-date" label="Date">
              <input id="s-date" type="date" min={todayISO()} value={filters.date} onChange={set("date")} className={fieldClass} required />
            </Field>
            <Field id="s-start" label="Start Time">
              <input id="s-start" type="time" step="900" value={filters.start} onChange={set("start")} className={fieldClass} required />
            </Field>
            <Field id="s-end" label="End Time">
              <input id="s-end" type="time" step="900" value={filters.end} onChange={set("end")} className={fieldClass} required />
            </Field>
            <Field id="s-size" label="Group Size">
              <input id="s-size" type="number" min="1" value={filters.groupSize} onChange={set("groupSize")} className={fieldClass} required />
            </Field>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_16rem_auto] lg:items-end">
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-foreground">Equipment</legend>
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT_OPTIONS.map((item) => {
                  const checked = filters.equipment.includes(item);
                  return (
                    <label
                      key={item}
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                        checked ? "border-primary bg-primary/10 font-medium text-foreground" : "bg-card text-muted-foreground"
                      )}
                    >
                      <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggleEquipment(item)} />
                      {checked && <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />}
                      {item}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <Field id="s-building" label="Building">
              <select id="s-building" value={filters.building} onChange={set("building")} className={fieldClass}>
                <option value="">All Buildings</option>
                {buildings.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-brand hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
              Search
            </button>
          </div>
        </form>

        <StatusMessage kind="error" className="mt-4">{error}</StatusMessage>

        {result && (
          <section className="mt-6" aria-live="polite" aria-labelledby="results-heading">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="results-heading" className="font-semibold text-foreground">
                  {shown.length} space{shown.length === 1 ? "" : "s"} found
                </h2>
                {(result.isSample || shown.some((room) => room.isSample)) && <SampleDataLabel />}
              </div>
              <SortSelect id="search-sort" value={sortBy} onChange={setSortBy} />
            </div>
            {shown.length === 0 ? (
              <p className="rounded-xl border bg-card py-12 text-center text-muted-foreground shadow-card">No rooms match. Try fewer requirements.</p>
            ) : (
              <div className="space-y-3">
                {shown.map((room) => (
                  <RoomCard key={room.id} room={room} startTime={searched.start} endTime={searched.end} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </StudentLayout>
  );
}

function Field({ id, label, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
