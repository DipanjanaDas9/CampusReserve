// Placeholder for the FastAPI backend: POST /api/v1/reservations
// The backend must re-check availability; the frontend selection is only preliminary.
const API_BASE_URL = (import.meta.env.VITE_BOOKING_API_BASE_URL || "").replace(/\/$/, "");
export const RESERVATION_ENDPOINT = "/api/v1/reservations";
export async function submitReservation(req) {
    if (!API_BASE_URL) {
        throw new Error("Reservations aren't available yet — the backend is not connected.");
    }
    const res = await fetch(`${API_BASE_URL}${RESERVATION_ENDPOINT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}` },
        
        body: JSON.stringify(req),
    });
    if (!res.ok) {
        let msg = "This time slot is no longer available or the request failed.";
        try {
            const data = (await res.json());
            if (typeof data.detail === "string")
                msg = data.detail;
        }
        catch {
            /* keep default */
        }
        throw new Error(msg);
    }
}
