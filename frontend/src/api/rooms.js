// Room search against the FastAPI backend: manual search over GET /facilities plus
// availability checks, and AI search over POST /rooms/ai-search. Results are always real rooms.
import { ROOM_PHOTOS } from "../data/sampleRooms";
import { authenticatedFetch } from "./authenticatedFetch";
import {
  getFacilities,
  checkRoomAvailability,
} from "./availability";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Backend room -> the shape the pages use. */
function fromBackend(room) {
  return {
    ...room,
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

/**
 * @returns {Promise<{rooms: object[], isSample: boolean}>}
 */

export async function searchRooms({
  date,
  startTime,
  endTime,
  minCapacity = 1,
  equipment = [],
}) {
  // Retrieve real facilities from SQLite through FastAPI.
  const facilities = await getFacilities();

  // First filter by group size and equipment.

const matching = facilities.filter((room) => {
  // Hide inactive facilities from student searches.
  const isActive = room.is_active === true;
  const roomEquipment = room.equipment ?? [];
  const capacityMatches =
    room.capacity >= Number(minCapacity);
  const equipmentMatches = equipment.every((item) =>
    roomEquipment.some((own) => sameItem(own, item))
  );
  return isActive && capacityMatches && equipmentMatches;
});


  // Check actual reservation availability for each room.
  const checks = await Promise.all(
    matching.map(async (room) => {
      const availability = await checkRoomAvailability(
        room.id,
        date,
        startTime,
        endTime,
        Number(minCapacity)
      );

      return { room, availability };
    })
  );

  // Only show rooms that are available for the requested time.
  const availableRooms = checks
    .filter(({ availability }) => availability.available)
    .map(({ room }) => fromBackend(room));

  return {
    rooms: availableRooms,
    isSample: false,
  };
}


/**
 * @returns {Promise<{interpreted: object, rooms: object[], isSample: boolean}>}
 *   Throws ApiError with the server's message when the AI search fails.
 */

export async function aiSearchRooms({
  query,
  date = null,
  startTime = null,
  endTime = null,
}) {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/rooms/ai-search`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        date,
        start_time: startTime,
        end_time: endTime,
      }),
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof data?.detail === "string"
        ? data.detail
        : `AI search failed (${response.status}).`;

    throw new ApiError(message, response.status);
  }

  if (
    !data?.interpreted_requirements ||
    !Array.isArray(data.results)
  ) {
    throw new Error("AI search returned an unexpected response.");
  }

  return {
    interpreted: data.interpreted_requirements,
    rooms: data.results.map(fromBackend),
    isSample: false,
  };
}