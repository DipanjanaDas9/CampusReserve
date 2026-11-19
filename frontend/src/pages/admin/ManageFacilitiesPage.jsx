import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, ArrowUpDown, Armchair, Building2, CircleCheck, Copy, EyeOff, Layers3, Loader2,
  Monitor, MoreHorizontal, Pencil, Plus, Search, TrendingUp, Users, Wrench,
} from "lucide-react";
import { AdminBanner } from "../../components/AdminBanner";
import { AdminLayout } from "../../layouts/AdminLayout";
import { StatusMessage } from "../../components/StatusMessage";
import {
  createFacility,
  deleteFacility,
  listFacilities,
  updateFacility,
} from "../../api/facilities";
import { authenticatedFetch } from "../../api/authenticatedFetch";
import { API_BASE_URL } from "../../api/auth";
import { EQUIPMENT_OPTIONS } from "../../data/sampleRooms";
import { formatTime } from "../../lib/datetime";
import { cn } from "../../lib/utils";
import { apiRequest } from "../../api/http";
import { measureUtilization, reportPeriod, reservationTimestamp } from "./reportMetrics";
import "./ManageFacilitiesPage.css";

const EMPTY_FORM = {
  name: "",
  building_name: "",
  floor_number: "",
  room_number: "",
  room_type: "",
  capacity: "",
  location: "",
  equipment: [],
  opening_time: "08:00",
  closing_time: "20:00",
  restrictions: "",
};

const fieldClass =
  "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-brand hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60";

const compareText = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const countLabel = new Intl.NumberFormat("en-US");

const isActive = (facility) =>
  facility.is_active !== false && facility.is_active !== 0;

function facilityHours(facility) {
  if (!facility.opening_time || !facility.closing_time) return null;
  return `${formatTime(facility.opening_time)} – ${formatTime(facility.closing_time)}`;
}

