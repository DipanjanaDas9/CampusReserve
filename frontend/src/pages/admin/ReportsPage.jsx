import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, BarChart3, Building2, CalendarDays, CircleX, Clock3, Download,
  FileText, Filter, Layers3, RotateCcw, X,
} from "lucide-react";
import { apiRequest } from "../../api/http";
import { listFacilities } from "../../api/facilities";
import { AdminBanner } from "../../components/AdminBanner";
import { AdminLayout } from "../../layouts/AdminLayout";
import { downloadCsv } from "../../lib/downloadCsv";
import { campusParts } from "../../lib/datetime";
import { groupBookings, reportPeriod, reservationTimestamp, summarizeBookings } from "./reportMetrics";
import "./ReportsPage.css";

const DEFAULT_FILTERS = { days: "30", building: "", type: "" };
const number = new Intl.NumberFormat("en-US");
const percent = value => value == null ? "—" : `${value.toFixed(1)}%`;
const hourLabel = hour => `${hour % 12 || 12} ${hour % 24 < 12 ? "AM" : "PM"}`;
const byType = booking => booking.facility?.room_type || "Unspecified";
const byBuilding = booking => booking.facility?.building_name || "Unspecified";
const byFacility = booking => booking.facility_id;

function FilterField({ label, Icon, value, onChange, options }) {
  return <label className="report-filter">
    <span className="report-icon"><Icon aria-hidden="true" /></span>
    <span className="report-field">{label}
      <select value={value} onChange={event => onChange(event.target.value)}>
        {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select>
    </span>
  </label>;
}

function Panel({ title, action, onAction, children }) {
  return <section className="report-panel">
    <div className="report-panel-heading">
      <h2>{title}</h2>
      {action && <button type="button" className="report-link" onClick={onAction}>{action}<ArrowRight aria-hidden="true" /></button>}
    </div>
    {children}
  </section>;
}

function Chart({ points, trend = false, label }) {
  if (!points.length) return <p className="report-empty">No bookings in this period.</p>;
  const step = Math.max(1, Math.ceil(Math.max(...points.map(point => point.value)) / 4));
  const max = 4 * step;
  const top = 18;
  const bottom = 130;
  const width = 460;
  const slot = width / points.length;
  const plotted = points.map(({ value }, index) => [36 + (index + 0.5) * slot, bottom - value / max * (bottom - top)]);
  const line = plotted.map(point => point.join(",")).join(" ");
  const barWidth = Math.min(66, slot * 0.75);

  return <svg className="report-chart" viewBox="0 0 504 166" role="img"
    aria-label={`${label}. ${points.map(point => `${point.label}: ${point.value}`).join(", ")}`}>
    <defs>
      <linearGradient id="report-trend-fill" x1="0" x2="0" y1="0" y2="1" gradientUnits="objectBoundingBox">
        <stop stopColor="#427cf3" stopOpacity=".43" />
        <stop offset="1" stopColor="#427cf3" stopOpacity=".08" />
      </linearGradient>
    </defs>
    {[0, 1, 2, 3, 4].map(tick => {
      const y = bottom - tick * (bottom - top) / 4;
      return <g key={tick}><line x1="36" x2="496" y1={y} y2={y} stroke="#dfe7f5" />
        <text x="27" y={y + 4} textAnchor="end">{number.format(tick * step)}</text></g>;
    })}
    {trend ? <>
      <polygon points={`${plotted[0][0]},${bottom} ${line} ${plotted.at(-1)[0]},${bottom}`} fill="url(#report-trend-fill)" />
      <polyline points={line} fill="none" stroke="#0757ff" strokeWidth="2.5" />
      {plotted.map(([x, y]) => <circle key={x} cx={x} cy={y} r="4.5" fill="white" stroke="#0757ff" strokeWidth="1.7" />)}
    </> : plotted.map(([x, y], index) => <g key={x}>
      <rect x={x - barWidth / 2} y={y} width={barWidth} height={bottom - y} rx="4"
        fill={["#0757ff", "#80a9f9", "#9fbcf8", "#bccff8", "#c9d8f8"][index]} />
      <text className="report-chart-value" x={x} y={y - 6} textAnchor="middle">{number.format(points[index].value)}</text>
    </g>)}
    {points.map(({ label: name }, index) => {
      const short = name.length > 14 ? `${name.slice(0, 13)}…` : name;
      return <text key={name} x={plotted[index][0]} y="148" textAnchor="middle"><title>{name}</title>{short}</text>;
    })}
  </svg>;
}

function ReportTable({ columns, rows }) {
  return <div className="report-table-scroll"><table className="report-table">
    <thead><tr>{columns.map(column => <th scope="col" key={column}>{column}</th>)}</tr></thead>
    <tbody>
      {rows.map(([key, cells]) => <tr key={key}>{cells.map((cell, index) =>
        index === 0 ? <th scope="row" key={index}>{cell}</th> : <td key={index}>{cell}</td>
      )}</tr>)}
      {!rows.length && <tr><td colSpan={columns.length} className="report-empty">No bookings in this period.</td></tr>}
    </tbody>
  </table></div>;
}

export function ReportsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState(DEFAULT_FILTERS);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [detail, setDetail] = useState(null);
  const [exportStatus, setExportStatus] = useState("");
  const dialog = useRef(null);

  useEffect(() => {
    let active = true;
    Promise.all([apiRequest("/admin/reservations"), apiRequest("/admin/no-shows"), listFacilities()])
      .then(([reservations, attendance, facilities]) => {
        if (!active) return;
        const missed = new Set(attendance.no_shows.map(row => row.id));
        const facilityById = new Map(facilities.map(facility => [facility.id, facility]));
        setData({
          facilities, now: Date.now(),
          bookings: reservations.map(row => ({
            ...row, facility: facilityById.get(row.facility_id),
            start: reservationTimestamp(row.start_time), end: reservationTimestamp(row.end_time), noShow: missed.has(row.id),
          })),
        });
      })
      .catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [reload]);

  const report = useMemo(() => {
    if (!data) return null;
    const matchingFacility = facility => (!filters.building || facility?.building_name === filters.building)
      && (!filters.type || facility?.room_type === filters.type);
    const facilities = data.facilities.filter(matchingFacility);
    const bookings = data.bookings.filter(row => matchingFacility(row.facility));
    const days = Number(filters.days);
    const period = reportPeriod(days);
    const priorPeriod = reportPeriod(days, true);
    const current = summarizeBookings(bookings, facilities, period, data.now);
    const prior = summarizeBookings(bookings, facilities, priorPeriod, data.now);
    const types = groupBookings(current.rows, byType).map(([label, rows]) => ({ label, value: rows.length }));
    const popular = groupBookings(current.rows, byFacility);
    const buildingNames = [...new Set([...facilities.map(facility => facility.building_name || "Unspecified"), ...current.rows.map(byBuilding)])];
    const buildings = buildingNames.map(name => {
      const rooms = facilities.filter(facility => (facility.building_name || "Unspecified") === name);
      const rows = bookings.filter(row => byBuilding(row) === name);
      return {
        name,
        current: summarizeBookings(rows, rooms, period, data.now),
        prior: summarizeBookings(rows, rooms, priorPeriod, data.now),
      };
    }).sort((a, b) => b.current.rows.length - a.current.rows.length || a.name.localeCompare(b.name));
    return { period, current, prior, types, popular, buildings };
  }, [data, filters]);

  useEffect(() => {
    if (detail && !dialog.current.open) dialog.current.showModal();
  }, [detail]);

  const openDetail = setDetail;

  function exportReport(name, columns, rows) {
    downloadCsv(name, columns, rows);
    setExportStatus(`Downloaded ${name.replaceAll("-", " ")}.`);
  }

  const options = (field, empty) => [["", empty], ...[...new Set((data?.facilities || []).map(room => room[field]).filter(Boolean))]
    .sort().map(value => [value, value])];
  const setField = key => value => setDraft(previous => ({ ...previous, [key]: value }));
  const current = report?.current;
  const prior = report?.prior;
  const change = (value, previous) => value == null || previous == null ? null : value - previous;
  const delta = (value, unit, betterWhenLower = false) => value == null ? null :
    <span className={`report-pill ${value !== 0 && (betterWhenLower ? value < 0 : value > 0) ? "report-positive" : ""}`}>
      {value === 0 ? "" : value > 0 ? "↑ +" : "↓ −"}{Math.abs(value).toFixed(1)}{unit}
    </span>;
  const cards = current && [
    ["Total Bookings", number.format(current.rows.length), CalendarDays, delta(prior.rows.length ? (current.rows.length / prior.rows.length - 1) * 100 : null, "%")],
    ["Utilization Rate", percent(current.utilization), Layers3, delta(change(current.utilization, prior.utilization), " pp")],
    ["No-Show Rate", percent(current.noShowRate), CircleX, delta(change(current.noShowRate, prior.noShowRate), " pp", true)],
    ["Peak Hours", current.peakShare == null ? "—" : `${hourLabel(current.peakHour)} – ${hourLabel(current.peakHour + 2)}`,
      Clock3, current.peakShare != null && <span className="report-pill">{Math.round(current.peakShare)}% of bookings</span>],
  ];
  const buildingColumns = ["Building", "Total Bookings", "Utilization", "No-Show Rate", "vs. Prior Period"];
  const buildingRows = report?.buildings.map(({ name, current: stats, prior: previous }) => [
    name, [name, stats.rows.length, percent(stats.utilization), percent(stats.noShowRate), delta(change(stats.utilization, previous.utilization), " pp") || "—"],
  ]);
  const reservationColumns = ["Facility", "Building", "Start (campus time)", "Status", "No-show"];
  const reservationRows = rows => rows.map(row => {
    const { date, time } = campusParts(row.start);
    return [row.facility_name, byBuilding(row), `${date} ${time}`, row.status, row.noShow ? "Yes" : "No"];
  });
  const showReservations = (title, rows) => openDetail({
    title, columns: reservationColumns, rows: reservationRows(rows).map((row, index) => [rows[index].id, row]),
  });
  const exports = report && [
    { title: "Space Utilization Report", file: "space-utilization", columns: buildingColumns.slice(0, 4),
      rows: () => buildingRows.map(([, cells]) => cells.slice(0, 4)) },
    { title: "Reservation Activity Report", file: "reservation-activity", columns: reservationColumns, rows: () => reservationRows(current.rows) },
    { title: "No-Show Analysis", file: "no-show-analysis", columns: reservationColumns, rows: () => reservationRows(current.rows.filter(row => row.noShow)) },
  ];
  const download = item => exportReport(item.file, item.columns, item.rows());

  return <AdminLayout active="reports">
    <div className="admin-banner-page reports-dashboard">
      <AdminBanner eyebrow="Admin Reports • CampusReserve"
        title={<>Reports &amp; Analytics <BarChart3 aria-hidden="true" /></>}
        description="Track space usage, reservation activity, and campus trends with powerful reports." />

      <form className="report-filter-bar" onSubmit={event => { event.preventDefault(); setFilters(draft); }}>
        <FilterField label="Date Range" Icon={CalendarDays} value={draft.days} onChange={setField("days")}
          options={["7", "30", "90"].map(days => [days, `Last ${days} Days`])} />
        <FilterField label="Building" Icon={Building2} value={draft.building} onChange={setField("building")} options={options("building_name", "All Buildings")} />
        <FilterField label="Facility Type" Icon={Layers3} value={draft.type} onChange={setField("type")} options={options("room_type", "All Types")} />
        <div className="report-filter-actions">
          <button className="report-primary" type="submit"><Filter aria-hidden="true" /> Apply Filters</button>
          <button className="report-secondary" type="button" onClick={() => { setDraft(DEFAULT_FILTERS); setFilters(DEFAULT_FILTERS); }}>
            <RotateCcw aria-hidden="true" /> Reset
          </button>
        </div>
      </form>

      {error && <div className="report-panel report-load" role="alert">
        {error} <button type="button" className="report-secondary" onClick={() => { setError(""); setReload(value => value + 1); }}>Retry</button>
      </div>}
      {!report && !error && <p className="report-panel report-load" role="status">Loading reports…</p>}

      {report && <>
        <div className="report-kpis">
          {cards.map(([label, value, Icon, badge], index) => <section key={label} className="report-kpi admin-metric-lift">
            <span className="report-icon"><Icon aria-hidden="true" /></span>
            <div><h2>{label}</h2><strong>{value}</strong></div>
            {badge && <div className="report-kpi-comparison">{badge}
              {index !== 3 && <small>vs. prior {filters.days} days</small>}
            </div>}
          </section>)}
        </div>

        <div className="report-charts">
          <Panel title="Bookings by Facility Type" action="View Details" onAction={() => openDetail({
            title: "Bookings by Facility Type", columns: ["Facility Type", "Bookings"],
            rows: report.types.map(({ label, value }) => [label, [label, value]]),
          })}>
            <Chart label="Bookings by facility type" points={report.types.slice(0, 5)} />
          </Panel>
          <Panel title="Reservation Trend" action="View Details" onAction={() => showReservations("Reservation Activity", current.rows)}>
            <Chart label="Reservation trend by period start" points={current.trend} trend />
          </Panel>
          <Panel title="Space Utilization" action="View Details" onAction={() => openDetail({
            title: "Space Utilization",
            description: "Approved reservation time within current operating hours for active facilities.",
            columns: ["Scheduled Hours", "Operating Hours", "Utilization"],
            rows: [["utilization", [current.bookedHours.toFixed(1), current.openHours.toFixed(1), percent(current.utilization)]]],
          })}>
            <div className="report-utilization">
              <div className="report-ring" style={{ "--report-utilization": `${current.utilization || 0}%` }}>
                <div><strong>{percent(current.utilization)}</strong><span>Utilization</span></div>
              </div>
              <dl>
                <div><dt>Scheduled</dt><dd>{percent(current.utilization)}</dd></div>
                <div><dt>Unbooked</dt><dd>{percent(change(100, current.utilization))}</dd></div>
              </dl>
            </div>
          </Panel>
        </div>

        <div className="report-bottom">
          <Panel title="Most Popular Facilities" action="View All" onAction={() => openDetail({
            title: "Most Popular Facilities", columns: ["Facility", "Building", "Bookings"],
            rows: report.popular.map(([id, rows]) => [id, [rows[0].facility_name, byBuilding(rows[0]), rows.length]]),
          })}>
            <ol className="report-popular">
              {report.popular.slice(0, 3).map(([id, rows], index) => <li key={id}>
                <button type="button" onClick={() => showReservations(rows[0].facility_name, rows)}>
                  <span className="report-rank">{index + 1}</span>
                  <span className="report-icon"><Building2 aria-hidden="true" /></span>
                  <span className="report-row-text"><strong>{rows[0].facility_name}</strong>
                    <small>{number.format(rows.length)} bookings • {byBuilding(rows[0])}</small></span>
                  <ArrowRight aria-hidden="true" />
                </button>
              </li>)}
            </ol>
            {!report.popular.length && <p className="report-empty">No bookings in this period.</p>}
          </Panel>
          <Panel title="Usage by Building" action="View Full Report" onAction={() => openDetail({ title: "Usage by Building", columns: buildingColumns, rows: buildingRows })}>
            <ReportTable columns={buildingColumns} rows={buildingRows.slice(0, 5)} />
          </Panel>
          <Panel title="Report Downloads">
            <ul className="report-exports">
              {exports.map(item => <li key={item.file}>
                <span className="report-icon"><FileText aria-hidden="true" /></span>
                <span className="report-row-text"><strong>{item.title}</strong><small>{report.period.label} • CSV</small></span>
                <button type="button" className="report-icon" aria-label={`Download ${item.title}`} onClick={() => download(item)}>
                  <Download aria-hidden="true" />
                </button>
              </li>)}
            </ul>
          </Panel>
        </div>
      </>}
      <span className="sr-only" role="status">{exportStatus}</span>
      <dialog ref={dialog} className="report-dialog" aria-labelledby="report-dialog-title" onClose={() => setDetail(null)}>
        {detail && <div>
          <div className="report-panel-heading">
            <h2 id="report-dialog-title">{detail.title}</h2>
            <button type="button" className="report-icon" onClick={() => dialog.current.close()} aria-label="Close report"><X aria-hidden="true" /></button>
          </div>
          {detail.description && <p className="report-dialog-description">{detail.description}</p>}
          <ReportTable columns={detail.columns} rows={detail.rows} />
        </div>}
      </dialog>
    </div>
  </AdminLayout>;
}
