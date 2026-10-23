import { useMemo, useRef, useState } from "react";
import { CalendarDays, Check, FileText, MapPin, NotebookPen, Search, User, Users, X } from "lucide-react";
import { AdminLayout } from "../../layouts/AdminLayout";
import { SampleDataLabel } from "../../components/SampleDataLabel";
import { SAMPLE_REQUESTS } from "../../data/sampleAdmin";
import { findSampleRoom } from "../../data/sampleRooms";
import { formatDate, formatDuration, formatTimeRange } from "../../lib/datetime";
import { cn } from "../../lib/utils";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All Requests" },
];

const STATUS_STYLES = {
  pending: "bg-chart-4/25 text-foreground",
  approved: "bg-success/15 text-foreground",
  rejected: "bg-destructive/10 text-destructive",
};

const roomName = (id) => findSampleRoom(id)?.name ?? id;
const initials = (name) => name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();

const approveClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-success/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const rejectClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-destructive/50 bg-card px-3 py-1.5 text-sm font-semibold text-destructive hover:bg-destructive/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function ApprovalsPage() {
  const [requests, setRequests] = useState(SAMPLE_REQUESTS);
  const [tab, setTab] = useState("pending");
  const [query, setQuery] = useState("");
  const [room, setRoom] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [rejecting, setRejecting] = useState(false);
  const [notice, setNotice] = useState("");

  const counts = useMemo(() => {
    const c = { all: requests.length };
    requests.forEach((r) => (c[r.status] = (c[r.status] ?? 0) + 1));
    return c;
  }, [requests]);

  const shown = requests.filter((r) => {
    const q = query.trim().toLowerCase();
    return (
      (tab === "all" || r.status === tab) &&
      (!room || r.roomId === room) &&
      (!q || r.event.toLowerCase().includes(q) || r.requester.name.toLowerCase().includes(q))
    );
  });
  const selected = requests.find((r) => r.id === selectedId) ?? null;
  const roomIds = [...new Set(SAMPLE_REQUESTS.map((r) => r.roomId))];

  function open(request, startRejecting = false) {
    setSelectedId(request.id);
    setRejecting(startRejecting);
    setNotice("");
  }

  function decide(id, status, reason = "") {
    const request = requests.find((r) => r.id === id);
    setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, status, reason } : r)));
    setRejecting(false);
    setNotice(`${request.event} ${status === "approved" ? "approved" : "rejected"}.`);
  }

  return (
    <AdminLayout active="requests">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground md:text-3xl">Reservation Requests</h1>
              <SampleDataLabel />
            </div>
            <p className="mt-1 text-muted-foreground">Review and approve or reject room reservation requests.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="relative">
              <span className="sr-only">Search by event name or user</span>
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by event name or user…"
                className="h-9 w-64 rounded-md border border-input bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label>
              <span className="sr-only">Filter by room</span>
              <select value={room} onChange={(e) => setRoom(e.target.value)} className="h-9 rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">All Rooms</option>
                {roomIds.map((id) => (
                  <option key={id} value={id}>
                    {roomName(id)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div role="tablist" aria-label="Request status" className="mt-6 flex gap-1 overflow-x-auto border-b">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {label} ({counts[key] ?? 0})
            </button>
          ))}
        </div>

        <p role="status" className="mt-3 min-h-5 text-sm text-foreground">{notice}</p>

        <div className="mt-2 flex flex-col gap-4 2xl:flex-row 2xl:items-start">
          <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border bg-card shadow-card">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-secondary/60 text-left text-muted-foreground">
                <tr>
                  {["Event Name", "Requester", "Room", "Date & Time", "Status", "Actions"].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No {tab === "all" ? "" : tab} requests match.</td>
                  </tr>
                )}
                {shown.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => open(r)}
                    className={cn("cursor-pointer border-t hover:bg-accent/40", selectedId === r.id && "bg-accent/60")}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {/* The event name is the keyboard way to open the detail panel. */}
                      <button type="button" onClick={(e) => { e.stopPropagation(); open(r); }} className="text-left hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {r.event}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">{initials(r.requester.name)}</span>
                        <span>
                          <span className="block text-foreground">{r.requester.name}</span>
                          <span className="text-xs text-muted-foreground">Student</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-foreground">{roomName(r.roomId)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-foreground">
                      {formatDate(r.date)}
                      <span className="block text-xs text-muted-foreground">{formatTimeRange(r.start, r.end)}</span>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3">
                      {r.status === "pending" ? (
                        <div className="flex gap-2">
                          <button type="button" className={approveClass} onClick={(e) => { e.stopPropagation(); decide(r.id, "approved"); }} aria-label={`Approve ${r.event}`}>Approve</button>
                          <button type="button" className={rejectClass} onClick={(e) => { e.stopPropagation(); open(r, true); }} aria-label={`Reject ${r.event}`}>Reject</button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && (
            <DetailPanel
              key={selected.id}
              request={selected}
              rejecting={rejecting}
              setRejecting={setRejecting}
              onApprove={() => decide(selected.id, "approved")}
              onReject={(reason) => decide(selected.id, "rejected", reason)}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function StatusBadge({ status }) {
  return <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium capitalize", STATUS_STYLES[status])}>{status}</span>;
}

function DetailPanel({ request: r, rejecting, setRejecting, onApprove, onReject, onClose }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const reasonRef = useRef(null);
  const rows = [
    { icon: User, label: "Requester", value: <>{r.requester.name}<span className="block text-xs text-muted-foreground">Student ({r.requester.email})</span></> },
    { icon: CalendarDays, label: "Event Name", value: r.event },
    { icon: FileText, label: "Description", value: r.description },
    { icon: MapPin, label: "Room", value: roomName(r.roomId) },
    { icon: CalendarDays, label: "Date & Time", value: <>{formatDate(r.date)}<span className="block">{formatTimeRange(r.start, r.end)} ({formatDuration(r.start, r.end)})</span></> },
    { icon: Users, label: "Expected Attendees", value: r.attendees },
    { icon: NotebookPen, label: "Additional Notes", value: r.notes || "No additional notes." },
    ...(r.status === "rejected" ? [{ icon: X, label: "Rejection Reason", value: r.reason }] : []),
  ];

  function submitReject(e) {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Enter a reason so the student knows why.");
      reasonRef.current?.focus();
      return;
    }
    onReject(reason.trim());
  }

  return (
    <aside className="order-first w-full shrink-0 rounded-xl border bg-card p-5 shadow-card 2xl:order-last 2xl:w-96" aria-labelledby="request-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="request-title" className="text-xl font-bold text-foreground">{r.event}</h2>
            <StatusBadge status={r.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Reservation Request Details</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close details" className="rounded-md p-1 hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 2xl:grid-cols-1">
        {rows.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex gap-3">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <dt className="font-semibold text-foreground">{label}</dt>
              <dd className="text-muted-foreground">{value}</dd>
            </div>
          </div>
        ))}
      </dl>

      {r.status === "pending" && !rejecting && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
          <button type="button" onClick={onApprove} className={cn(approveClass, "w-full py-2.5")}>
            <Check className="h-4 w-4" aria-hidden="true" /> Approve Request
          </button>
          <button type="button" onClick={() => setRejecting(true)} className={cn(rejectClass, "w-full py-2.5")}>
            <X className="h-4 w-4" aria-hidden="true" /> Reject Request
          </button>
        </div>
      )}
      {r.status === "pending" && rejecting && (
        <form onSubmit={submitReject} className="mt-6 space-y-3 border-t pt-4">
          <label htmlFor="reject-reason" className="block text-sm font-semibold text-foreground">Reason for rejection</label>
          <textarea
            id="reject-reason"
            ref={reasonRef}
            autoFocus
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(""); }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "reject-error" : undefined}
            placeholder="e.g. The room is reserved for exams that day."
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {error && <p id="reject-error" role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" className="flex-1 rounded-md bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              Confirm rejection
            </button>
            <button type="button" onClick={() => setRejecting(false)} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Back
            </button>
          </div>
        </form>
      )}
    </aside>
  );
}
