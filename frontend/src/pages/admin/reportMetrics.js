import { campusISO, CAMPUS_TIME_ZONE, todayISO } from "../../lib/datetime";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const hourFormat = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: CAMPUS_TIME_ZONE });

export const reservationTimestamp = iso => Date.parse(/(?:Z|[+-]\d\d:\d\d)$/i.test(iso) ? iso : `${iso}Z`);

export function reportPeriod(days, previous = false) {
  const end = Date.parse(todayISO()) + DAY - (previous ? days * DAY : 0);
  const start = end - days * DAY;
  const dates = Array.from({ length: days + 1 }, (_, index) => new Date(start + index * DAY).toISOString().slice(0, 10));
  const boundaries = dates.map(date => Date.parse(campusISO(date, "00:00")));
  return { dates, boundaries, operatingTimes: new Map(), label: `${dayFormat.format(start)} – ${dayFormat.format(end - DAY)}` };
}

export function groupBookings(bookings, keyFor) {
  const groups = new Map();
  for (const booking of bookings) {
    const key = keyFor(booking);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(booking);
  }
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
}

export function summarizeBookings(bookings, facilities, period, now) {
  const { dates, boundaries } = period;
  const first = boundaries[0];
  const last = boundaries.at(-1);
  const rows = bookings.filter(booking => booking.start >= first && booking.start < last);
  const eligible = rows.filter(booking => booking.status === "approved" && booking.end <= now);
  const missed = eligible.filter(booking => booking.noShow).length;
  const startsByHour = Array(24).fill(0);
  rows.forEach(booking => { startsByHour[Number(hourFormat.format(booking.start))] += 1; });
  const windows = startsByHour.slice(0, -1).map((count, hour) => count + startsByHour[hour + 1]);
  const peakCount = Math.max(...windows);
  const peakHour = windows.indexOf(peakCount);
  const bucketCount = Math.min(5, dates.length - 1);
  const trend = Array.from({ length: bucketCount }, (_, index) => {
    const offset = Math.floor(index * (dates.length - 1) / bucketCount);
    const next = Math.floor((index + 1) * (dates.length - 1) / bucketCount);
    return {
      label: dayFormat.format(Date.parse(dates[offset])),
      value: rows.filter(booking => booking.start >= boundaries[offset] && booking.start < boundaries[next]).length,
    };
  });

  return {
    rows, missed, eligible: eligible.length, trend, peakHour,
    peakShare: rows.length ? peakCount / rows.length * 100 : null,
    noShowRate: eligible.length ? missed / eligible.length * 100 : null,
    ...measureUtilization(bookings, facilities, period),
  };
}


export function measureUtilization(bookings, facilities, { dates, boundaries, operatingTimes }) {
  const first = boundaries[0];
  const last = boundaries.at(-1);
  const approvedByFacility = new Map(groupBookings(
    bookings.filter(booking => booking.status === "approved" && booking.start < last && booking.end > first),
    booking => booking.facility_id,
  ));
  let open = 0;
  let booked = 0;
  for (const facility of facilities) {
    if (!facility.is_active || !facility.opening_time || !facility.closing_time) continue;
    const approved = approvedByFacility.get(facility.id) || [];
    const schedule = `${facility.opening_time}–${facility.closing_time}`;
    if (!operatingTimes.has(schedule)) {
      operatingTimes.set(schedule, dates.slice(0, -1).map(date => [
        Date.parse(campusISO(date, facility.opening_time)),
        Date.parse(campusISO(date, facility.closing_time)),
      ]).filter(([opens, closes]) => closes > opens));
    }
    for (const [opens, closes] of operatingTimes.get(schedule)) {
      open += closes - opens;
      const intervals = approved.filter(booking => booking.start < closes && booking.end > opens)
        .sort((a, b) => a.start - b.start);
      let coveredThrough = opens;
      for (const booking of intervals) {
        const start = Math.max(booking.start, coveredThrough);
        const end = Math.min(booking.end, closes);
        if (end > start) {
          booked += end - start;
          coveredThrough = end;
        }
      }
    }
  }

  return {
    utilization: open ? booked / open * 100 : null,
    bookedHours: booked / HOUR,
    openHours: open / HOUR,
  };
}
