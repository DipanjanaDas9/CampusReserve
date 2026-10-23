/** Sort search results by "capacity" (then name) or "name". */
export function sortRooms(rooms, by) {
  return [...rooms].sort((a, b) => (by === "name" ? a.name.localeCompare(b.name) : a.capacity - b.capacity || a.name.localeCompare(b.name)));
}
