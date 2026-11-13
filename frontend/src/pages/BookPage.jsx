import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { StudentLayout } from "../layouts/StudentLayout";
import { getFacility } from "../api/facilities";
import { submitReservation } from "../api/reservations";
import { campusISO, formatDuration } from "../lib/datetime";

export function BookPage() {
    const { id } = useParams();
    const [query] = useSearchParams();
    const date = query.get("date"), start = query.get("start"), end = query.get("end");
    const [space, setSpace] = useState(null);
    const [roomError, setRoomError] = useState("");

    useEffect(() => {
      let active = true;

      async function loadRoom() {
        try {
          const selectedRoom = await getFacility(id);
          if (!active) return;
          setSpace(selectedRoom);
          setRoomError("");
        } catch (err) {
          if (active) {
            setRoomError(
              err.message || "Could not load facility."
            );
          }
        }
      }

      loadRoom();

      return () => {
        active = false;
      };
    }, [id]);

    const [purpose, setPurpose] = useState("");
    const [attendees, setAttendees] = useState("1");
    const [notes, setNotes] = useState("");
    const [error, setError] = useState(null);
    const [done, setDone] = useState(false);
    const [busy, setBusy] = useState(false);
    const duration = start && end ? formatDuration(start, end) : "—";
    
    async function onSubmit(e) {
      e.preventDefault();
      setError(null);

      if (!space?.is_active) return setError("This facility is inactive and cannot be booked.");
      if (!date || !start || !end) {
        return setError(
          "Pick a time slot on the availability calendar first."
        );
      }

      if (!purpose.trim()) {
        return setError(
          "Please enter the purpose of your reservation."
        );
      }

      const n = Number(attendees);

      if (!Number.isInteger(n) || n < 1) {
        return setError(
          "Number of attendees must be at least 1."
        );
      }

      const facilityId = Number(space?.id);

      if (!Number.isInteger(facilityId) || facilityId < 1) {
        return setError(
          "This facility is not linked to the backend database yet."
        );
      }

  setBusy(true);

  try {
    const request = {
      facility_id: facilityId,
      start_time: campusISO(date, start),
      end_time: campusISO(date, end),
      attendees: n,
      purpose: purpose.trim(),
      notes: notes.trim() || null,
    };

    await submitReservation(request);

    setDone(true);
  } catch (err) {
    setError(
      err instanceof Error ? err.message : "Request failed."
    );
  } finally {
    setBusy(false);
  }
}

    const input = "w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
    return (<StudentLayout active="search">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold">Reservation Request</h1>
        <p className="mb-6 text-sm text-muted-foreground">Review your selected time and tell us about your booking.</p>

        <div className="rounded-xl border bg-card p-6 shadow-card">
          <h2 className="mb-3 font-semibold">Reservation Details</h2>
          {space && !space.is_active && <p role="alert" className="mb-3 text-sm text-destructive">This facility is inactive and cannot be booked.</p>}
          <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
            <dt className="text-muted-foreground">Facility</dt><dd className="sm:col-span-3">{space?.name ?? id}</dd>
            {roomError && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {roomError}
              </p>
            )}
            <dt className="text-muted-foreground">Building</dt><dd className="sm:col-span-3">{space?.building_name ?? "Not assigned"}</dd>
            <dt className="text-muted-foreground">Floor / room</dt><dd className="sm:col-span-3">{space?.floor_number ?? "—"} / {space?.room_number ?? "—"}</dd>
            <dt className="text-muted-foreground">Date</dt><dd className="sm:col-span-3">{date ?? "—"}</dd>
            <dt className="text-muted-foreground">Time</dt><dd className="sm:col-span-3">{start && end ? `${start} – ${end}` : "—"}</dd>
            <dt className="text-muted-foreground">Duration</dt><dd className="sm:col-span-3">{duration}</dd>
          </dl>

          {done ? (<div className="mt-6 rounded-md bg-success/15 p-4 text-sm text-success">
              Your reservation request was submitted. You'll get a notification once it's confirmed.
            </div>) : (<form onSubmit={onSubmit} className="mt-6 space-y-4 border-t pt-6">
              <div>
                <label htmlFor="purpose" className="mb-1 block text-sm font-medium">Purpose</label>
                <input id="purpose" className={input} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Group study session"/>
              </div>
              <div>
                <label htmlFor="attendees" className="mb-1 block text-sm font-medium">Number of attendees</label>
                <input id="attendees" type="number" min={1} max={space?.capacity} className={input} value={attendees} onChange={(e) => setAttendees(e.target.value)}/>
              </div>
              <div>
                <label htmlFor="notes" className="mb-1 block text-sm font-medium">Additional notes (optional)</label>
                <textarea id="notes" rows={3} className={input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Equipment needs, accessibility requests…"/>
              </div>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <p className="text-xs text-muted-foreground">Availability is confirmed by the server when you submit.</p>
              <div className="flex items-center justify-between gap-3">
                <Link to="/availability" className="text-sm font-medium text-primary hover:underline">← Back to availability</Link>
                <button type="submit" disabled={busy || !space?.is_active || Boolean(roomError)} className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-brand disabled:opacity-60">
                  {busy ? "Submitting…" : "Submit Request"}
                </button>
              </div>
            </form>)}
        </div>
      </div>
    </StudentLayout>);
}
