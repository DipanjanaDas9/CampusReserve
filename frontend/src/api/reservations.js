
import { authenticatedFetch } from "./authenticatedFetch";
import { campusISO } from "../lib/datetime";

const API_BASE_URL = (
  import.meta.env.VITE_BOOKING_API_BASE_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

export const RESERVATION_ENDPOINT = "/reservations";

// Support both reservation input formats from our branches.
function normalizeReservation(req) {
  // Latest backend-compatible request format.
  if (req?.facility_id != null) {
    return req;
  }

  // Earlier dev frontend request format.
  const facilityId = Number(req?.space_id);

  if (!Number.isInteger(facilityId) || facilityId < 1) {
    throw new Error(
      "This is a sample room and cannot be booked. " +
      "Choose a facility from Search Spaces."
    );
  }

  if (!req?.date || !req?.start || !req?.end) {
    throw new Error("Please select a valid date and time.");
  }

  return {
    facility_id: facilityId,
    start_time: campusISO(req.date, req.start),
    end_time: campusISO(req.date, req.end),
    ...(req.attendees !== undefined
      ? { attendees: req.attendees }
      : {}),
    ...(req.purpose !== undefined
      ? { purpose: req.purpose }
      : {}),
    ...(req.notes !== undefined
      ? { notes: req.notes }
      : {}),
  };
}

// Shared helper for reservation API calls.
async function reservationRequest(path, options = {}) {
  const token = sessionStorage.getItem("access_token");

  if (!token) {
    throw new Error("Please sign in before continuing.");
  }

  let response;

  try {
    response = await authenticatedFetch(
      `${API_BASE_URL}${path}`,
      {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token}`,
        },
      }
    );
  } catch (error) {
    // Preserve the session-expiration handling.
    if (
      error?.message ===
        "Your session has expired. Please sign in again." ||
      error?.message === "Please sign in again."
    ) {
      throw error;
    }

    throw new Error(
      "Cannot connect to the reservation server.",
      { cause: error }
    );
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    let message = "Reservation request failed.";

    if (typeof data?.detail === "string") {
      message = data.detail;
    } else if (Array.isArray(data?.detail)) {
      message = data.detail
        .map((issue) => issue.msg)
        .join(", ");
    }

    throw new Error(message);
  }

  return data;
}

// Create a reservation.
export async function submitReservation(req) {
  const payload = normalizeReservation(req);

  return reservationRequest(RESERVATION_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

// Retrieve the current user's reservations.
export async function getMyReservations() {
  return reservationRequest("/reservations/me");
}

// Preserve the function name used by the dev branch.
export const listMyReservations = getMyReservations;

// Cancel a reservation.
export async function cancelReservation(id) {
  return reservationRequest(
    `/reservations/${id}/cancel`,
    { method: "PATCH" }
  );
}

// Check in to a reservation.
export async function checkInReservation(id) {
  return reservationRequest(
    `/reservations/${id}/check-in`,
    { method: "PATCH" }
  );
}
