// Placeholder for the FastAPI backend: GET /api/v1/spaces/{id}/availability?start=YYYY-MM-DD&end=YYYY-MM-DD
const API_BASE_URL = (import.meta.env.VITE_BOOKING_API_BASE_URL || "").replace(/\/$/, "");
/** One-hour slots from 8:00 AM through the 6:00 PM start (6:00–7:00 PM). */
export const SLOT_HOURS = Array.from({ length: 11 }, (_, i) => 8 + i);
export const SAMPLE_SPACES = [
    { id: "eng-312", name: "Engineering Room 312" },
    { id: "lib-204", name: "Library Study Room 204" },
    { id: "sc-101", name: "Student Center 101" },
];
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
/** Deterministic demo pattern so the calendar has something to show before the backend exists.
 *  Also used by the sample room search, so search results and the calendar agree. */
export function sampleSlotStatus(spaceId, isoDate, hour) {
    const seed = String(spaceId).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const dayOfMonth = Number(isoDate.slice(8, 10));
    const v = (seed + dayOfMonth * 7 + SLOT_HOURS.indexOf(hour) * 13) % 9;
    return v < 3 ? "booked" : "available";
}
function sampleSlots(spaceId, weekStart) {
    const slots = [];
    for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + i);
        const date = toISODate(day);
        SLOT_HOURS.forEach((hour) => slots.push({ date, hour, status: sampleSlotStatus(spaceId, date, hour) }));
    }
    return slots;
}
export async function getAvailability(spaceId, weekStart) {
    if (!API_BASE_URL)
        return { slots: sampleSlots(spaceId, weekStart), isSample: true };
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const res = await fetch(`${API_BASE_URL}/api/v1/spaces/${encodeURIComponent(spaceId)}/availability?start=${toISODate(weekStart)}&end=${toISODate(end)}`, {headers:{Authorization:`Bearer ${sessionStorage.getItem("access_token") || ""}`}});
    if (!res.ok)
        throw new Error("Could not load availability.");
    return { slots: (await res.json()), isSample: false };
}
