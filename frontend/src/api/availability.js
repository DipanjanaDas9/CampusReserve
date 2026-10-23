import { apiFetch } from "./client";

/** One-hour slots from 8:00 AM through the 6:00 PM start (6:00–7:00 PM), matching the backend opening hours. */
export const SLOT_HOURS = Array.from({ length: 11 }, (_, i) => 8 + i);

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfWeek(d) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - r.getDay());
  return r;
}

/** Slots are [{date, hour, status}] with status "available", "booked" or "past". */
export async function getAvailability(roomId, weekStart) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const params = new URLSearchParams({ start: toISODate(weekStart), end: toISODate(end) });
  return { slots: await apiFetch(`/rooms/${encodeURIComponent(roomId)}/availability?${params}`) };
}
