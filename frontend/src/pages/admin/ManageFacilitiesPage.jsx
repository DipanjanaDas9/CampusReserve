import { useEffect, useRef, useState } from "react";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { AdminLayout } from "../../layouts/AdminLayout";
import { StatusMessage } from "../../components/StatusMessage";
import { createFacility, deleteFacility, listFacilities, updateFacility } from "../../api/facilities";
import { EQUIPMENT_OPTIONS } from "../../data/sampleRooms";
import { formatTime } from "../../lib/datetime";
import { cn } from "../../lib/utils";

const EMPTY_FORM = { name: "", capacity: "", location: "", equipment: [], opening_time: "", closing_time: "", restrictions: "" };

const fieldClass =
  "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-brand hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60";

const hours = (f) => (f.opening_time && f.closing_time ? `${formatTime(f.opening_time)} – ${formatTime(f.closing_time)}` : null);

export function ManageFacilitiesPage() {
  const [facilities, setFacilities] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [editing, setEditing] = useState(null); // null (closed), "new", or a facility
  const [notice, setNotice] = useState({ kind: "info", text: "" });

  function reload() {
    return listFacilities()
      .then((list) => {
        setFacilities(list);
        setLoadError("");
      })
      .catch((err) => setLoadError(err.message));
  }
  useEffect(() => void reload(), []);

  const locations = [...new Set((facilities ?? []).map((f) => f.location).filter(Boolean))].sort();
  const shown = (facilities ?? []).filter((f) => {
    const q = query.trim().toLowerCase();
    return (!q || f.name.toLowerCase().includes(q)) && (!location || f.location === location);
  });

  async function save(values) {
    if (editing === "new") await createFacility(values);
    else await updateFacility(editing.id, values);
    setNotice({ kind: "info", text: `${values.name} ${editing === "new" ? "added" : "updated"}.` });
    setEditing(null);
    await reload();
  }

  async function remove(facility) {
    if (!window.confirm(`Delete ${facility.name}? This cannot be undone.`)) return;
    try {
      await deleteFacility(facility.id);
      setNotice({ kind: "info", text: `${facility.name} deleted.` });
      await reload();
    } catch (err) {
      // A facility with reservations can't be deleted: the backend's foreign-key error
      // becomes an unhandled 500 without CORS headers, so the browser reports status 0.
      const text = err.status === 0 || err.status === 500
        ? `${facility.name} could not be deleted. It may still have reservations (or the server is unreachable).`
        : err.message;
      setNotice({ kind: "error", text });
    }
  }

  return (
    <AdminLayout active="facilities">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Manage Facilities</h1>
            <p className="mt-1 text-sm text-muted-foreground">Add, edit, or delete campus spaces</p>
          </div>
          <button type="button" className={primaryButton} onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add Facility
          </button>
        </div>

        <div className="mt-6 rounded-xl border bg-card shadow-card">
          <div className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_14rem]">
            <label className="relative">
              <span className="sr-only">Search facilities</span>
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search facilities…" className={cn(fieldClass, "pl-9")} />
            </label>
            <label>
              <span className="sr-only">Filter by location</span>
              <select value={location} onChange={(e) => setLocation(e.target.value)} className={fieldClass}>
                <option value="">All locations</option>
                {locations.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="px-4 pt-3">
            <StatusMessage kind={notice.kind}>{notice.text}</StatusMessage>
            <StatusMessage kind="error">{loadError}</StatusMessage>
          </div>

          {facilities === null && !loadError && (
            <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading facilities…
            </p>
          )}

          {facilities && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    {["Name", "Location", "Capacity", "Hours", "Equipment"].map((h) => (
                      <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>
                    ))}
                    <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                        {facilities.length === 0 ? "No facilities yet. Add the first one." : "No facilities match these filters."}
                      </td>
                    </tr>
                  )}
                  {shown.map((f) => (
                    <tr key={f.id} className="border-t">
                      <td className="px-4 py-3 font-medium text-foreground">{f.name}</td>
                      <td className="px-4 py-3 text-foreground">{f.location || <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-4 py-3 text-foreground">{f.capacity}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {hours(f) ?? <span className="text-destructive" title="Rooms without hours cannot be booked">Not set</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{f.equipment.length ? f.equipment.join(", ") : "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setEditing(f)}
                            aria-label={`Edit ${f.name}`}
                            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(f)}
                            aria-label={`Delete ${f.name}`}
                            className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <FacilityDialog
          facility={editing === "new" ? null : editing}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
    </AdminLayout>
  );
}

/** Add / edit form in a native modal <dialog> (focus trap, Escape and backdrop handled by the browser). */
function FacilityDialog({ facility, onSave, onClose }) {
  const dialogRef = useRef(null);
  const [form, setForm] = useState(() =>
    facility
      ? {
          name: facility.name,
          capacity: String(facility.capacity),
          location: facility.location ?? "",
          equipment: facility.equipment,
          opening_time: facility.opening_time ?? "",
          closing_time: facility.closing_time ?? "",
          restrictions: facility.restrictions ?? "",
        }
      : EMPTY_FORM
  );
  const [errors, setErrors] = useState({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  // Keep equipment the backend already has even if it is not one of the standard options.
  const equipmentOptions = [...new Set([...EQUIPMENT_OPTIONS, ...form.equipment])];

  // Open as a modal on mount. No close() on cleanup: it would fire onClose (and in
  // StrictMode's double-run, close the form right after opening). Unmounting removes it.
  useEffect(() => {
    if (!dialogRef.current.open) dialogRef.current.showModal();
  }, []);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors((current) => {
      const rest = { ...current };
      delete rest[key];
      return rest;
    });
  };
  const toggleItem = (item) =>
    setForm((f) => ({ ...f, equipment: f.equipment.includes(item) ? f.equipment.filter((x) => x !== item) : [...f.equipment, item] }));

  async function onSubmit(e) {
    e.preventDefault();
    const capacity = Number(form.capacity);
    const next = {};
    if (!form.name.trim()) next.name = "Name is required.";
    if (!Number.isInteger(capacity) || capacity < 1) next.capacity = "Capacity must be a whole number of at least 1.";
    if (Boolean(form.opening_time) !== Boolean(form.closing_time)) next.closing_time = "Set both opening and closing time, or neither.";
    else if (form.opening_time && form.closing_time <= form.opening_time) next.closing_time = "Closing time must be after opening time.";
    setErrors(next);
    if (Object.keys(next).length) {
      dialogRef.current.querySelector(`#fac-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await onSave({
        name: form.name.trim(),
        capacity,
        equipment: form.equipment,
        location: form.location.trim() || null,
        opening_time: form.opening_time || null,
        closing_time: form.closing_time || null,
        restrictions: form.restrictions.trim() || null,
      });
    } catch (err) {
      setSaveError(err.message);
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
      <form onSubmit={onSubmit} noValidate className="p-5">
        <h2 id="facility-dialog-title" className="text-lg font-bold">{facility ? "Edit Facility" : "Add Facility"}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField id="fac-name" label="Name" value={form.name} onChange={set("name")} error={errors.name} maxLength={100} className="sm:col-span-2" />
          <TextField id="fac-location" label="Location (optional)" value={form.location} onChange={set("location")} placeholder="e.g. Library Building, 2nd Floor" />
          <TextField id="fac-capacity" label="Capacity" type="number" min="1" value={form.capacity} onChange={set("capacity")} error={errors.capacity} />
          <TextField id="fac-opening_time" label="Opening time" type="time" value={form.opening_time} onChange={set("opening_time")} />
          <TextField id="fac-closing_time" label="Closing time" type="time" value={form.closing_time} onChange={set("closing_time")} error={errors.closing_time} />
          <p className="-mt-2 text-xs text-muted-foreground sm:col-span-2">Rooms can only be booked once opening and closing times are set.</p>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">Equipment</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {equipmentOptions.map((item) => (
                <label key={item} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.equipment.includes(item)} onChange={() => toggleItem(item)} className="h-4 w-4 accent-primary" />
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
        <StatusMessage kind="error" className="mt-4">{saveError}</StatusMessage>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => dialogRef.current.close()} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Cancel
          </button>
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {facility ? "Save changes" : "Add Facility"}
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
      <input id={id} {...props} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} className={cn(fieldClass, error && "border-destructive")} />
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
