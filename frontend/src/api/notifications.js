import { API_BASE_URL } from "./auth";

async function notificationRequest(path, options = {}) {
  const token = sessionStorage.getItem("access_token");

  if (!token) {
    throw new Error("Please log in to view notifications.");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : `Notification request failed (${response.status})`
    );
  }

  return data;
}

export function getNotifications() {
  return notificationRequest("/notifications");
}

export function markNotificationRead(id) {
  return notificationRequest(`/notifications/${id}/read`, {
    method: "PATCH",
  });
}

export function markAllNotificationsRead() {
  return notificationRequest("/notifications/read-all", {
    method: "PATCH",
  });
}
