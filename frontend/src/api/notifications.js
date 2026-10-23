import { apiFetch } from "./client";

export const listNotifications = () => apiFetch("/notifications/me");
export const markNotificationRead = (id) => apiFetch(`/notifications/${id}/read`, { method: "POST" });
export const markAllNotificationsRead = () => apiFetch("/notifications/read-all", { method: "POST" });
