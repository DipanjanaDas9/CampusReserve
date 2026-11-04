import { ROOM_PHOTOS } from "../data/sampleRooms";

/** Sort search results by "capacity" (then name) or "name". */
export function sortRooms(rooms, by) {
  return [...rooms].sort((a, b) => (by === "name" ? a.name.localeCompare(b.name) : a.capacity - b.capacity || a.name.localeCompare(b.name)));
}

/** Backend facility (GET /facilities) -> the shape RoomCard and the details page use. */
export function facilityToRoom(facility) {
  return {
    ...facility,
    location: facility.location || "Location not set",
    description: facility.restrictions || "",
    photo: ROOM_PHOTOS[Math.abs(Number(facility.id) || 0) % ROOM_PHOTOS.length],
    isSample: false,
  };
}

const sameItem = (a, b) => a.trim().toLowerCase().replace(/s$/, "") === b.trim().toLowerCase().replace(/s$/, "");

/** Client-side search over facilities: capacity, every requested item, and location text. */
export function filterFacilities(rooms, { minCapacity = 1, equipment = [], location = "" }) {
  const place = location.trim().toLowerCase();
  return rooms.filter(
    (room) =>
      room.capacity >= minCapacity &&
      equipment.every((item) => room.equipment.some((own) => sameItem(own, item))) &&
      (!place || (room.location ?? "").toLowerCase().includes(place))
  );
}
