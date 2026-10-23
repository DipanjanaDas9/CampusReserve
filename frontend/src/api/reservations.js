import { apiFetch } from "./client";

// The backend re-checks availability; the frontend selection is only preliminary.
export const submitReservation = (req) => apiFetch("/reservations", { method: "POST", body: req });
export const listMyReservations = () => apiFetch("/reservations/me");
export const cancelReservation = (id) => apiFetch(`/reservations/${id}/cancel`, { method: "POST" });
export const checkInReservation = (id) => apiFetch(`/reservations/${id}/check-in`, { method: "POST" });
