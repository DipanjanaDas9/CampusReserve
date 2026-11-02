import { authenticatedFetch } from "./authenticatedFetch";
const API_BASE_URL = (
  import.meta.env.VITE_BOOKING_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

export const RESERVATION_ENDPOINT = "/reservations";

export async function submitReservation(req) {
  const token = sessionStorage.getItem("access_token");

  if (!token) {
    throw new Error("Please log in before making a reservation.");
  }

  let res;

  try {
    res = await authenticatedFetch(`${API_BASE_URL}${RESERVATION_ENDPOINT}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(req),
    });
  } catch (error) {
  if (
    error.message === "Your session has expired. Please sign in again." ||
    error.message === "Please sign in again."
  ) {
    throw error;
  }

  throw new Error("Cannot connect to the reservation server.");
}

  const data = await res.json();

  if (!res.ok) {
    let message = "Reservation request failed.";

    if (typeof data.detail === "string") {
      message = data.detail;
    } else if (Array.isArray(data.detail)) {
      message = data.detail
        .map((error) => error.msg)
        .join(", ");
    }

    throw new Error(message);
  }

  return data;
}

export async function getMyReservations() {
  const token = sessionStorage.getItem("access_token");

  const response = await authenticatedFetch(
    `${API_BASE_URL}/reservations/me`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "Could not load reservations."
    );
  }

  return data;
}

export async function cancelReservation(id) {
  const token = sessionStorage.getItem("access_token");

  const response = await authenticatedFetch(
    `${API_BASE_URL}/reservations/${id}/cancel`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "Could not cancel reservation."
    );
  }

  return data;
}


export async function checkInReservation(id) {
  const token = sessionStorage.getItem("access_token");

  if (!token) {
    throw new Error("Please log in before checking in.");
  }

  let response;

  try {
    response = await authenticatedFetch(
      `${API_BASE_URL}/reservations/${id}/check-in`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
  } catch (error) {
  if (
    error.message === "Your session has expired. Please sign in again." ||
    error.message === "Please sign in again."
  ) {
    throw error;
  }

  throw new Error("Cannot connect to the reservation server.");
}

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "Could not check in to the reservation."
    );
  }

  return data;
}

