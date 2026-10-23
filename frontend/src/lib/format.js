const HOUR_FMT = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

/** "14:00" -> "2:00 PM" */
export function fmtTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return HOUR_FMT.format(new Date(2000, 0, 1, h, m));
}

/** "2026-10-23" -> "Fri, Oct 23, 2026" */
export function fmtDate(iso, opts = { weekday: "short", month: "short", day: "numeric", year: "numeric" }) {
  return new Date(`${iso}T00:00`).toLocaleDateString("en-US", opts);
}

export function fmtRange(r) {
  return `${fmtTime(r.start_time)} – ${fmtTime(r.end_time)}`;
}

/** "2026-10-23 14:05:00" (SQLite UTC) or ISO -> "5 min ago" style text. */
export function timeAgo(text) {
  const then = new Date(text.includes("T") ? text : `${text.replace(" ", "T")}Z`);
  const minutes = Math.round((Date.now() - then.getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}
