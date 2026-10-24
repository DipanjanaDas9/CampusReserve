
import { API_BASE_URL } from "./auth";

async function adminRequest(path, options = {}) {
  const token = sessionStorage.getItem("access_token");

  if (!token) {
    throw new Error("Please sign in as an administrator.");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : `Request failed (${response.status})`
    );
  }

  return data;
}

export function getAdminReservations() {
  return adminRequest("/admin/reservations");
}

export function decideAdminReservation(id, status) {
  return adminRequest(`/reservations/${id}/decision`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
