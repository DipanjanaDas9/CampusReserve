// Reservations API (backend/app/routers/reservations.py). The server re-checks
// opening hours and conflicts; the calendar selection is only preliminary.
import { apiRequest } from "./http";
import { campusISO } from "../lib/datetime";

/**
 * Request a reservation. `date`, `start` and `end` are campus wall-clock values
 * ("2026-10-30", "14:00"). Purpose, attendees and notes are not stored by the backend yet.
 */
export async function submitReservation({ space_id, date, start, end }) {
  const facilityId = Number(space_id);
  if (!Number.isInteger(facilityId) || facilityId < 1) {
    throw new Error("This is a sample room and cannot be booked. Choose a facility from Search Spaces.");
  }
  return apiRequest("/reservations", {
    method: "POST",
    body: { facility_id: facilityId, start_time: campusISO(date, start), end_time: campusISO(date, end) },
  });
}

/** [{id, facility_id, facility_name, start_time, end_time, status, checked_in_at, created_at}] */
export const listMyReservations = () => apiRequest("/reservations/me");

export const cancelReservation = (id) => apiRequest(`/reservations/${id}/cancel`, { method: "PATCH" });
