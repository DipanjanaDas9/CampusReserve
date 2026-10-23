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
