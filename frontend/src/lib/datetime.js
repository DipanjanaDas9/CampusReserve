import { toISODate } from "../api/availability";

export const todayISO = () => toISODate(new Date());

/** "14:00" -> "2:00 PM" */
export function formatTime(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "2026-10-24" -> "Oct 24, 2026" */
export function formatDate(iso) {
  if (!iso) return "";
  return new Date(`${iso}T00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Today", "Tomorrow" or "" for an ISO date. */
export function relativeDay(iso) {
  const today = new Date(`${todayISO()}T00:00`);
  const days = Math.round((new Date(`${iso}T00:00`) - today) / 86400000);
  return days === 0 ? "Today" : days === 1 ? "Tomorrow" : "";
}

/** Minutes between two "HH:MM" times. */
export function minutesBetween(start, end) {
  const toMinutes = (t) => Number(t.split(":")[0]) * 60 + Number(t.split(":")[1]);
  return toMinutes(end) - toMinutes(start);
}

/** "2:00 PM – 4:00 PM" and "(2 hours)" */
export function formatTimeRange(start, end) {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function formatDuration(start, end) {
  const minutes = minutesBetween(start, end);
  const hours = minutes / 60;
  if (Number.isInteger(hours)) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.floor(hours)} h ${minutes % 60} min`;
}

// The campus is in America/Chicago (backend/app/core/config.py). Reservations are
// sent as ISO times with the campus UTC offset, which changes with daylight saving.
export const CAMPUS_TIME_ZONE = "America/Chicago";

/** Offset of the campus time zone at a given instant, e.g. "-05:00". */
function campusOffset(date) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TIME_ZONE, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName").value; // "GMT-05:00" (or "GMT" at offset 0)
  return name === "GMT" ? "+00:00" : name.slice(3);
}

/** "2026-10-30" + "14:00" (campus wall clock) -> "2026-10-30T14:00:00-05:00". */
export function campusISO(isoDate, hhmm) {
  // Start from the wall-clock time read as UTC, then correct by the campus offset at that moment.
  const asUtc = new Date(`${isoDate}T${hhmm}:00Z`);
  let offset = campusOffset(asUtc);
  const shift = (o) => (o.startsWith("-") ? 1 : -1) * (Number(o.slice(1, 3)) * 60 + Number(o.slice(4, 6))) * 60000;
  offset = campusOffset(new Date(asUtc.getTime() + shift(offset)));
  return `${isoDate}T${hhmm}:00${offset}`;
}

/** Backend timestamp (UTC ISO) -> campus date and time parts for display. */
export function campusParts(isoTimestamp) {
  const d = new Date(isoTimestamp);
  const date = d.toLocaleDateString("en-US", { timeZone: CAMPUS_TIME_ZONE, weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { timeZone: CAMPUS_TIME_ZONE, hour: "numeric", minute: "2-digit" });
  return { date, time };
}
