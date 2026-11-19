import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, ArrowUpDown, Building2, CalendarCheck, CalendarDays, Check,
  ChevronLeft, ChevronRight, CircleCheck, CircleX, Clock3, Download,
  Search, UserPlus, Users, X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { decideAdminReservation, getAdminReservations } from "../../api/adminReservations";
import { listFacilities } from "../../api/facilities";
import { getNotifications } from "../../api/notifications";
import { AdminBanner } from "../../components/AdminBanner";
import { AdminLayout } from "../../layouts/AdminLayout";
import { campusParts } from "../../lib/datetime";
import { downloadCsv } from "../../lib/downloadCsv";
import { reportPeriod, reservationTimestamp } from "./reportMetrics";
import "./AdminDashboardPage.css";

const FILTERS = { date: "", status: "", building: "", room: "", search: "" };
const QUEUE_STATUSES = [["pending", "Pending"], ["approved", "Approved"], ["denied", "Rejected"],
  ["cancelled", "Cancelled"], ["", "All Requests"]];
const STATUS = { approved: "Approved", pending: "Pending", cancelled: "Cancelled", denied: "Rejected" };
const NUMBERS = new Intl.NumberFormat("en-US");
const TEXT = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const COLUMNS = [
  ["Request", "id"], ["Requester", "requester"], ["Facility", "facility_name"],
  ["Date & Time", "starts"], ["Attendees", "attendees"], ["Status", "status"],
];

const requestCode = id => `REQ-${id}`;
const statusLabel = status => STATUS[status] || status;
const initials = name => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "—";
const dateRange = value => value ? reportPeriod(Number(value)).boundaries : null;

function reservationTime(row) {
  if (!Number.isFinite(row.starts) || !Number.isFinite(row.ends)) return { date: "—", time: "—" };
  const start = campusParts(row.starts);
  const end = campusParts(row.ends);
  return { date: start.date, time: `${start.time} – ${start.date === end.date ? "" : `${end.date}, `}${end.time}` };
}

function metricsFor(rows) {
  const current = reportPeriod(30).boundaries;
  const prior = reportPeriod(30, true).boundaries;
  const today = current.at(-2);
  const tomorrow = current.at(-1);
  const lastWeek = current.at(-9);
  const lastWeekEnd = current.at(-8);
  const within = (value, from, to) => value >= from && value < to;
  const countPeriod = (bounds, status) => rows.filter(row =>
    (!status || row.status === status) && within(row.created, bounds[0], bounds.at(-1))).length;
  const countApproved = (from, to) => rows.filter(row =>
    row.status === "approved" && within(row.starts, from, to)).length;
  const approvedToday = countApproved(today, tomorrow);
  return [
    ["Total Reservations", rows.length, CalendarCheck, countPeriod(current), countPeriod(prior), "vs. prior 30 days", "higher"],
    ["Pending Approvals", rows.filter(row => row.status === "pending").length, Clock3,
      countPeriod(current, "pending"), countPeriod(prior, "pending"), "vs. prior 30 days", "neutral"],
    ["Approved for Today", approvedToday, CircleCheck, approvedToday,
      countApproved(lastWeek, lastWeekEnd), "vs. same day last week", "higher"],
    ["Cancelled", rows.filter(row => row.status === "cancelled").length, CircleX,
      countPeriod(current, "cancelled"), countPeriod(prior, "cancelled"), "vs. prior 30 days", "lower"],
  ];
}

function Metrics({ rows, loading, error }) {
  const metrics = useMemo(() => metricsFor(rows), [rows]);
  return <section className="operations-metrics" aria-label="Reservation overview">
    {metrics.map(([label, value, Icon, current, prior, comparison, preference]) => {
      const change = prior ? (current - prior) / prior * 100 : null;
      const positive = change && (preference === "higher" && change > 0 || preference === "lower" && change < 0);
      return <div key={label} className="operations-metric admin-metric-lift">
        <span className="operations-icon"><Icon aria-hidden="true" /></span>
        <div><h2>{label}</h2><strong>{loading ? "…" : error ? "—" : NUMBERS.format(value)}</strong></div>
        {change != null && <div className="operations-comparison">
          <span className={`operations-badge ${positive ? "is-approved" : preference === "neutral" && change ? "is-pending" : ""}`}>
            {change > 0 ? "↑ +" : change < 0 ? "↓ −" : ""}{NUMBERS.format(Math.abs(change).toFixed(0))}%
          </span>
          <small>{comparison}</small>
        </div>}
      </div>;
    })}
  </section>;
}

