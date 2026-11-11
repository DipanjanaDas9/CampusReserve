import { Link } from "react-router-dom";
import { Check, MapPin, Users } from "lucide-react";
import { formatDuration, formatTimeRange } from "../lib/datetime";

export function EquipmentChips({ items }) {
  if (!items?.length) return <span className="text-xs text-muted-foreground">No listed equipment</span>;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Equipment">
      {items.map((item) => (
        <li key={item} className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          {item}
        </li>
      ))}
    </ul>
  );
}

/** AI search only: the fit score and why the room was recommended. Renders nothing for other searches. */
function MatchExplanation({ room }) {
  if (room.match_score == null) return null;
  return (
    <div className="mt-3 rounded-lg bg-primary/5 p-3 text-sm">
      <p className="font-semibold text-foreground">
        Fit score: {room.match_score}/100
        <span className="ml-2 text-xs font-normal text-muted-foreground">Smaller rooms that still fit your group score higher.</span>
      </p>
      {room.match_reasons?.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5 text-foreground" aria-label="Why this room matches">
          {room.match_reasons.map((reason) => (
            <li key={reason} className="flex items-start gap-1.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /> {reason}
            </li>
          ))}
        </ul>
      )}
      {room.match_tradeoffs?.length > 0 && (
        <ul className="mt-1 text-xs text-muted-foreground" aria-label="Things to consider">
          {room.match_tradeoffs.map((note) => <li key={note}>{note}</li>)}
        </ul>
      )}
    </div>
  );
}

/** Search result row: photo, details, availability and a link to the Facility Details page. */
export function RoomCard({ room, startTime, endTime }) {
  return (
    <article className="flex flex-col gap-4 rounded-xl border bg-card p-3 shadow-card sm:flex-row sm:items-stretch">
      <img src={room.photo} alt="" className="h-40 w-full rounded-lg bg-secondary object-cover sm:h-auto sm:w-52" />
      <div className="min-w-0 flex-1 py-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-bold text-foreground">{room.name}</h3>
          {room.isSample && <span className="rounded-full bg-chart-4/20 px-2 py-0.5 text-[11px] font-medium">Sample</span>}
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" /> {room.location}
        </p>
        {room.building_name && <p className="mt-2 text-xs text-muted-foreground">{room.building_name} · Floor {room.floor_number} · Room {room.room_number}{room.room_type ? ` · ${room.room_type}` : ""}</p>}
        <p className="mt-2 flex items-center gap-1.5 text-sm text-foreground">
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /> Capacity: {room.capacity}
        </p>
        <div className="mt-2">
          <EquipmentChips items={room.equipment} />
        </div>
        {room.description && <p className="mt-2 text-sm text-muted-foreground">{room.description}</p>}
        <MatchExplanation room={room} />
      </div>
      <div className="flex shrink-0 flex-row items-center justify-between gap-3 sm:w-44 sm:flex-col sm:items-end sm:justify-between sm:py-1">
        <div className="sm:text-right">
          {startTime && endTime && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-success/15 px-3 py-1 text-sm font-semibold text-foreground">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" /> Available
            </span>
          )}
          {startTime && endTime && (
            <p className="mt-2 text-sm text-foreground">
              {formatTimeRange(startTime, endTime)}
              <span className="block text-xs text-muted-foreground">({formatDuration(startTime, endTime)})</span>
            </p>
          )}
        </div>
        <Link
          to={`/spaces/${encodeURIComponent(room.id)}`}
          state={{ room }}
          className="rounded-md bg-primary px-5 py-2 text-center text-sm font-semibold text-primary-foreground shadow-brand hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-full"
        >
          View Details
        </Link>
      </div>
    </article>
  );
}

export function SortSelect({ id, value, onChange, bestMatch = false }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-muted-foreground">
      Sort by
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {bestMatch && <option value="match">Best match</option>}
        <option value="capacity">Capacity</option>
        <option value="name">Name</option>
      </select>
    </label>
  );
}
