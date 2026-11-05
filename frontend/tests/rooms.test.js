import { test } from "node:test";
import assert from "node:assert/strict";
import { facilityToRoom, filterFacilities } from "../src/lib/rooms.js";

const rooms = [
  { id: 42, name: "Library ground", building_name: "Central Library", floor_number: 0, room_number: "LIB-G01", room_type: "Study room", capacity: 6, equipment: ["Monitor", "Whiteboard"], is_active: true },
  { id: 43, name: "Library upstairs", building_name: "Central Library", floor_number: 1, capacity: 12, equipment: ["Monitor"], is_active: true },
  { id: 44, name: "Inactive", building_name: "Central Library", floor_number: 0, capacity: 20, equipment: ["Monitor", "Whiteboard"], is_active: false },
  { id: 45, name: "Legacy", capacity: 4, equipment: [], is_active: true },
];

test("catalog filters combine building, ground floor, capacity, and every equipment requirement", () => {
  assert.deepEqual(filterFacilities(rooms, { buildingName: "central library", floorNumber: 0, minCapacity: 6, equipment: ["Monitors", "Whiteboard"] }).map(r => r.id), [42]);
});

test("cleared filters preserve legacy rooms and exclude inactive rooms", () => {
  assert.deepEqual(filterFacilities(rooms, {}).map(r => r.id), [42, 43, 45]);
  assert.deepEqual(filterFacilities(rooms, { floorNumber: 1 }).map(r => r.id), [43]);
});

test("room adapter preserves database ID and all catalog and operating-hours fields", () => {
  const facility = { ...rooms[0], opening_time: "08:00", closing_time: "22:00" };
  const result = facilityToRoom(facility);
  for (const [key, value] of Object.entries(facility)) assert.deepEqual(result[key], value);
  assert.equal(result.isSample, false);
});
