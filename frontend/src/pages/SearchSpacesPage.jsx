import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  Check,
  Clock3,
  Grid2X2,
  List,
  MapPin,
  Monitor,
  Search,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { StudentLayout } from "../layouts/StudentLayout";
import { listFacilities } from "../api/facilities";
import { checkRoomAvailability } from "../api/availability";
import { EQUIPMENT_OPTIONS } from "../data/sampleRooms";
import { SortSelect } from "../components/RoomCard";
import { StatusMessage } from "../components/StatusMessage";
import { facilityToRoom, filterFacilities, sortRooms } from "../lib/rooms";
import { campusNow } from "../lib/datetime";
import { cn } from "../lib/utils";
import "./SearchSpacesPage.css";

const EMPTY_FILTERS = {
  query: "",
  roomType: "",
  date: "",
  timeRange: "",
  groupSize: "1",
  equipment: [],
  building: "",
  floor: "",
};

const TIME_RANGES = [
  ["08:00", "10:00"],
  ["10:00", "12:00"],
  ["12:00", "14:00"],
  ["14:00", "16:00"],
  ["16:00", "18:00"],
  ["18:00", "20:00"],
  ["20:00", "22:00"],
];

function timeLabel(value) {
  const [hour, minute] = value.split(":").map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function roomMatchesQuery(room, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    room.name,
    room.location,
    room.building_name,
    room.room_type,
    ...(room.equipment ?? []),
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

function EquipmentFilter({ equipment, onToggle }) {
  return (
    <details className="spaces-equipment-filter">
      <summary aria-label="Filter by equipment">
        <Monitor size={15} aria-hidden="true" />
        <span>
          <strong>Equipment</strong>
          <small>{equipment.length ? equipment.join(", ") : "Any equipment"}</small>
        </span>
      </summary>
      <fieldset className="spaces-equipment-menu">
        <legend>Required equipment</legend>
        {EQUIPMENT_OPTIONS.map((item) => (
          <label key={item}>
            <input
              type="checkbox"
              checked={equipment.includes(item)}
              onChange={() => onToggle(item)}
            />
            <span>{item}</span>
          </label>
        ))}
      </fieldset>
    </details>
  );
}

function SearchResultCard({ room, available, date, timeRange, groupSize, viewMode }) {
  const [startTime, endTime] = timeRange ? timeRange.split("|") : [];
  const bookUrl =
    available && date && startTime && endTime
      ? `/spaces/${encodeURIComponent(room.id)}/book?${new URLSearchParams({
          date,
          start: startTime,
          end: endTime,
          attendees: groupSize,
        })}`
      : `/spaces/${encodeURIComponent(room.id)}`;

  return (
    <article className={cn("spaces-room-card", viewMode === "list" && "is-list")}>
      <Link
        to={`/spaces/${encodeURIComponent(room.id)}`}
        state={{ room }}
        className="spaces-room-photo-link"
        aria-label={`View ${room.name}`}
      >
        <img src={room.photo} alt="" className="spaces-room-photo" loading="lazy" />
      </Link>
      <div className="spaces-room-info">
        <h3>
          <Link to={`/spaces/${encodeURIComponent(room.id)}`} state={{ room }}>
            {room.name}
          </Link>
        </h3>
        <p className="spaces-room-location">
          <MapPin size={13} aria-hidden="true" />
          <span>
            {room.building_name || room.location}
            {room.floor_number != null
              ? ` · ${room.floor_number === 0 ? "Ground floor" : `Level ${room.floor_number}`}`
              : ""}
          </span>
        </p>
        <ul className="spaces-room-equipment" aria-label="Equipment">
          {(room.equipment ?? []).slice(0, 3).map((item) => (
            <li key={item}>{item}</li>
          ))}
          {(room.equipment ?? []).length > 3 && (
            <li>+{room.equipment.length - 3}</li>
          )}
        </ul>
        <div className="spaces-room-footer">
          <span className="spaces-room-capacity">
            <Users size={14} aria-hidden="true" />
            {room.capacity}
          </span>
          <span
            className={cn(
              "spaces-availability",
              available === true && "is-available",
              available === false && "is-unavailable"
            )}
          >
            <span aria-hidden="true" />
            {available === true
              ? "Available"
              : available === false
                ? "Unavailable"
                : "Choose a time"}
          </span>
          <Link className="spaces-reserve-button" to={bookUrl} state={{ room }}>
            Reserve
          </Link>
        </div>
      </div>
    </article>
  );
}

export function SearchSpacesPage() {
  const [rooms, setRooms] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [formError, setFormError] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");
  const [availabilityById, setAvailabilityById] = useState(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [sortBy, setSortBy] = useState("capacity");
  const [viewMode, setViewMode] = useState("grid");

  useEffect(() => {
    listFacilities()
      .then((list) =>
        setRooms(list.filter((room) => room.is_active).map(facilityToRoom))
      )
      .catch((err) => setLoadError(err.message));
  }, []);

  const buildings = useMemo(
    () =>
      [...new Set((rooms ?? []).map((room) => room.building_name).filter(Boolean))].sort(),
    [rooms]
  );

  const roomTypes = useMemo(
    () =>
      [...new Set((rooms ?? []).map((room) => room.room_type).filter(Boolean))].sort(),
    [rooms]
  );

  const floors = useMemo(
    () =>
      [
        ...new Set(
          (rooms ?? [])
            .filter((room) => !filters.building || room.building_name === filters.building)
            .map((room) => room.floor_number)
            .filter((floor) => floor != null)
        ),
      ].sort((a, b) => a - b),
    [rooms, filters.building]
  );

  const candidates = useMemo(() => {
    if (!rooms) return [];
    return filterFacilities(rooms, {
      minCapacity: Number(applied.groupSize),
      equipment: applied.equipment,
      buildingName: applied.building,
      floorNumber: applied.floor === "" ? null : Number(applied.floor),
    })
      .filter((room) => !applied.roomType || room.room_type === applied.roomType)
      .filter((room) => roomMatchesQuery(room, applied.query));
  }, [rooms, applied]);

  const shown = useMemo(() => {
    const withAvailability = availabilityById
      ? candidates.filter((room) => availabilityById[String(room.id)] === true)
      : candidates;
    return sortRooms(withAvailability, sortBy);
  }, [candidates, availabilityById, sortBy]);

  const hasFilters =
    applied.query.trim() !== "" ||
    applied.roomType !== "" ||
    applied.date !== "" ||
    applied.timeRange !== "" ||
    applied.groupSize !== "1" ||
    applied.equipment.length > 0 ||
    applied.building !== "" ||
    applied.floor !== "";

  const set = (key) => (event) =>
    setFilters((current) => ({ ...current, [key]: event.target.value }));

  const toggleEquipment = (item) =>
    setFilters((current) => ({
      ...current,
      equipment: current.equipment.includes(item)
        ? current.equipment.filter((value) => value !== item)
        : [...current.equipment, item],
    }));

  async function onSubmit(event) {
    event.preventDefault();
    const groupSize = Number(filters.groupSize);
    if (!Number.isInteger(groupSize) || groupSize < 1) {
      setFormError("Group size must be a whole number of at least 1.");
      return;
    }
    if (Boolean(filters.date) !== Boolean(filters.timeRange)) {
      setFormError("Choose both a date and a time range to check availability.");
      return;
    }
    setFormError("");
    setAvailabilityError("");
    setAvailabilityById(null);
    const nextApplied = { ...filters, equipment: [...filters.equipment] };
    setApplied(nextApplied);

    if (!nextApplied.date || !rooms) return;

    setCheckingAvailability(true);
    try {
      const startTime = nextApplied.timeRange.split("|")[0];
      const endTime = nextApplied.timeRange.split("|")[1];
      const matchingRooms = filterFacilities(rooms, {
        minCapacity: groupSize,
        equipment: nextApplied.equipment,
        buildingName: nextApplied.building,
        floorNumber: nextApplied.floor === "" ? null : Number(nextApplied.floor),
      })
        .filter((room) => !nextApplied.roomType || room.room_type === nextApplied.roomType)
        .filter((room) => roomMatchesQuery(room, nextApplied.query));
      const resultById = {};

      for (let index = 0; index < matchingRooms.length; index += 6) {
        const batch = matchingRooms.slice(index, index + 6);
        const results = await Promise.all(
          batch.map(async (room) => {
            try {
              const result = await checkRoomAvailability(
                room.id,
                nextApplied.date,
                startTime,
                endTime,
                groupSize
              );
              return [String(room.id), Boolean(result.available)];
            } catch (error) {
              if (error.status === 400) return [String(room.id), false];
              throw error;
            }
          })
        );
        for (const [id, available] of results) resultById[id] = available;
      }

      setAvailabilityById(resultById);
    } catch (error) {
      setAvailabilityError(
        error instanceof Error ? error.message : "Could not check room availability."
      );
    } finally {
      setCheckingAvailability(false);
    }
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setFormError("");
    setAvailabilityError("");
    setAvailabilityById(null);
  }

  return (
    <StudentLayout active="search">
      <div className="spaces-page mx-auto max-w-6xl">
        <form onSubmit={onSubmit} className="campus-page-banner spaces-hero" aria-label="Search campus spaces">
          <div className="spaces-hero-copy">
            <h1>Find Campus Spaces</h1>
            <p>Search and filter available rooms, labs, and facilities.</p>
          </div>
          <label className="spaces-keyword-search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search by space, building, or keyword</span>
            <input
              type="search"
              value={filters.query}
              onChange={set("query")}
              placeholder="Search by space, building, or keyword..."
            />
            <button type="submit" disabled={!rooms || checkingAvailability}>
              {checkingAvailability ? "Checking..." : "Search"}
            </button>
          </label>
          <div className="spaces-primary-filters">
            <label className="spaces-select-filter">
              <Building2 size={15} aria-hidden="true" />
              <span>
                <strong>Room type</strong>
                <select value={filters.roomType} onChange={set("roomType")} aria-label="Room type">
                  <option value="">All types</option>
                  {roomTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </span>
            </label>
            <label className="spaces-select-filter">
              <CalendarDays size={15} aria-hidden="true" />
              <span>
                <strong>Date</strong>
                <input
                  type="date"
                  value={filters.date}
                  min={campusNow().date}
                  onChange={set("date")}
                  aria-label="Reservation date"
                />
              </span>
            </label>
            <label className="spaces-select-filter">
              <Clock3 size={15} aria-hidden="true" />
              <span>
                <strong>Time</strong>
                <select value={filters.timeRange} onChange={set("timeRange")} aria-label="Time range">
                  <option value="">Choose a time</option>
                  {TIME_RANGES.map(([start, end]) => (
                    <option key={`${start}-${end}`} value={`${start}|${end}`}>
                      {timeLabel(start)} – {timeLabel(end)}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <label className="spaces-select-filter">
              <Building2 size={15} aria-hidden="true" />
              <span>
                <strong>Building</strong>
                <select value={filters.building} onChange={(event) => setFilters((current) => ({
                  ...current,
                  building: event.target.value,
                  floor: "",
                }))} aria-label="Building">
                  <option value="">All buildings</option>
                  {buildings.map((building) => <option key={building} value={building}>{building}</option>)}
                </select>
              </span>
            </label>
            <EquipmentFilter equipment={filters.equipment} onToggle={toggleEquipment} />
          </div>
          <details className="spaces-advanced-filters">
            <summary><span><Check size={14} aria-hidden="true" /> More filters</span></summary>
            <div className="spaces-advanced-fields">
              <label>
                <Users size={15} aria-hidden="true" />
                <span>Group size</span>
                <input
                  type="number"
                  min="1"
                  value={filters.groupSize}
                  onChange={set("groupSize")}
                  aria-label="Group size"
                />
              </label>
              <label>
                <Building2 size={15} aria-hidden="true" />
                <span>Floor</span>
                <select value={filters.floor} onChange={set("floor")} aria-label="Floor">
                  <option value="">Any floor</option>
                  {floors.map((floor) => (
                    <option key={floor} value={floor}>
                      {floor === 0 ? "Ground floor (0)" : `Floor ${floor}`}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={resetFilters}>Reset filters</button>
            </div>
          </details>
        </form>

        <StatusMessage kind="error" className="mt-3">{formError}</StatusMessage>
        <StatusMessage kind="error" className="mt-3">{loadError}</StatusMessage>
        <StatusMessage kind="error" className="mt-3">{availabilityError}</StatusMessage>

        {!rooms && !loadError && (
          <div className="spaces-loading" role="status" aria-label="Loading spaces">
            {[1, 2, 3, 4].map((number) => <div key={number} className="spaces-skeleton"><div /><span /><span /></div>)}
            <span className="sr-only">Loading spaces…</span>
          </div>
        )}

        {rooms && (
          <section className="spaces-results" aria-live="polite" aria-labelledby="results-heading">
            <div className="spaces-results-heading">
              <h2 id="results-heading">
                {checkingAvailability ? "Checking availability..." : `${shown.length} Spaces Found`}
              </h2>
              <div className="spaces-result-actions">
                <SortSelect id="search-sort" value={sortBy} onChange={setSortBy} />
                <div className="spaces-view-toggle" role="group" aria-label="Results layout">
                  <button
                    type="button"
                    className={cn(viewMode === "grid" && "is-active")}
                    aria-label="Grid view"
                    aria-pressed={viewMode === "grid"}
                    onClick={() => setViewMode("grid")}
                  >
                    <Grid2X2 size={14} aria-hidden="true" /> Grid
                  </button>
                  <button
                    type="button"
                    className={cn(viewMode === "list" && "is-active")}
                    aria-label="List view"
                    aria-pressed={viewMode === "list"}
                    onClick={() => setViewMode("list")}
                  >
                    <List size={14} aria-hidden="true" /> List
                  </button>
                </div>
              </div>
            </div>
            {hasFilters && (
              <div className="spaces-applied">
                <span>Filtered by</span>
                {applied.query && <b>“{applied.query}”</b>}
                {applied.roomType && <b>{applied.roomType}</b>}
                {applied.date && <b>{applied.date}</b>}
                {applied.timeRange && <b>{applied.timeRange.replace("|", " – ")}</b>}
                {applied.groupSize !== "1" && <b>{applied.groupSize}+ people</b>}
                {applied.building && <b>{applied.building}</b>}
                {applied.floor !== "" && <b>Floor {applied.floor}</b>}
                {applied.equipment.map((item) => <b key={item}>{item}</b>)}
                <button type="button" onClick={resetFilters}>Clear all</button>
              </div>
            )}
            {shown.length === 0 ? (
              <div className="spaces-empty">
                <span><Search size={26} aria-hidden="true" /></span>
                <h3>{rooms.length === 0 ? "Your campus spaces are on their way" : "No spaces found"}</h3>
                <p>
                  {rooms.length === 0
                    ? "Facilities will appear here once your campus administrator adds them."
                    : availabilityById
                      ? "No spaces are available for this date and time. Try another time or adjust your filters."
                      : "Try another search or clear some filters to see more campus spaces."}
                </p>
                {hasFilters && <button type="button" onClick={resetFilters}>Clear filters <Check size={15} aria-hidden="true" /></button>}
              </div>
            ) : (
              <div className={cn("spaces-results-grid", viewMode === "list" && "is-list")}>
                {shown.map((room) => (
                  <SearchResultCard
                    key={room.id}
                    room={room}
                    available={availabilityById?.[String(room.id)]}
                    date={applied.date}
                    timeRange={applied.timeRange}
                    groupSize={applied.groupSize}
                    viewMode={viewMode}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </StudentLayout>
  );
}
