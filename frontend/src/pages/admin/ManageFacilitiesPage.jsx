import { useEffect, useState } from "react";
import { Building, Pencil, Plus, Trash2 } from "lucide-react";
import { AdminLayout } from "../../layouts/AdminLayout";
import { listRooms } from "../../api/rooms";
import { createRoom, deleteRoom, updateRoom } from "../../api/admin";
import { EmptyState, EquipmentTags, ErrorMessage, Loading, PageHeader, inputClass, primaryButton, secondaryButton } from "../../components/ui";

const EMPTY = { name: "", capacity: "", location: "", equipment: "", description: "" };

export function ManageFacilitiesPage() {
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // null, "new", or a room id
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listRooms().then(setRooms).catch((e) => setError(e.message));
  }, []);

  function startEdit(room) {
    setFormError("");
    if (!room) {
      setEditing("new");
      setForm(EMPTY);
      return;
    }
    setEditing(room.id);
    setForm({ name: room.name, capacity: String(room.capacity), location: room.location, equipment: room.equipment.join(", "), description: room.description });
  }

  async function onSave(e) {
    e.preventDefault();
    setFormError("");
    const capacity = Number(form.capacity);
    if (!form.name.trim() || !form.location.trim()) return setFormError("Name and location are required.");
    if (!Number.isInteger(capacity) || capacity < 1) return setFormError("Capacity must be a whole number of at least 1.");
    const payload = {
      name: form.name.trim(),
      capacity,
      location: form.location.trim(),
      equipment: form.equipment.split(",").map((s) => s.trim()).filter(Boolean),
      description: form.description.trim(),
    };
    setBusy(true);
    try {
      if (editing === "new") {
        const room = await createRoom(payload);
        setRooms((rs) => [...rs, room].sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        const room = await updateRoom(editing, payload);
        setRooms((rs) => rs.map((r) => (r.id === room.id ? room : r)));
      }
      setEditing(null);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(room) {
    if (!window.confirm(`Delete ${room.name}? This cannot be undone.`)) return;
    setError("");
    try {
      await deleteRoom(room.id);
      setRooms((rs) => rs.filter((r) => r.id !== room.id));
    } catch (err) {
      setError(err.message);
    }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <AdminLayout active="facilities">
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Manage Facilities" subtitle="Add, edit and remove bookable spaces">
          {editing === null && (
            <button type="button" className={primaryButton} onClick={() => startEdit(null)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add facility
            </button>
          )}
        </PageHeader>

        {editing !== null && (
          <form onSubmit={onSave} className="mb-6 rounded-xl border bg-card p-5 shadow-card" aria-label={editing === "new" ? "New facility" : "Edit facility"}>
            <h2 className="mb-4 font-semibold">{editing === "new" ? "New facility" : "Edit facility"}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="fac-name" label="Name"><input id="fac-name" className={inputClass} value={form.name} onChange={set("name")} maxLength={100} required /></Field>
              <Field id="fac-loc" label="Location"><input id="fac-loc" className={inputClass} value={form.location} onChange={set("location")} maxLength={200} required /></Field>
              <Field id="fac-cap" label="Capacity"><input id="fac-cap" type="number" min="1" className={inputClass} value={form.capacity} onChange={set("capacity")} required /></Field>
              <Field id="fac-eq" label="Equipment (comma-separated)"><input id="fac-eq" className={inputClass} value={form.equipment} onChange={set("equipment")} placeholder="Projector, Whiteboard" /></Field>
              <div className="sm:col-span-2">
                <Field id="fac-desc" label="Description"><textarea id="fac-desc" rows={2} className={inputClass} value={form.description} onChange={set("description")} maxLength={1000} /></Field>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="submit" className={primaryButton} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
              <button type="button" className={secondaryButton} onClick={() => setEditing(null)}>Cancel</button>
              <ErrorMessage>{formError}</ErrorMessage>
            </div>
          </form>
        )}

        <div className="mb-3">
          <ErrorMessage>{error}</ErrorMessage>
        </div>
        {!rooms && !error && <Loading />}
        {rooms?.length === 0 && <EmptyState icon={Building}>No facilities yet. Add the first one.</EmptyState>}
        {rooms?.length > 0 && (
          <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-secondary/60 text-left">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Facility</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Location</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Capacity</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Equipment</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => (
                  <tr key={room.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3 font-medium">
                      {room.name}
                      {room.is_sample && <span className="ml-2 rounded-full bg-chart-4/25 px-2 py-0.5 text-[11px]">Sample</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{room.location}</td>
                    <td className="px-4 py-3">{room.capacity}</td>
                    <td className="px-4 py-3"><EquipmentTags items={room.equipment} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button type="button" className="rounded-md p-2 hover:bg-accent" aria-label={`Edit ${room.name}`} onClick={() => startEdit(room)}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button type="button" className="rounded-md p-2 text-destructive-strong hover:bg-destructive/10" aria-label={`Delete ${room.name}`} onClick={() => onDelete(room)}>
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
    </AdminLayout>
  );
}

function Field({ id, label, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
