import { useEffect, useRef, useState } from "react";
import { Loader2, MoreHorizontal, Pencil, Plus, Search } from "lucide-react";
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

const EMPTY_FORM = {
  name: "",
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
  const [location, setLocation] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState({ kind: "info", text: "" });
  const [busyId, setBusyId] = useState(null);

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
    return () => { active = false; };
  }, []);

  const locations = [...new Set((facilities ?? [])
    .map((f) => f.location)
    .filter(Boolean))].sort();

  const shown = (facilities ?? []).filter((f) => {
    const matchesName = f.name.toLowerCase().includes(query.trim().toLowerCase());
    const matchesLocation = !location || f.location === location;
    const matchesStatus = !statusFilter ||
      (statusFilter === "active" ? isActive(f) : !isActive(f));
    return matchesName && matchesLocation && matchesStatus;
  });

  async function save(values) {
    const isNew = editing === "new";
    if (isNew) await createFacility(values);
    else await updateFacility(editing.id, values);
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

  return (
    <AdminLayout active="facilities">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Manage Facilities</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Add, edit, activate, deactivate, or delete campus spaces
            </p>
          </div>
          <button type="button" className={primaryButton} onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add Facility
          </button>
        </div>

        <div className="mt-6 rounded-xl border bg-card shadow-card">
          <div className="grid gap-3 border-b p-4 sm:grid-cols-3">
            <label className="relative">
              <span className="sr-only">Search facilities</span>
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search facilities…"
                className={cn(fieldClass, "pl-9")}
              />
            </label>
            <label>
              <span className="sr-only">Filter by location</span>
              <select value={location} onChange={(e) => setLocation(e.target.value)} className={fieldClass}>
                <option value="">All locations</option>
                {locations.map((place) => <option key={place} value={place}>{place}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by status</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={fieldClass}>
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>

          <div className="px-4 pt-3">
            {notice.text && <StatusMessage kind={notice.kind}>{notice.text}</StatusMessage>}
            {loadError && <StatusMessage kind="error">{loadError}</StatusMessage>}
          </div>

          {facilities === null && !loadError && (
            <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading facilities…
            </p>
          )}

          {facilities && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    {["Name", "Location", "Capacity", "Hours", "Status", "Equipment"].map((heading) => (
                      <th key={heading} scope="col" className="px-4 py-3 font-medium">{heading}</th>
                    ))}
                    <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                        {facilities.length === 0
                          ? "No facilities yet. Add the first one."
                          : "No facilities match these filters."}
                      </td>
                    </tr>
                  )}
                  {shown.map((facility) => (
                    <tr key={facility.id} className="border-t">
                      <td className="px-4 py-3 font-medium text-foreground">{facility.name}</td>
                      <td className="px-4 py-3 text-foreground">{facility.location || "—"}</td>
                      <td className="px-4 py-3 text-foreground">{facility.capacity}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {facilityHours(facility) ?? (
                          <span className="text-destructive" title="Rooms without hours cannot be booked">Not set</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-medium",
                          isActive(facility) ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"
                        )}>
                          {isActive(facility) ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {Array.isArray(facility.equipment) && facility.equipment.length
                          ? facility.equipment.join(", ")
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            disabled={busyId === facility.id}
                            onClick={() => setEditing(facility)}
                            aria-label={`Edit ${facility.name}`}
                            className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <MoreActions
                            facility={facility}
                            disabled={busyId === facility.id}
                            onToggle={() => toggleStatus(facility)}
                            onDelete={() => remove(facility)}
                          />
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

function MoreActions({ facility, onToggle, onDelete, disabled }) {
  const [open, setOpen] = useState(false);
  const toggleLabel = isActive(facility) ? "Deactivate" : "Activate";

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
    >
      <button
        type="button"
        disabled={disabled}
        aria-label={`More actions for ${facility.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-44 rounded-md border bg-card py-1 shadow-card">
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onToggle(); }}
            className="block w-full px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent"
          >
            {toggleLabel}
          </button>
          <div className="my-1 border-t" />
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onDelete(); }}
            className="block w-full px-3 py-2 text-left text-sm text-destructive hover:bg-accent focus:bg-accent"
          >
            Delete Facility
          </button>
        </div>
      )}
    </div>
  );
}

function FacilityDialog({ facility, onSave, onClose }) {
  const dialogRef = useRef(null);
  const [form, setForm] = useState(() => facility ? ({
    name: facility.name,
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
          {facility ? "Edit Facility" : "Add Facility"}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField id="fac-name" label="Name" value={form.name} onChange={set("name")} error={errors.name} maxLength={100} className="sm:col-span-2" />
          <TextField id="fac-location" label="Location" value={form.location} onChange={set("location")} placeholder="e.g. Library, 2nd floor" />
          <TextField id="fac-capacity" label="Capacity" type="number" min="1" value={form.capacity} onChange={set("capacity")} error={errors.capacity} />
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
