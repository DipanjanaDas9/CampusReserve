// Sample data for the admin pages. There are no admin endpoints or roles on the
// backend yet, so every record is isSample: true and the pages say so.
// Actions on these pages change local React state only.
const iso = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const SAMPLE_STATS = {
  totalReservations: { value: 124, change: 12 },
  utilization: { value: 68, change: 5 },
  noShowRate: { value: 4, change: 1 },
  isSample: true,
};

export const SAMPLE_WEEKLY_RESERVATIONS = [
  { day: "Mon", count: 18 },
  { day: "Tue", count: 24 },
  { day: "Wed", count: 21 },
  { day: "Thu", count: 27 },
  { day: "Fri", count: 16 },
  { day: "Sat", count: 8 },
  { day: "Sun", count: 10 },
];

export const SAMPLE_MOST_USED = [
  { room: "Library Study Room 204", count: 42 },
  { room: "Engineering Room 312", count: 28 },
  { room: "Student Center 101", count: 20 },
  { room: "Science Lab 205", count: 18 },
  { room: "Business Room 110", count: 12 },
];

export const SAMPLE_REQUESTS = [
  { id: "REQ-1001", event: "CS Study Group", description: "Weekly study session for CS101 midterm preparation.", requester: { name: "John Doe", email: "john.doe@campus.edu" }, roomId: "lib-204", date: iso(1), start: "10:00", end: "12:00", attendees: 5, notes: "", status: "pending" },
  { id: "REQ-1002", event: "Marketing Meeting", description: "Planning the spring club fair.", requester: { name: "Alice Smith", email: "alice.smith@campus.edu" }, roomId: "sc-101", date: iso(2), start: "14:00", end: "16:00", attendees: 8, notes: "Needs the video call setup.", status: "pending" },
  { id: "REQ-1003", event: "Project Presentation", description: "Capstone dry run for the SE course.", requester: { name: "Robert Johnson", email: "robert.johnson@campus.edu" }, roomId: "eng-312", date: iso(3), start: "13:00", end: "15:00", attendees: 10, notes: "", status: "pending" },
  { id: "REQ-1004", event: "Club Orientation", description: "Welcome session for new robotics club members.", requester: { name: "Maria Lopez", email: "maria.lopez@campus.edu" }, roomId: "bus-110", date: iso(4), start: "09:00", end: "11:00", attendees: 12, notes: "", status: "pending" },
  { id: "REQ-0998", event: "Lab Workshop", description: "Intro to Python workshop.", requester: { name: "Priya Patel", email: "priya.patel@campus.edu" }, roomId: "sci-205", date: iso(-1), start: "15:00", end: "17:00", attendees: 14, notes: "", status: "approved" },
  { id: "REQ-0996", event: "Thesis Review", description: "Thesis chapter review with advisor.", requester: { name: "Kevin Brown", email: "kevin.brown@campus.edu" }, roomId: "lib-204", date: iso(-2), start: "11:00", end: "12:00", attendees: 2, notes: "", status: "approved" },
  { id: "REQ-0993", event: "Dance Practice", description: "Rehearsal for the cultural night.", requester: { name: "Sara Kim", email: "sara.kim@campus.edu" }, roomId: "sc-101", date: iso(-3), start: "18:00", end: "19:00", attendees: 16, notes: "Room capacity is 8.", status: "rejected", reason: "Group is larger than the room capacity." },
].map((request) => ({ ...request, isSample: true }));
