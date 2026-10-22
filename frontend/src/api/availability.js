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
/** Deterministic demo pattern so the calendar has something to show before the backend exists. */
function sampleSlots(spaceId, weekStart) {
    const seed = spaceId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const slots = [];
    for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + i);
        SLOT_HOURS.forEach((hour, j) => {
            const v = (seed + day.getDate() * 7 + j * 13) % 9;
            if (v < 3)
                slots.push({ date: toISODate(day), hour, status: "booked" });
            else
                slots.push({ date: toISODate(day), hour, status: "available" });
        });
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
