// AI room search against the FastAPI backend (POST /rooms/ai-search).
// The endpoint is on feature/ai-room-search and not yet on `dev`, so a network
// error or 404 falls back to sample rooms, flagged with isSample.
import { SLOT_HOURS, sampleSlotStatus } from "./availability";
import { ROOM_PHOTOS, SAMPLE_ROOMS } from "../data/sampleRooms";
import { API_BASE_URL, ApiError } from "./http";

class EndpointUnavailable extends Error {}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(API_BASE_URL + path, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}`,
      },
    });
  } catch {
    throw new EndpointUnavailable();
  }
  if (res.status === 404) throw new EndpointUnavailable();
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = typeof data?.detail === "string" ? data.detail : "Request failed. Please try again.";
    throw new ApiError(detail, res.status);
  }
  return data;
}

/** Backend room -> the shape the pages use. */
function fromBackend(room) {
  return {
    id: room.id,
    name: room.name,
    capacity: room.capacity,
    location: room.location,
    equipment: room.equipment ?? [],
    photo: ROOM_PHOTOS[Math.abs(Number(room.id) || 0) % ROOM_PHOTOS.length],
    isSample: Boolean(room.is_sample),
  };
}

const sameItem = (a, b) => a.trim().toLowerCase().replace(/s$/, "") === b.trim().toLowerCase().replace(/s$/, "");

/** Sample-data version of the backend's filters: capacity, every requested item, and a free slot. */
function filterSampleRooms({ date, startTime, endTime, minCapacity = 1, equipment = [] }) {
  return SAMPLE_ROOMS.filter(
    (room) =>
      room.capacity >= minCapacity &&
      equipment.every((item) => room.equipment.some((own) => sameItem(own, item))) &&
      (!date || !startTime || !endTime || isSampleRoomFree(room.id, date, startTime, endTime))
  ).sort((a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name));
}

function isSampleRoomFree(roomId, date, startTime, endTime) {
  const first = Number(startTime.split(":")[0]);
  const last = Math.ceil(Number(endTime.split(":")[0]) + Number(endTime.split(":")[1]) / 60) - 1;
  for (let hour = first; hour <= last; hour++) {
    if (!SLOT_HOURS.includes(hour) || sampleSlotStatus(roomId, date, hour) !== "available") return false;
  }
  return true;
}

/**
 * @returns {Promise<{interpreted: object|null, rooms: object[], isSample: boolean}>}
 *   interpreted is null when the AI service could not be reached (sample fallback).
 */
export async function aiSearchRooms({ query, date = null, startTime = null, endTime = null }) {
  try {
    const data = await request("/rooms/ai-search", {
      method: "POST",
      body: JSON.stringify({ query, date, start_time: startTime, end_time: endTime }),
    });
    return { interpreted: data.interpreted_requirements, rooms: data.results.map(fromBackend), isSample: false };
  } catch (err) {
    if (!(err instanceof EndpointUnavailable)) throw err;
    // No AI extraction is possible offline; show the sample rooms without pretending to interpret the request.
    return { interpreted: null, rooms: filterSampleRooms({ date, startTime, endTime }), isSample: true };
  }
}
