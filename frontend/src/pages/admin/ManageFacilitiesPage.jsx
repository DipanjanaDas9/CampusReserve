import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Plus, Search } from "lucide-react";
import { AdminLayout } from "../../layouts/AdminLayout";
import { SampleDataLabel } from "../../components/SampleDataLabel";
import { EQUIPMENT_OPTIONS } from "../../data/sampleRooms";
import { cn } from "../../lib/utils";

const EMPTY_FORM = {
  name: "",
  building: "",
  floor: "",
  capacity: "",
  equipment: [],
  status: "active",
  opening_time: "08:00",
  closing_time: "20:00",
};

const fieldClass =
  "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-brand hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function ManageFacilitiesPage() {
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");  const [query, setQuery] = useState("");
  const [building, setBuilding] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState(null); // null (closed), "new", or a facility
  const [notice, setNotice] = useState("");


  useEffect(() => {
    let active = true;

    async function loadFacilities() {
      try {
        const token = sessionStorage.getItem("access_token");

        if (!token) {
          throw new Error("Please log in as an administrator.");
        }

        const baseUrl = (
          import.meta.env.VITE_BOOKING_API_BASE_URL ||
          "http://localhost:8000"
        ).replace(/\/$/, "");

        const response = await fetch(`${baseUrl}/facilities`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            typeof data?.detail === "string"
              ? data.detail
              : "Could not load facilities."
          );
        }

        if (!Array.isArray(data)) {
          throw new Error("Unexpected facilities response.");
        }

        if (!active) return;

        const realFacilities = data.map((facility) => ({
          ...facility,
          building: facility.location || "Not specified",
          floor: "",
          equipment: Array.isArray(facility.equipment)
            ? facility.equipment
            : [],
          status: facility.is_active ? "active" : "inactive",
        }));

        setFacilities(realFacilities);
        setError("");
      } catch (err) {
        if (active) {
          setError(err.message || "Could not load facilities.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadFacilities();

    return () => {
      active = false;
    };
  }, []);


  const buildings = [...new Set(facilities.map((f) => f.building))].sort();
  const shown = facilities.filter((f) => {
    const q = query.trim().toLowerCase();
    return (!q || f.name.toLowerCase().includes(q)) && (!building || f.building === building) && (!status || f.status === status);
  });



async function save(values) {
  setNotice("");
  setError("");

  try {
    const token = sessionStorage.getItem("access_token");

    if (!token) {
      throw new Error("Please log in as an administrator.");
    }

    const baseUrl = (
      import.meta.env.VITE_BOOKING_API_BASE_URL ||
      "http://localhost:8000"
    ).replace(/\/$/, "");

    const isNew = editing === "new";

    const url = isNew
      ? `${baseUrl}/facilities`
      : `${baseUrl}/facilities/${editing.id}`;

    const response = await fetch(url, {
      method: isNew ? "POST" : "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: values.name,
        capacity: values.capacity,
        equipment: values.equipment,
        location: values.building,
        opening_time: values.opening_time,
        closing_time: values.closing_time,
        restrictions: isNew ? "" : (editing.restrictions || ""),
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        typeof data?.detail === "string"
          ? data.detail
          : isNew
            ? "Could not create facility."
            : "Could not update facility."
      );
    }

    // Refresh the facility list from SQLite.
    const listResponse = await fetch(`${baseUrl}/facilities`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!listResponse.ok) {
      throw new Error(
        "Facility saved, but the list could not be refreshed."
      );
    }

    const updatedFacilities = await listResponse.json();

    setFacilities(
      updatedFacilities.map((facility) => ({
        ...facility,
        building: facility.location || "Not specified",
        floor: "",
        equipment: Array.isArray(facility.equipment)
          ? facility.equipment
          : [],
          status: facility.is_active ? "active" : "inactive",
      }))
    );

    setNotice(
      `${values.name} ${isNew ? "added" : "updated"} successfully.`
    );

    setEditing(null);

  } catch (err) {
    setError(err.message || "Could not save facility.");
  }
}




async function toggleStatus(facility) {
  setNotice("");
  setError("");

  const newStatus = facility.status !== "active";

  try {
    const token = sessionStorage.getItem("access_token");

    if (!token) {
      throw new Error("Please log in as an administrator.");
    }

    const baseUrl = (
      import.meta.env.VITE_BOOKING_API_BASE_URL ||
      "http://localhost:8000"
    ).replace(/\/$/, "");

    const response = await fetch(
      `${baseUrl}/facilities/${facility.id}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          is_active: newStatus,
        }),
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        typeof data?.detail === "string"
          ? data.detail
          : "Could not update facility status."
      );
    }

    // Update React only after SQLite confirms success.
    setFacilities((current) =>
      current.map((f) =>
        f.id === facility.id
          ? {
              ...f,
              is_active: data.facility.is_active,
              status: data.facility.is_active
                ? "active"
                : "inactive",
            }
          : f
      )
    );

    setNotice(
      `${facility.name} ${
        newStatus ? "activated" : "deactivated"
      } successfully.`
    );
  } catch (err) {
    setError(
      err.message || "Could not update facility status."
    );
  }
}

async function deleteFacility(facility) {
  const confirmed = window.confirm(
    `Are you sure you want to permanently delete "${facility.name}"?\n\n` +
    "This action cannot be undone. Facilities with reservation history cannot be deleted."
  );

  if (!confirmed) return;

  setNotice("");
  setError("");

  try {
    const token = sessionStorage.getItem("access_token");

    if (!token) {
      throw new Error("Please log in as an administrator.");
    }

    const response = await fetch(
      `http://127.0.0.1:8000/facilities/${facility.id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));

      throw new Error(
        data.detail || "Could not delete this facility."
      );
    }

    // Refresh the page to retrieve the updated facility list.
    window.location.reload();
  } catch (err) {
    setError(err.message || "Could not delete this facility.");
  }
}



  return (
    <AdminLayout active="facilities">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">Manage Facilities</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Add, edit, activate, deactivate, or delete campus spaces</p>
          </div>
          <button type="button" className={primaryButton} onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add Facility
          </button>
        </div>

        <div className="mt-6 rounded-xl border bg-card shadow-card">
          <div className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_12rem_10rem]">
            <label className="relative">
              <span className="sr-only">Search facilities</span>
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search facilities…" className={cn(fieldClass, "pl-9")} />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Building</span>
              <select value={building} onChange={(e) => setBuilding(e.target.value)} className={fieldClass}>
                <option value="">All</option>
                {buildings.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={fieldClass}>
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>

          <div className="min-h-5 px-4 pt-3 text-sm">
            {loading && (
              <p className="text-muted-foreground">
                Loading facilities...
              </p>
            )}

            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}

            {notice && (
              <p role="status" className="text-foreground">
                {notice}
              </p>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  {["Name", "Building", "Capacity", "Status"].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>
                  ))}
                  <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!loading && !error && shown.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No facilities match these filters.</td>
                  </tr>
                )}
                {shown.map((f) => (
                  <tr key={f.id} className="border-t">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {f.name}
                      {f.floor && <span className="block text-xs font-normal text-muted-foreground">{f.floor}</span>}
                    </td>
                    <td className="px-4 py-3 text-foreground">{f.building}</td>
                    <td className="px-4 py-3 text-foreground">{f.capacity}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-foreground", f.status === "active" ? "bg-success/15" : "bg-destructive/10")}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", f.status === "active" ? "bg-success" : "bg-destructive")} aria-hidden="true" />
                        {f.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </td>
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
                        <MoreActions facility={f} onToggle={() => toggleStatus(f)}  onDelete={() => deleteFacility(f)}/>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editing && (
        <FacilityDialog
          facility={editing === "new" ? null : editing}
          existingNames={facilities.filter((f) => f !== editing).map((f) => f.name.toLowerCase())}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
    </AdminLayout>
  );
}

/** "More actions" menu; closes on Escape or when focus leaves it. */

/** "More actions" menu; closes on Escape or when focus leaves it. */
function MoreActions({ facility, onToggle, onDelete }) {
  const [open, setOpen] = useState(false);

  const label =
    facility.status === "active" ? "Deactivate" : "Activate";

  return (
    <div
      className="relative"
      onBlur={(e) =>
        !e.currentTarget.contains(e.relatedTarget) && setOpen(false)
      }
      onKeyDown={(e) =>
        e.key === "Escape" && setOpen(false)
      }
    >
      <button
        type="button"
        aria-label={`More actions for ${facility.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-44 rounded-md border bg-card py-1 shadow-card"
        >
          <button
            type="button"
            role="menuitem"
            autoFocus
            onClick={() => {
              setOpen(false);
              onToggle();
            }}
            className={cn(
              "block w-full px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none",
              facility.status === "active"
                ? "text-destructive"
                : "text-foreground"
            )}
          >
            {label}
          </button>

          <div className="my-1 border-t" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-destructive hover:bg-accent focus:bg-accent focus:outline-none"
          >
            Delete Facility
          </button>
        </div>
      )}
    </div>
  );
}


/** Add / edit form in a native modal <dialog> (focus trap, Escape and backdrop handled by the browser). */
function FacilityDialog({ facility, existingNames, onSave, onClose }) {
  const dialogRef = useRef(null);
  const [form, setForm] = useState(() =>
    facility
      ? { name: facility.name, building: facility.building, floor: facility.floor ?? "", capacity: String(facility.capacity), equipment: facility.equipment, status: facility.status,opening_time: facility.opening_time || "08:00", closing_time: facility.closing_time || "20:00", }
      : EMPTY_FORM
  );
  const [errors, setErrors] = useState({});

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

  function onSubmit(e) {
    e.preventDefault();
    const capacity = Number(form.capacity);
    const next = {};
    if (!form.name.trim()) next.name = "Name is required.";
    else if (existingNames.includes(form.name.trim().toLowerCase())) next.name = "A facility with this name already exists.";
    if (!form.building.trim()) next.building = "Building is required.";
    if (!Number.isInteger(capacity) || capacity < 1) next.capacity = "Capacity must be a whole number of at least 1.";
    setErrors(next);
    if (Object.keys(next).length) {
      dialogRef.current.querySelector(`#fac-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    if (
      !form.opening_time ||
      !form.closing_time ||
      form.opening_time >= form.closing_time
    ) {
      setErrors({
        hours: "Closing time must be after opening time.",
      });
      return;
    }

    onSave({
      name: form.name.trim(),
      building: form.building.trim(),
      floor: form.floor.trim(),
      capacity,
      equipment: form.equipment,
      status: form.status,
      opening_time: form.opening_time,
      closing_time: form.closing_time,
    });
}

  const title = facility ? "Edit Facility" : "Add Facility";
  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="facility-dialog-title"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border bg-card p-0 text-foreground shadow-card backdrop:bg-foreground/40"
    >
      <form onSubmit={onSubmit} noValidate className="p-5">
        <h2 id="facility-dialog-title" className="text-lg font-bold">{title}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField id="fac-name" label="Name" value={form.name} onChange={set("name")} error={errors.name} className="sm:col-span-2" />
          <TextField id="fac-building" label="Building" value={form.building} onChange={set("building")} error={errors.building} />
          <TextField id="fac-floor" label="Floor (optional)" value={form.floor} onChange={set("floor")} />
          <TextField id="fac-capacity" label="Capacity" type="number" min="1" value={form.capacity} onChange={set("capacity")} error={errors.capacity} />
          <TextField
            id="fac-opening"
            label="Opening Time"
            type="time"
            value={form.opening_time}
            onChange={set("opening_time")}
          />

          <TextField
            id="fac-closing"
            label="Closing Time"
            type="time"
            value={form.closing_time}
            onChange={set("closing_time")}
          />

          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">Equipment</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {EQUIPMENT_OPTIONS.map((item) => (
                <label key={item} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.equipment.includes(item)} onChange={() => toggleItem(item)} className="h-4 w-4 accent-primary" />
                  {item}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => dialogRef.current.close()} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Cancel
          </button>
          <button type="submit" className={primaryButton}>{facility ? "Save changes" : "Add Facility"}</button>
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
