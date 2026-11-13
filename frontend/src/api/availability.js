import { authenticatedFetch } from "./authenticatedFetch";
import { API_BASE_URL } from "./auth";

// One-hour slots from 8 AM to 10 PM; the last slot starts at 9 PM.
export const SLOT_HOURS = Array.from(
  { length: 14 },
  (_, i) => 8 + i
);

const CAMPUS_TIMEZONE = "America/Chicago";

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
}

export function startOfWeek(d) {
  const result = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate()
  );

  result.setDate(result.getDate() - result.getDay());
  return result;
}

// Determine Central Time's offset for a particular date.
// This handles daylight saving time.
function campusOffset(date) {
  const reference = new Date(`${date}T12:00:00Z`);

  const text = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIMEZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(reference)
    .find((part) => part.type === "timeZoneName")?.value;

  const match = text?.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);

  if (!match) {
    throw new Error("Could not determine campus timezone.");
  }

  const sign = match[1];
  const hours = match[2].padStart(2, "0");
  const minutes = match[3] || "00";

  return `${sign}${hours}:${minutes}`;
}

function campusTimestamp(date, hour) {
  const hh = String(hour).padStart(2, "0");
  return `${date}T${hh}:00:00${campusOffset(date)}`;
}

async function apiGet(path) {
  const token = sessionStorage.getItem("access_token");


  const url = `${API_BASE_URL}${path}`;

  const response = token
    ? await authenticatedFetch(url)
    : await fetch(url);

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      typeof data?.detail === "string"
        ? data.detail
        : `API request failed (${response.status})`
    );
    error.status = response.status;
    throw error;
  }

  return data;
}

// Load actual facilities from SQLite.
export async function getFacilities() {
  return apiGet("/facilities");
}

async function checkSlot(facilityId, date, hour) {
  const start = campusTimestamp(date, hour);
  const end = campusTimestamp(date, hour + 1);

  // The API refuses any start time that has passed, including the current hour.
  if (new Date(start) <= new Date()) {
    return { date, hour, status: "unavailable" };
  }

  const params = new URLSearchParams({
    start_time: start,
    end_time: end,
    attendees: "1",
  });

  let result;

  try {
    result = await apiGet(
      `/facilities/${facilityId}/availability?${params}`
    );
  } catch (err) {
    // A 400 means the API refused this slot's times, for example because the
    // hour began while the calendar was loading. Other failures are real errors.
    if (err.status === 400) {
      return { date, hour, status: "unavailable" };
    }

    throw err;
  }

let status = "available";

if (!result.available) {
  const reason = String(result.reason || "").toLowerCase();

  if (
    reason.includes("already reserved") ||
    reason.includes("existing reservation") ||
    reason.includes("overlap") ||
    reason.includes("booking conflict")
  ) {
    status = "booked";
  } else {
    status = "unavailable";
  }
}

  return { date, hour, status };
}

export async function getAvailability(facilityId, weekStart) {
  const tasks = [];

  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);

    const date = toISODate(day);

    for (const hour of SLOT_HOURS) {
      tasks.push({ date, hour });
    }
  }

  const slots = [];

  // Limit simultaneous requests so the local API is not flooded.
  const batchSize = 6;

  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);

    const results = await Promise.all(
      batch.map(({ date, hour }) =>
        checkSlot(facilityId, date, hour)
      )
    );

    slots.push(...results);
  }

  return {
    slots,
    isSample: false,
  };
}



export async function checkRoomAvailability(
  facilityId,
  date,
  startTime,
  endTime,
  attendees = 1
) {
  const offset = campusOffset(date);

  const start = `${date}T${startTime}:00${offset}`;
  const end = `${date}T${endTime}:00${offset}`;

  const params = new URLSearchParams({
    start_time: start,
    end_time: end,
    attendees: String(attendees),
  });

  return apiGet(
    `/facilities/${facilityId}/availability?${params}`
  );
}
