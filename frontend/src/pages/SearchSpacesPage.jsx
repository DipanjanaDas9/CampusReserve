import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { StudentLayout } from "../layouts/StudentLayout";
import { listFacilities } from "../api/facilities";
import { EQUIPMENT_OPTIONS } from "../data/sampleRooms";
import { RoomCard, SortSelect } from "../components/RoomCard";
import { StatusMessage } from "../components/StatusMessage";
import { facilityToRoom, filterFacilities, sortRooms } from "../lib/rooms";
import { cn } from "../lib/utils";

const fieldClass =
  "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

const EMPTY_FILTERS = { groupSize: "1", equipment: [], location: "" };

export function SearchSpacesPage() {
  const [rooms, setRooms] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [formError, setFormError] = useState("");
  const [sortBy, setSortBy] = useState("capacity");

  useEffect(() => {
    listFacilities()
      .then((list) => setRooms(list.map(facilityToRoom)))
      .catch((err) => setLoadError(err.message));
  }, []);

  function onSubmit(e) {
    e.preventDefault();
    const n = Number(filters.groupSize);
    if (!Number.isInteger(n) || n < 1) return setFormError("Group size must be a whole number of at least 1.");
    setFormError("");
    setApplied(filters);
  }

  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const toggleEquipment = (item) =>
    setFilters((f) => ({ ...f, equipment: f.equipment.includes(item) ? f.equipment.filter((x) => x !== item) : [...f.equipment, item] }));

  const locations = useMemo(() => [...new Set((rooms ?? []).map((r) => r.location))].sort(), [rooms]);
  const shown = useMemo(
    () => (rooms ? sortRooms(filterFacilities(rooms, { minCapacity: Number(applied.groupSize), equipment: applied.equipment, location: applied.location }), sortBy) : []),
    [rooms, applied, sortBy]
  );

  return (
    <StudentLayout active="search">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold text-foreground">Find a Space</h1>
        <p className="mt-1 text-sm text-muted-foreground">Filter campus spaces by group size, equipment and building</p>

        <form onSubmit={onSubmit} className="mt-6 rounded-xl border bg-card p-4 shadow-card md:p-6" aria-label="Search filters">
          <div className="grid gap-4 lg:grid-cols-[10rem_1fr_16rem_auto] lg:items-end">
            <div>
              <label htmlFor="s-size" className="mb-1.5 block text-sm font-medium text-foreground">Group Size</label>
              <input id="s-size" type="number" min="1" value={filters.groupSize} onChange={set("groupSize")} className={fieldClass} required />
            </div>
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
            <div>
              <label htmlFor="s-location" className="mb-1.5 block text-sm font-medium text-foreground">Building</label>
              <input id="s-location" list="s-locations" value={filters.location} onChange={set("location")} placeholder="Any building" className={fieldClass} />
              <datalist id="s-locations">
                {locations.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </div>
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-brand hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Search className="h-4 w-4" aria-hidden="true" /> Search
            </button>
          </div>
        </form>

        <StatusMessage kind="error" className="mt-4">{formError}</StatusMessage>
        <StatusMessage kind="error" className="mt-4">{loadError}</StatusMessage>

        {!rooms && !loadError && (
          <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading spaces…
          </p>
        )}

        {rooms && (
          <section className="mt-6" aria-live="polite" aria-labelledby="results-heading">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="results-heading" className="font-semibold text-foreground">
                  {shown.length} space{shown.length === 1 ? "" : "s"} found
                </h2>
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">Availability not checked yet</span>
              </div>
              <SortSelect id="search-sort" value={sortBy} onChange={setSortBy} />
            </div>
            {shown.length === 0 ? (
              <p className="rounded-xl border bg-card py-12 text-center text-muted-foreground shadow-card">
                {rooms.length === 0 ? "No facilities have been added yet." : "No rooms match. Try fewer requirements."}
              </p>
            ) : (
              <div className="space-y-3">
                {shown.map((room) => (
                  <RoomCard key={room.id} room={room} />
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Pick a time on the facility's Availability tab; the server checks for conflicts when you book.</p>
          </section>
        )}
      </div>
    </StudentLayout>
  );
}
