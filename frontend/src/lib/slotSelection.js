/** Toggle an hour; switching to another date starts a fresh selection. Booked/unknown slots are ignored. */
export function toggleSlot(sel, date, hour, lookup) {
    if (lookup(date, hour) !== "available")
        return sel;
    if (!sel || sel.date !== date)
        return { date, hours: [hour] };
    const hours = sel.hours.includes(hour) ? sel.hours.filter((h) => h !== hour) : [...sel.hours, hour].sort((a, b) => a - b);
    return hours.length ? { date, hours } : null;
}
export function checkSelection(sel, lookup) {
    if (!sel || sel.hours.length === 0)
        return { ok: false, reason: "empty" };
    const first = sel.hours[0];
    const last = sel.hours[sel.hours.length - 1];
    for (let h = first; h <= last; h++) {
        if (lookup(sel.date, h) === "booked")
            return { ok: false, reason: "spans-booked" };
    }
    if (last - first + 1 !== sel.hours.length)
        return { ok: false, reason: "not-consecutive" };
    return { ok: true, date: sel.date, startHour: first, endHour: last + 1, durationHours: sel.hours.length };
}
