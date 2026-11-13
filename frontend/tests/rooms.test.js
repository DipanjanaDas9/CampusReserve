import { test } from "node:test";
import assert from "node:assert/strict";
import { facilityToRoom, filterFacilities, sortRooms } from "../src/lib/rooms.js";

test("best-match sort puts the highest AI fit score first and breaks ties by capacity", () => {
  const ranked = [
    { name: "Small", capacity: 4, match_score: 70 },
    { name: "Tie B", capacity: 8, match_score: 88 },
    { name: "Exact", capacity: 6, match_score: 100 },
    { name: "Tie A", capacity: 8, match_score: 88 },
  ];
  assert.deepEqual(sortRooms(ranked, "match").map((r) => r.name), ["Exact", "Tie A", "Tie B", "Small"]);
  assert.deepEqual(sortRooms(ranked, "capacity").map((r) => r.name), ["Small", "Exact", "Tie A", "Tie B"]);
  assert.deepEqual(sortRooms([{ name: "B", capacity: 9 }, { name: "A", capacity: 3 }], "match").map((r) => r.name), ["A", "B"]);
});

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