export function ManageFacilitiesPage() {
  const [facilities, setFacilities] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [building, setBuilding] = useState("");
  const [roomType, setRoomType] = useState("");
  const [sort, setSort] = useState(null);
  const [reservations, setReservations] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState({ kind: "info", text: "" });
  const [busyId, setBusyId] = useState(null);
  const [actions, setActions] = useState(null);

  async function reload() {
    try {
      const list = await listFacilities();
      if (!Array.isArray(list)) throw new Error("Unexpected facilities response.");
      setFacilities(list);
      setLoadError("");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load facilities.");
      throw err;
    }
  }

  useEffect(() => {
    let active = true;
    listFacilities()
      .then((list) => {
        if (!active) return;
        if (!Array.isArray(list)) throw new Error("Unexpected facilities response.");
        setFacilities(list);
      })
      .catch((err) => {
        if (active) setLoadError(err instanceof Error ? err.message : "Could not load facilities.");
      });
    apiRequest("/admin/reservations")
      .then((rows) => {
        if (active && Array.isArray(rows)) {
          setReservations(rows.map((row) => ({
            ...row, start: reservationTimestamp(row.start_time), end: reservationTimestamp(row.end_time),
          })));
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const options = (field) => [...new Set((facilities ?? []).map((facility) => facility[field]).filter(Boolean))]
    .sort(compareText.compare);
  const buildings = options("building_name");
  const types = options("room_type");
  const activeCount = facilities?.filter(isActive).length;
  const metrics = useMemo(() => {
    if (!facilities || !reservations) return null;
    const current = measureUtilization(reservations, facilities, reportPeriod(30)).utilization;
    const previous = measureUtilization(reservations, facilities, reportPeriod(30, true)).utilization;
    return { current, delta: current == null || previous == null ? null : current - previous };
  }, [facilities, reservations]);

  const search = query.trim().toLowerCase();
  const shown = (facilities ?? []).filter((facility) =>
    (!search || [facility.name, facility.building_name, facility.room_type, facility.room_number, facility.location,
      ...(facility.equipment ?? [])].some((value) => value?.toLowerCase().includes(search))) &&
    (!building || facility.building_name === building) &&
    (!roomType || facility.room_type === roomType) &&
    (!statusFilter || isActive(facility) === (statusFilter === "active")));
  if (sort) {
    shown.sort((a, b) => {
      const valueFor = (facility) => sort.key === "status" ? (isActive(facility) ? "Active" : "Inactive") : facility[sort.key];
      const left = valueFor(a);
      const right = valueFor(b);
      if (left == null || right == null) return Number(left == null) - Number(right == null);
      return sort.direction * compareText.compare(left, right);
    });
  }

  function sortBy(key) {
    setSort((previous) => ({ key, direction: previous?.key === key ? -previous.direction : 1 }));
  }

  async function save(values) {
    const isNew = editing.mode !== "edit";
    if (isNew) await createFacility(values);
    else await updateFacility(editing.facility.id, values);
    await reload().catch(() => {});
    setNotice({
      kind: "info",
      text: `${values.name} ${isNew ? "added" : "updated"} successfully.`,
    });
    setEditing(null);
  }

  async function toggleStatus(facility) {
    setBusyId(facility.id);
    setNotice({ kind: "info", text: "" });
    const nextActive = !isActive(facility);
    try {
      const token = sessionStorage.getItem("access_token");
      if (!token) throw new Error("Please sign in as an administrator.");

      const response = await authenticatedFetch(
        `${API_BASE_URL}/facilities/${facility.id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ is_active: nextActive }),
        }
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof body?.detail === "string"
            ? body.detail
            : "Could not update facility status."
        );
      }

      // The backend is authoritative; refresh before reporting success.
      await reload();
      setNotice({
        kind: "info",
        text: `${facility.name} ${nextActive ? "activated" : "deactivated"} successfully.`,
      });
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not update facility status.",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(facility) {
    if (!window.confirm(
      `Are you sure you want to permanently delete "${facility.name}"?\n\n` +
      "Facilities with reservation history may not be deletable."
    )) return;

    setBusyId(facility.id);
    try {
      await deleteFacility(facility.id);
      await reload();
      setNotice({ kind: "info", text: `${facility.name} deleted.` });
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Could not delete this facility.",
      });
    } finally {
      setBusyId(null);
    }
  }

  const add = () => setEditing({ mode: "new" });
  const delta = metrics?.delta;
  const cards = [
    ["Active Spaces", activeCount, Armchair],
    ["Inactive Spaces", facilities && facilities.length - activeCount, EyeOff],
    ["Buildings", facilities && buildings.length, Building2],
    ["Overall Utilization", metrics?.current == null ? null : `${metrics.current.toFixed(1)}%`, TrendingUp],
  ];
  const columns = [
    ["Space Name", "name"], ["Building", "building_name"], ["Room No."], ["Floor", "floor_number"],
    ["Capacity", "capacity"], ["Equipment"], ["Status", "status"], ["Actions"],
  ];

  return (
    <AdminLayout active="facilities">
      <div className="admin-banner-page facilities-dashboard">
        <AdminBanner eyebrow="Admin • Facility Management"
          title={<>Manage Campus Facilities <Wrench aria-hidden="true" /></>}
          description="Add, update, and organize campus spaces to keep reservations accurate and facilities ready.">
          <button type="button" className="facilities-primary" onClick={add}>
            Add Facility <ArrowRight aria-hidden="true" />
          </button>
        </AdminBanner>

        <div className="facilities-metrics">
          {cards.map(([label, value, Icon]) => <section key={label} className="facilities-metric admin-metric-lift">
            <span className="facilities-icon"><Icon aria-hidden="true" /></span>
            <div><h2>{label}</h2><strong>{typeof value === "number" ? countLabel.format(value) : value ?? "—"}</strong></div>
            {label === "Overall Utilization" && metrics?.current != null && <div className="facilities-metric-period">
              {delta != null && <span className={cn("facilities-pill", delta > 0 && "is-active", delta < 0 && "is-decrease")}>
                {delta > 0 ? "↑ +" : delta < 0 ? "↓ −" : ""}{Math.abs(delta).toFixed(1)} pp
              </span>}
              <small>{delta == null ? "Last 30 days" : "vs. prior 30 days"}</small>
            </div>}
          </section>)}
        </div>

        <section className="facilities-panel" aria-labelledby="facilities-heading">
          <div className="facilities-toolbar">
            <div>
              <h2 id="facilities-heading">Facilities</h2>
              <p>{facilities ? `${countLabel.format(shown.length)} of ${countLabel.format(facilities.length)} campus spaces` : "Manage campus spaces, their details, and availability."}</p>
            </div>
            <div className="facilities-filters">
              <label className="facilities-filter facilities-search">
                <span className="sr-only">Search facilities</span>
                <Search aria-hidden="true" />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search facilities (e.g., study room, lab…)" />
              </label>
              <FacilityFilter label="Filter by building" Icon={Building2} value={building} onChange={setBuilding}
                options={[["", "All Buildings"], ...buildings.map((value) => [value, value])]} />
              <FacilityFilter label="Filter by facility type" Icon={Layers3} value={roomType} onChange={setRoomType}
                options={[["", "All Types"], ...types.map((value) => [value, value])]} />
              <FacilityFilter label="Filter by status" Icon={CircleCheck} value={statusFilter} onChange={setStatusFilter}
                options={[["", "All Statuses"], ["active", "Active"], ["inactive", "Inactive"]]} />
              <button type="button" className="facilities-primary" onClick={add}><Plus aria-hidden="true" /> Add Facility</button>
            </div>
          </div>

          {notice.text && <StatusMessage kind={notice.kind}>{notice.text}</StatusMessage>}
          {loadError && <StatusMessage kind="error">{loadError}</StatusMessage>}
          {facilities === null && !loadError && (
            <p className="facilities-loading" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading facilities…</p>
          )}
          {facilities && (
            <div className="facilities-table-scroll" tabIndex={0} role="region" aria-label="Facility catalog">
              <table className="facilities-table">
                <thead><tr>
                  {columns.map(([label, key]) => <th key={label} scope="col"
                    aria-sort={key && sort?.key === key ? (sort.direction === 1 ? "ascending" : "descending") : undefined}>
                    {key ? <button type="button" onClick={() => sortBy(key)}>{label}<ArrowUpDown aria-hidden="true" /></button> : label}
                  </th>)}
                </tr></thead>
                <tbody>
                  {!shown.length && <tr><td colSpan={columns.length} className="facilities-loading">
                    {facilities.length ? "No facilities match these filters." : "No facilities yet. Add the first one."}
                  </td></tr>}
                  {shown.map((facility) => {
                    const equipment = facility.equipment ?? [];
                    const hours = facilityHours(facility);
                    const active = isActive(facility);
                    return <tr key={facility.id}>
                      <th scope="row">
                        <div className="facilities-space">
                          <span className="facilities-icon"><Armchair aria-hidden="true" /></span>
                          <div>{facility.name}{facility.room_type && <small>{facility.room_type}</small>}</div>
                        </div>
                      </th>
                      <td>{facility.building_name || facility.location || "—"}
                        {facility.building_name && facility.location && facility.location !== facility.building_name && <small>{facility.location}</small>}
                      </td>
                      <td>{facility.room_number ?? "—"}</td>
                      <td>{facility.floor_number ?? "—"}</td>
                      <td><span className="facilities-capacity"><Users aria-hidden="true" />{facility.capacity}</span></td>
                      <td><div className="facilities-equipment">
                        {equipment.length ? equipment.map((item) => <span key={item} className="facilities-pill"><Monitor aria-hidden="true" />{item}</span>) : "—"}
                      </div></td>
                      <td><span className={cn("facilities-pill", active && "is-active")}>{active ? "Active" : "Inactive"}</span>
                        <small>{hours ?? "Hours not set"}</small>
                      </td>
                      <td><div className="facilities-actions">
                        <button type="button" disabled={busyId === facility.id} onClick={() => setEditing({ mode: "edit", facility })}
                          aria-label={`Edit ${facility.name}`} title="Edit facility"><Pencil aria-hidden="true" /></button>
                        <button type="button" disabled={busyId === facility.id} onClick={() => setEditing({ mode: "copy", facility })}
                          aria-label={`Duplicate ${facility.name}`} title="Duplicate facility"><Copy aria-hidden="true" /></button>
                        <button type="button" disabled={busyId === facility.id} onClick={() => setActions(facility)}
                          aria-label={`More actions for ${facility.name}`} aria-haspopup="dialog" title="More actions"><MoreHorizontal aria-hidden="true" /></button>
                      </div></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {editing && (
        <FacilityDialog facility={editing.facility} mode={editing.mode}
          onSave={save} onClose={() => setEditing(null)} />
      )}
      {actions && <MoreActions facility={actions} onClose={() => setActions(null)}
        onToggle={() => toggleStatus(actions)} onDelete={() => remove(actions)} />}
    </AdminLayout>
  );
}

function FacilityFilter({ label, Icon, options, value, onChange }) {
  return <label className="facilities-filter">
    <span className="sr-only">{label}</span><Icon aria-hidden="true" />
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
    </select>
  </label>;
}

function MoreActions({ facility, onClose, onToggle, onDelete }) {
  const dialog = useRef(null);

  useEffect(() => {
    if (!dialog.current.open) dialog.current.showModal();
  }, []);

  return <dialog ref={dialog} onClose={onClose} aria-labelledby="facility-actions-title" className="facilities-action-dialog">
    <h2 id="facility-actions-title">{facility.name}</h2>
    <form method="dialog">
      <button type="submit" onClick={onToggle}>{isActive(facility) ? "Deactivate" : "Activate"} Facility</button>
      <button type="submit" onClick={onDelete} className="text-destructive">Delete Facility</button>
      <button type="submit">Cancel</button>
    </form>
  </dialog>;
}

function FacilityDialog({ facility, mode, onSave, onClose }) {
  const dialogRef = useRef(null);
  const copying = mode === "copy";
  const [form, setForm] = useState(() => facility ? ({
    name: copying ? `${facility.name.slice(0, 93)} (copy)` : facility.name,
    building_name: facility.building_name ?? "",
    floor_number: facility.floor_number == null ? "" : String(facility.floor_number),
    room_number: copying ? "" : facility.room_number ?? "",
    room_type: facility.room_type ?? "",
    capacity: String(facility.capacity),
    location: facility.location ?? "",
    equipment: Array.isArray(facility.equipment) ? facility.equipment : [],
    opening_time: facility.opening_time ?? "",
    closing_time: facility.closing_time ?? "",
    restrictions: facility.restrictions ?? "",
  }) : ({ ...EMPTY_FORM, equipment: [] }));
  const [errors, setErrors] = useState({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const equipmentOptions = [...new Set([...EQUIPMENT_OPTIONS, ...form.equipment])];

  useEffect(() => {
    if (dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, []);

  const set = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const toggleEquipment = (item) => {
    setForm((prev) => ({
      ...prev,
      equipment: prev.equipment.includes(item)
        ? prev.equipment.filter((value) => value !== item)
        : [...prev.equipment, item],
    }));
  };

  async function handleSubmit(event) {
    event.preventDefault();
    const capacity = Number(form.capacity);
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Name is required.";
    if (!Number.isInteger(capacity) || capacity < 1) {
      nextErrors.capacity = "Capacity must be a whole number of at least 1.";
    }
    if (Boolean(form.opening_time) !== Boolean(form.closing_time)) {
      nextErrors.closing_time = "Set both opening and closing times, or neither.";
    } else if (form.opening_time && form.closing_time <= form.opening_time) {
      nextErrors.closing_time = "Closing time must be after opening time.";
    }
    const identity = [form.building_name.trim(), form.floor_number.trim(), form.room_number.trim()];
    if (identity.some(Boolean) && !identity.every(Boolean)) {
      nextErrors.building_name = "Set building, floor, and room number together.";
    }
    if (form.floor_number.trim() && !Number.isInteger(Number(form.floor_number))) {
      nextErrors.floor_number = "Floor must be a whole number (0 is ground floor).";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      dialogRef.current?.querySelector(`#fac-${Object.keys(nextErrors)[0]}`)?.focus();
      return;
    }

    setSaving(true);
    setSaveError("");
    try {
      await onSave({
        name: form.name.trim(),
        building_name: form.building_name.trim() || null,
        floor_number: form.floor_number.trim() ? Number(form.floor_number) : null,
        room_number: form.room_number.trim() || null,
        room_type: form.room_type.trim() || null,
        capacity,
        equipment: form.equipment,
        location: form.location.trim() || null,
        opening_time: form.opening_time || null,
        closing_time: form.closing_time || null,
        restrictions: form.restrictions.trim() || null,
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unable to save facility.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="facility-dialog-title"
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-xl border bg-card p-0 text-foreground shadow-card backdrop:bg-foreground/40"
    >
      <form onSubmit={handleSubmit} noValidate className="p-5">
        <h2 id="facility-dialog-title" className="text-lg font-bold">
          {copying ? "Duplicate Facility" : mode === "edit" ? "Edit Facility" : "Add Facility"}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField id="fac-name" label="Name" value={form.name} onChange={set("name")} error={errors.name} maxLength={100} className="sm:col-span-2" />
          <TextField id="fac-building_name" label="Building (optional)" value={form.building_name} onChange={set("building_name")} error={errors.building_name} maxLength={100} />
          <TextField id="fac-floor_number" label="Floor (0 = ground)" type="number" step="1" value={form.floor_number} onChange={set("floor_number")} error={errors.floor_number} />
          <TextField id="fac-room_number" label="Room number" value={form.room_number} onChange={set("room_number")} maxLength={30} />
          <TextField id="fac-room_type" label="Room type" value={form.room_type} onChange={set("room_type")} placeholder="e.g. Study room" maxLength={60} />
          <TextField id="fac-location" label="Location" value={form.location} onChange={set("location")} placeholder="e.g. Library, 2nd floor" />
          <TextField id="fac-capacity" label="Maximum occupants" type="number" min="1" value={form.capacity} onChange={set("capacity")} error={errors.capacity} />
          <TextField id="fac-opening_time" label="Opening time" type="time" value={form.opening_time} onChange={set("opening_time")} />
          <TextField id="fac-closing_time" label="Closing time" type="time" value={form.closing_time} onChange={set("closing_time")} error={errors.closing_time} />
          <p className="-mt-2 text-xs text-muted-foreground sm:col-span-2">
            Rooms can only be booked once opening and closing times are set.
          </p>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">Equipment</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {equipmentOptions.map((item) => (
                <label key={item} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.equipment.includes(item)} onChange={() => toggleEquipment(item)} className="h-4 w-4 accent-primary" />
                  {item}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="sm:col-span-2">
            <label htmlFor="fac-restrictions" className="mb-1 block text-sm font-medium">Restrictions (optional)</label>
            <textarea
              id="fac-restrictions"
              rows={2}
              value={form.restrictions}
              onChange={set("restrictions")}
              placeholder="e.g. Graduate students only; no food"
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        {saveError && <StatusMessage kind="error" className="mt-4">{saveError}</StatusMessage>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => dialogRef.current?.close()} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">
            Cancel
          </button>
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {mode === "edit" ? "Save changes" : "Add Facility"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function TextField({ id, label, error, className, ...props }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <input
        id={id}
        {...props}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(fieldClass, error && "border-destructive")}
      />
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
