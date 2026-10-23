// Sample facilities for pages whose backend endpoints are not on `dev` yet.
// Every record has isSample: true and pages label them "Sample data" —
// they are not real campus rooms or availability.
//
// The first three ids match SAMPLE_SPACES in api/availability.js so the
// availability calendar and booking page show the same rooms.

// Same Unsplash photos as Dashboard.jsx.
export const ROOM_PHOTOS = [
  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=900&q=80",
];

export const EQUIPMENT_OPTIONS = ["Projector", "Whiteboard", "Computer", "Monitor", "Video conferencing"];

export const OPERATING_HOURS = "8:00 AM – 7:00 PM";

export const SAMPLE_ROOMS = [
  {
    id: "lib-204",
    name: "Library Study Room 204",
    building: "Library Building",
    floor: "2nd Floor",
    capacity: 6,
    equipment: ["Projector", "Whiteboard"],
    description: "A quiet study room suited to small group meetings, with a projector and whiteboard.",
    photo: ROOM_PHOTOS[0],
    isSample: true,
  },
  {
    id: "eng-312",
    name: "Engineering Room 312",
    building: "Engineering Building",
    floor: "3rd Floor",
    capacity: 10,
    equipment: ["Projector", "Whiteboard", "Monitor"],
    description: "A large meeting room for team meetings, presentations and study groups.",
    photo: ROOM_PHOTOS[1],
    isSample: true,
  },
  {
    id: "sc-101",
    name: "Student Center 101",
    building: "Student Center",
    floor: "1st Floor",
    capacity: 8,
    equipment: ["Whiteboard", "Video conferencing"],
    description: "A flexible space for study groups, meetings and club activities.",
    photo: ROOM_PHOTOS[2],
    isSample: true,
  },
  {
    id: "sci-205",
    name: "Science Lab 205",
    building: "Science Building",
    floor: "2nd Floor",
    capacity: 15,
    equipment: ["Computer", "Projector"],
    description: "A computer lab for workshops and hands-on sessions.",
    photo: ROOM_PHOTOS[0],
    isSample: true,
  },
  {
    id: "bus-110",
    name: "Business Room 110",
    building: "Business Building",
    floor: "1st Floor",
    capacity: 12,
    equipment: ["Monitor", "Video conferencing", "Whiteboard"],
    description: "A seminar room set up for hybrid meetings.",
    photo: ROOM_PHOTOS[1],
    isSample: true,
  },
].map((room) => ({ ...room, location: `${room.building} · ${room.floor}` }));

export function findSampleRoom(id) {
  return SAMPLE_ROOMS.find((room) => room.id === id);
}