function SelectFilter({ label, Icon, value, onChange, options }) {
  return <label className="operations-filter">
    <span className="operations-filter-icon"><Icon aria-hidden="true" /></span>
    <span className="operations-filter-field">{label}
      <select value={value} onChange={event => onChange(event.target.value)}>
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </span>
  </label>;
}

function StatusBadge({ status }) {
  return <span className={`operations-badge is-${status}`}>{statusLabel(status)}</span>;
}

function ReservationTable({ rows, sort, onSort, loading, error, onView, showPurpose }) {
  return <div className="operations-table-scroll" role="region" tabIndex={0} aria-label="Reservations table">
    <table className="operations-table">
      <thead><tr>{COLUMNS.map(([label, key]) => <th key={label} scope="col"
        aria-sort={key && sort.key === key ? (sort.direction === 1 ? "ascending" : "descending") : undefined}>
        {key ? <button type="button" onClick={() => onSort(key)}>{label}<ArrowUpDown aria-hidden="true" /></button> : label}
      </th>)}</tr></thead>
      <tbody>
        {!rows.length && <tr><td colSpan={COLUMNS.length} className="operations-empty">
          {loading ? "Loading reservations…" : error ? "Reservations are unavailable." : "No reservations match these filters."}
        </td></tr>}
        {rows.map(row => {
          const { date, time } = reservationTime(row);
          return <tr key={row.id}>
            <th scope="row">
              <button type="button" className="operations-request-code" onClick={() => onView(row.id)}>{requestCode(row.id)}</button>
              {showPurpose && row.purpose && <small className="operations-purpose">{row.purpose}</small>}
            </th>
            <td><div className="operations-table-person">
              <span className="operations-avatar" aria-hidden="true">{initials(row.requester)}</span>
              <span><strong>{row.requester}</strong>{row.requester_email && row.requester_email !== row.requester && <small>{row.requester_email}</small>}</span>
            </div></td>
            <td><div className="operations-table-item"><Building2 aria-hidden="true" /><span><strong>{row.facility_name}</strong>
              {row.building && <small>{row.building}</small>}</span></div></td>
            <td><div className="operations-table-item"><CalendarDays aria-hidden="true" /><span><strong>{date}</strong><small>{time}</small></span></div></td>
            <td><div className="operations-table-item"><Users aria-hidden="true" />{row.attendees ?? "—"}</div></td>
            <td><StatusBadge status={row.status} /></td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}

function Pagination({ total, page, size, onPage, onSize }) {
  const last = Math.max(1, Math.ceil(total / size));
  const pages = [...new Set([1, ...[page - 1, page, page + 1].filter(n => n > 1 && n < last), last])];
  const firstRow = total ? (page - 1) * size + 1 : 0;
  return <div className="operations-pagination">
    <p>Showing {NUMBERS.format(firstRow)}–{NUMBERS.format(Math.min(total, page * size))} of {NUMBERS.format(total)} reservations</p>
    <div className="operations-pagination-controls">
      <label><span className="sr-only">Reservations per page</span><select value={size} onChange={event => onSize(Number(event.target.value))}>
        {[5, 10, 25, 50].map(value => <option key={value} value={value}>{value} per page</option>)}
      </select></label>
      <nav aria-label="Reservation pages">
        <button type="button" className="operations-icon-button" aria-label="Previous page" disabled={page === 1} onClick={() => onPage(page - 1)}><ChevronLeft aria-hidden="true" /></button>
        {pages.map((value, index) => <span className="operations-page-step" key={value}>
          {index > 0 && value - pages[index - 1] > 1 && <span aria-hidden="true">…</span>}
          <button type="button" aria-current={page === value ? "page" : undefined} aria-label={`Page ${value}`} onClick={() => onPage(value)}>{value}</button>
        </span>)}
        <button type="button" className="operations-icon-button" aria-label="Next page" disabled={page === last} onClick={() => onPage(page + 1)}><ChevronRight aria-hidden="true" /></button>
      </nav>
    </div>
  </div>;
}

function activityStyle(item) {
  const title = item.title.toLowerCase();
  if (title.includes("approved") || title.includes("confirmed") || item.kind === "confirmed") return [Check, "approved"];
  if (title.includes("cancel") || title.includes("reject") || item.kind === "cancelled") return [CircleX, "cancelled"];
  if (title.includes("pending")) return [Clock3, "pending"];
  return [UserPlus, "new"];
}

function relativeTime(value, now) {
  const timestamp = reservationTimestamp(value);
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return hours < 168 ? `${Math.floor(hours / 24)} d ago` : campusParts(timestamp).date;
}

function RecentActivity({ items, loading, error, now }) {
  return <aside className="operations-panel operations-activity" aria-labelledby="operations-activity-title">
    <header>
      <div><h2 id="operations-activity-title">Recent Reservation Activity</h2><p>The latest actions and updates on reservation requests.</p></div>
      <Link to="/admin/notifications" className="operations-link">View All <ArrowRight aria-hidden="true" /></Link>
    </header>
    {loading ? <p className="operations-empty">Loading activity…</p> : error ? <p className="operations-empty" role="status">{error}</p> :
      !items.length ? <p className="operations-empty">No recent reservation activity.</p> :
      <ul>{items.slice(0, 5).map(item => {
        const [Icon, tone] = activityStyle(item);
        return <li key={item.id}>
          <span className={`operations-icon is-${tone}`}><Icon aria-hidden="true" /></span>
          <span className="operations-activity-copy"><strong>{item.title}</strong>
            <small>{item.reservation_id && `${requestCode(item.reservation_id)} · `}{item.facility || item.body}</small></span>
          <time dateTime={item.created_at}>{relativeTime(item.created_at, now)}</time>
        </li>;
      })}</ul>}
  </aside>;
}

function ReservationDetails({ row, onClose, onDecision, saving, error }) {
  const dialog = useRef(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const { date, time } = reservationTime(row);

  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal();
  }, []);

  return <dialog ref={dialog} className="operations-dialog" aria-labelledby="operations-dialog-title" onClose={onClose}
    onCancel={event => { if (saving) event.preventDefault(); }}>
    <header><h2 id="operations-dialog-title">{requestCode(row.id)} <StatusBadge status={row.status} /></h2>
      <button type="button" className="operations-icon-button" aria-label="Close reservation" disabled={saving} onClick={() => dialog.current.close()}><X aria-hidden="true" /></button>
    </header>
    <dl>
      <div><dt>Requester</dt><dd>{row.requester}{row.requester_email && row.requester_email !== row.requester && <small>{row.requester_email}</small>}</dd></div>
      <div><dt>Facility</dt><dd>{row.facility_name}{row.building && <small>{row.building}</small>}</dd></div>
      <div><dt>Date &amp; Time</dt><dd>{date}<small>{time}</small></dd></div>
      <div><dt>Attendees</dt><dd>{row.attendees ?? "—"}</dd></div>
      <div><dt>Purpose</dt><dd>{row.purpose || "—"}</dd></div>
      {row.notes && <div><dt>Notes</dt><dd>{row.notes}</dd></div>}
      {row.rejection_reason && <div><dt>Rejection reason</dt><dd>{row.rejection_reason}</dd></div>}
    </dl>
    {error && <p className="operations-error" role="alert">{error}</p>}
    {row.status === "pending" && <form onSubmit={event => {
      event.preventDefault();
      if (rejecting ? reason.trim() : true) onDecision(rejecting ? "denied" : "approved", reason.trim());
    }}>
      {rejecting && <label>Rejection reason
        <textarea value={reason} rows={3} required maxLength={500} onChange={event => setReason(event.target.value)} />
      </label>}
      <div className="operations-dialog-actions">
        <button type="button" className="operations-secondary" disabled={saving} onClick={() => setRejecting(previous => !previous)}>
          {rejecting ? "Back" : "Reject"}
        </button>
        <button type="submit" className="operations-primary" disabled={saving || rejecting && !reason.trim()}>
          {saving ? "Saving…" : rejecting ? "Reject Reservation" : "Approve Reservation"}
        </button>
      </div>
    </form>}
  </dialog>;
}

export function AdminReservationsWorkspace({ reviewQueue = false }) {
  const [reservations, setReservations] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [activity, setActivity] = useState(null);
  const [activityError, setActivityError] = useState("");
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(() => reviewQueue ? { ...FILTERS, status: "pending" } : FILTERS);
  const [sort, setSort] = useState({ key: "id", direction: -1 });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(5);
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    getAdminReservations()
      .then(rows => {
        if (!Array.isArray(rows)) throw new Error("Unexpected reservations response.");
        if (active) setReservations(rows);
      })
      .catch(failure => { if (active) setError(failure.message); });
    listFacilities().then(rooms => { if (active && Array.isArray(rooms)) setFacilities(rooms); }).catch(() => {});
    if (!reviewQueue) getNotifications()
      .then(items => {
        if (!Array.isArray(items)) throw new Error("Unexpected activity response.");
        if (active) {
          setActivity(previous => [...(previous || []), ...items.filter(item => item.reservation_id != null)]);
          setNow(Date.now());
        }
      })
      .catch(failure => { if (active) setActivityError(failure.message); });
    return () => { active = false; };
  }, [reviewQueue]);

  const rows = useMemo(() => {
    const buildings = new Map(facilities.map(room => [room.id, room.building_name]));
    return (reservations || []).map(row => ({
      ...row, requester: row.requester_name || row.requester_email || "Unknown requester",
      building: buildings.get(row.facility_id) || "",
      starts: reservationTimestamp(row.start_time), ends: reservationTimestamp(row.end_time),
      created: reservationTimestamp(row.created_at),
    }));
  }, [facilities, reservations]);
  const filtered = useMemo(() => {
    const bounds = dateRange(filters.date);
    const query = filters.search.trim().toLowerCase();
    return rows.filter(row =>
      (!bounds || row.starts >= bounds[0] && row.starts < bounds.at(-1)) &&
      (!filters.status || row.status === filters.status) &&
      (!filters.building || row.building === filters.building) &&
      (!filters.room || String(row.facility_id) === filters.room) &&
      (!query || [requestCode(row.id), row.requester, row.requester_email, row.facility_name, row.building, row.purpose]
        .some(value => value?.toLowerCase().includes(query))))
      .sort((a, b) => sort.direction * TEXT.compare(
        sort.key === "status" ? statusLabel(a.status) : a[sort.key] ?? "",
        sort.key === "status" ? statusLabel(b.status) : b[sort.key] ?? "",
      ));
  }, [rows, filters, sort]);

  const buildings = [...new Set(facilities.map(room => room.building_name).filter(Boolean))].sort(TEXT.compare);
  const counts = new Map();
  const roomsById = new Map();
  for (const row of rows) {
    counts.set(row.status, (counts.get(row.status) || 0) + 1);
    roomsById.set(String(row.facility_id), row.facility_name);
  }
  const rooms = [...roomsById].sort((a, b) => TEXT.compare(a[1], b[1]));
  const pending = counts.get("pending") || 0;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / size)));
  const selected = rows.find(row => row.id === selectedId);
  const recent = (activity || []).slice(0, 5).map(item => ({ ...item, facility: rows.find(row => row.id === item.reservation_id)?.facility_name }));
  const filterBy = key => value => { setFilters(previous => ({ ...previous, [key]: value })); setPage(1); };
  const sortBy = key => {
    setSort(previous => ({ key, direction: previous.key === key ? -previous.direction : 1 }));
    setPage(1);
  };

  function exportReservations() {
    downloadCsv("reservations", ["Request", "Requester", "Email", "Facility", "Building", "Date (campus)", "Time (campus)", "Attendees", "Status"],
      filtered.map(row => {
        const { date, time } = reservationTime(row);
        return [requestCode(row.id), row.requester, row.requester_email, row.facility_name, row.building, date, time, row.attendees, statusLabel(row.status)];
      }));
    setNotice("Reservation CSV downloaded.");
  }

  async function decide(status, reason) {
    setSaving(true);
    setDecisionError("");
    try {
      await decideAdminReservation(selected.id, status, reason);
      setReservations(previous => previous.map(row => row.id === selected.id ? {
        ...row, status, rejection_reason: status === "denied" ? reason : null,
      } : row));
      const title = status === "approved" ? "Reservation approved" : "Reservation rejected";
      if (!reviewQueue) {
        const timestamp = Date.now();
        setActivity(previous => [{
          id: `decision-${selected.id}`, reservation_id: selected.id, title, created_at: new Date(timestamp).toISOString(),
        }, ...(previous || [])]);
        setNow(timestamp);
        setActivityError("");
      }
      setNotice(`${title}.`);
    } catch (failure) {
      setDecisionError(failure.message);
    } finally {
      setSaving(false);
    }
  }

  return <AdminLayout active={reviewQueue ? "requests" : "dashboard"}>
    <div className="admin-banner-page operations-dashboard">
      <AdminBanner eyebrow="Admin Operations • CampusReserve"
        title={reviewQueue ? "Reservation Requests" : <>Welcome to Reservations, Administrator! <span aria-hidden="true">👋</span></>}
        description={reviewQueue
          ? "Review campus space requests, check booking details, and approve or reject pending reservations."
          : "Manage reservation requests, review and approve bookings, and keep campus spaces running smoothly."} />
      <Metrics rows={rows} loading={!reservations && !error} error={error} />

      <div className={reviewQueue ? undefined : "operations-grid"}>
        <section className="operations-panel" aria-labelledby="operations-reservations-title">
          <header>
            <div><h2 id="operations-reservations-title">{reviewQueue ? "Request Queue" : "Reservations"}</h2>
              <p>{reviewQueue ? "Select a request ID to review its details." : "Review, approve, and manage all reservation requests across campus."}</p>
            </div>
            <div className="operations-header-actions">
              <button type="button" className="operations-secondary" onClick={exportReservations} disabled={!filtered.length}><Download aria-hidden="true" /> Export</button>
              {!reviewQueue && <button type="button" className="operations-primary" disabled={!reservations} onClick={() => {
                setFilters({ ...FILTERS, status: "pending" }); setPage(1);
              }}><CircleCheck aria-hidden="true" /> Review Pending ({NUMBERS.format(pending)})</button>}
            </div>
          </header>
          <div className="operations-filters" aria-label="Reservation filters">
            <SelectFilter label="Date" Icon={CalendarDays} value={filters.date} onChange={filterBy("date")}
              options={[["", "All Dates"], ["7", "Last 7 Days"], ["30", "Last 30 Days"], ["90", "Last 90 Days"]]} />
            {reviewQueue ? <SelectFilter label="Room" Icon={Building2} value={filters.room} onChange={filterBy("room")}
              options={[["", "All Rooms"], ...rooms]} /> :
              <SelectFilter label="Status" Icon={CircleCheck} value={filters.status} onChange={filterBy("status")}
                options={[["", "All Statuses"], ...Object.entries(STATUS)]} />}
            <SelectFilter label="Building" Icon={Building2} value={filters.building} onChange={filterBy("building")}
              options={[["", "All Buildings"], ...buildings.map(building => [building, building])]} />
            <label className="operations-filter operations-search">
              <span className="sr-only">Search reservations</span><Search aria-hidden="true" />
              <input type="search" value={filters.search} onChange={event => filterBy("search")(event.target.value)}
                placeholder={reviewQueue ? "Search by ID, event, or requester…" : "Search by request ID, requester, or facility…"} />
            </label>
          </div>
          {reviewQueue && <div className="operations-status-filters" role="group" aria-label="Request status">
            {QUEUE_STATUSES.map(([status, label]) => <button key={status} type="button" aria-pressed={filters.status === status}
              onClick={() => filterBy("status")(status)}>
              {label} <span>{reservations ? NUMBERS.format(status ? counts.get(status) || 0 : rows.length) : "—"}</span>
            </button>)}
          </div>}
          {error && <p className="operations-error" role="alert">{error}</p>}
          <span className="sr-only" role="status">{notice}</span>
          <ReservationTable rows={filtered.slice((currentPage - 1) * size, currentPage * size)} sort={sort} onSort={sortBy}
            loading={!reservations && !error} error={error} showPurpose={reviewQueue} onView={id => { setDecisionError(""); setSelectedId(id); }} />
          <Pagination total={filtered.length} page={currentPage} size={size} onPage={setPage} onSize={value => { setSize(value); setPage(1); }} />
        </section>
        {!reviewQueue && <RecentActivity items={recent} loading={!activity && !activityError} error={activityError} now={now} />}
      </div>
    </div>
    {selected && <ReservationDetails key={selected.id} row={selected} onClose={() => setSelectedId(null)}
      onDecision={decide} saving={saving} error={decisionError} />}
  </AdminLayout>;
}
