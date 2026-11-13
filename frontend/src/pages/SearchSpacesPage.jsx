import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, Check, Clock3, Search, SlidersHorizontal, Sparkles, Users, X } from "lucide-react";
import { StudentLayout } from "../layouts/StudentLayout";
import { listFacilities } from "../api/facilities";
import { EQUIPMENT_OPTIONS } from "../data/sampleRooms";
import { RoomCard, SortSelect } from "../components/RoomCard";
import { StatusMessage } from "../components/StatusMessage";
import { facilityToRoom, filterFacilities, sortRooms } from "../lib/rooms";
import { cn } from "../lib/utils";
import { Link } from "react-router-dom";
import "./SearchSpacesPage.css";

const fieldClass =
  "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

const EMPTY_FILTERS = { groupSize: "1", equipment: [], building: "", floor: "" };

export function SearchSpacesPage() {
  const [rooms, setRooms] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [formError, setFormError] = useState("");
  const [sortBy, setSortBy] = useState("capacity");

  useEffect(() => {
    listFacilities()
      .then((list) => setRooms(list.filter(room => room.is_active).map(facilityToRoom)))
      .catch((err) => setLoadError(err.message));
  }, []);

  function onSubmit(e) {
    e.preventDefault();
    const n = Number(filters.groupSize);
    if (!Number.isInteger(n) || n < 1) return setFormError("Group size must be a whole number of at least 1.");
    setFormError("");
    setApplied(filters);
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setFormError("");
  }

  const hasFilters = applied.groupSize !== "1" || applied.equipment.length > 0 || applied.building !== "" || applied.floor !== "";

  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const toggleEquipment = (item) =>
    setFilters((f) => ({ ...f, equipment: f.equipment.includes(item) ? f.equipment.filter((x) => x !== item) : [...f.equipment, item] }));


  const buildings = useMemo(
    () =>
      [
        ...new Set(
          (rooms ?? [])
            .map((room) => room.building_name)
            .filter(Boolean)
        ),
      ].sort(),
    [rooms]
  );

  const floors = useMemo(() => [...new Set((rooms ?? [])
    .filter(room => !filters.building || room.building_name === filters.building)
    .map(room => room.floor_number).filter(floor => floor != null))].sort((a, b) => a - b), [rooms, filters.building]);

  const shown = useMemo(
    () =>
      rooms
        ? sortRooms(
            filterFacilities(rooms, {
              minCapacity: Number(applied.groupSize),
              equipment: applied.equipment,
              buildingName: applied.building,
              floorNumber: applied.floor === "" ? null : Number(applied.floor),
            }),
            sortBy
          )
        : [],
    [rooms, applied, sortBy]
  );


  return (
    <StudentLayout active="search">
      <div className="spaces-page mx-auto max-w-6xl">
        <header className="spaces-hero">
          <div>
            <p className="spaces-eyebrow"><span /> A SPACE FOR EVERY IDEA</p>
            <h1>Find your next<br /><span>great place to focus.</span></h1>
            <p className="spaces-intro">Study together, bring your team, or make room for something new. Find a campus space that fits.</p>
            <div className="spaces-steps"><span><Search size={15} /> Find your space</span><i /><span><Clock3 size={15} /> Choose a time</span><i /><span><Check size={15} /> Request a booking</span></div>
          </div>
          <Link to="/ai-finder" className="spaces-ai-link"><span className="spaces-ai-icon"><Sparkles size={22} /></span><strong>Have a space in mind?</strong><span>Describe what you need.<br />Let AI help you find it.</span><b>Try AI Assistant <ArrowRight size={16} /></b></Link>
        </header>

        <form onSubmit={onSubmit} className="spaces-filters" aria-label="Search filters">
          <div className="spaces-filter-heading"><h2><SlidersHorizontal size={17} /> Make it your space</h2><button type="button" onClick={resetFilters}>Reset filters</button></div>
          <div className="spaces-filter-grid">
            <div>
              <label htmlFor="s-size" className="mb-1.5 block text-sm font-medium text-foreground"><Users size={15} /> Group size</label>
              <input id="s-size" type="number" min="1" value={filters.groupSize} onChange={set("groupSize")} className={fieldClass} required />
            </div>
            <fieldset className="spaces-equipment">
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
              <label htmlFor="s-location" className="mb-1.5 block text-sm font-medium text-foreground"><Building2 size={15} /> Building</label>
              <select id="s-location" value={filters.building} onChange={e => setFilters(f => ({ ...f, building: e.target.value, floor: "" }))} className={fieldClass}>
                <option value="">Any building</option>
                {buildings.map(building => <option key={building} value={building}>{building}</option>)}
              </select>
            </div>
            <div className="spaces-floor-filter">
              <label htmlFor="s-floor" className="mb-1.5 block text-sm font-medium text-foreground">Floor</label>
              <select id="s-floor" value={filters.floor} onChange={set("floor")} className={fieldClass}>
                <option value="">Any floor</option>
                {floors.map(floor => <option key={floor} value={floor}>{floor === 0 ? "Ground floor (0)" : `Floor ${floor}`}</option>)}
              </select>
            </div>
            <button
              type="submit"
              className="spaces-search-button inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-brand hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Search className="h-4 w-4" aria-hidden="true" /> Find spaces
            </button>
          </div>
        </form>

        <StatusMessage kind="error" className="mt-4">{formError}</StatusMessage>
        <StatusMessage kind="error" className="mt-4">{loadError}</StatusMessage>

        {!rooms && !loadError && (
          <div className="spaces-loading" role="status" aria-label="Loading spaces">
            {[1, 2, 3].map((n) => <div key={n} className="spaces-skeleton"><div /><span /><span /></div>)}
            <span className="sr-only">Loading spaces…</span>
          </div>
        )}

        {rooms && (
          <section className="mt-6" aria-live="polite" aria-labelledby="results-heading">
            <div className="spaces-results-heading">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="results-heading" className="text-xl font-bold text-foreground">
                  {shown.length} space{shown.length === 1 ? "" : "s"} found
                </h2>
                <span className="spaces-result-hint">Explore your options, then choose a time.</span>
              </div>
              <SortSelect id="search-sort" value={sortBy} onChange={setSortBy} />
            </div>
            {hasFilters && <div className="spaces-applied"><span>Filtered by</span>{applied.groupSize !== "1" && <b>{applied.groupSize}+ people</b>}{applied.building && <b>{applied.building}</b>}{applied.floor !== "" && <b>Floor {applied.floor}</b>}{applied.equipment.map(item => <b key={item}>{item}</b>)}<button type="button" onClick={resetFilters}>Clear all <X size={13} /></button></div>}
            {shown.length === 0 ? (
              <div className="spaces-empty">
                <span><Search size={28} /></span>
                <h3>{rooms.length === 0 ? "Your campus spaces are on their way" : "Let’s make a little more room"}</h3>
                <p>{rooms.length === 0 ? "Facilities will appear here once your campus administrator adds them." : "No spaces match these filters. Try a different building or fewer equipment requirements."}</p>
                {hasFilters && <button type="button" onClick={resetFilters}>Clear filters and explore spaces <ArrowRight size={16} /></button>}
              </div>
            ) : (
              <div className="spaces-results-grid">
                {shown.map((room) => (
                  <RoomCard key={room.id} room={room} />
                ))}
              </div>
            )}
            <p className="spaces-booking-note"><Clock3 size={15} /> Availability varies by time. Open a space to view its calendar and request a booking.</p>
          </section>
        )}
      </div>
    </StudentLayout>
  );
}
