import { apiFetch } from "./client";

export const getAdminStats = () => apiFetch("/admin/stats");
export const listAdminReservations = (status) => apiFetch(`/admin/reservations${status ? `?status=${status}` : ""}`);
export const approveReservation = (id) => apiFetch(`/admin/reservations/${id}/approve`, { method: "POST" });
export const rejectReservation = (id, reason) => apiFetch(`/admin/reservations/${id}/reject`, { method: "POST", body: { reason } });
export const createRoom = (room) => apiFetch("/admin/rooms", { method: "POST", body: room });
export const updateRoom = (id, room) => apiFetch(`/admin/rooms/${id}`, { method: "PUT", body: room });
export const deleteRoom = (id) => apiFetch(`/admin/rooms/${id}`, { method: "DELETE" });
