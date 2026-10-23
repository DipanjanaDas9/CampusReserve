import { apiFetch } from "./client";

export const listRooms = () => apiFetch("/rooms");
export const getRoom = (id) => apiFetch(`/rooms/${encodeURIComponent(id)}`);

export function searchRooms({ date, startTime, endTime, minCapacity, equipment }) {
  const params = new URLSearchParams({ date, start_time: startTime, end_time: endTime, min_capacity: String(minCapacity) });
  equipment.forEach((item) => params.append("equipment", item));
  return apiFetch(`/rooms/search?${params}`);
}

export function aiSearchRooms({ query, date, startTime, endTime }) {
  return apiFetch("/rooms/ai-search", {
    method: "POST",
    body: { query, date: date || null, start_time: startTime || null, end_time: endTime || null },
  });
}
