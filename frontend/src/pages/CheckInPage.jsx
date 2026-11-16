
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  CalendarDays,
  Check,
  Clock,
  Info,
  MapPin,
  ReceiptText,
  Users,
} from "lucide-react";

import { StudentLayout } from "../layouts/StudentLayout";
import {
  getMyReservations,
  checkInReservation,
} from "../api/reservations";
import { getFacilities } from "../api/availability";
import { ROOM_PHOTOS } from "../data/sampleRooms";
import "../components/StudentPages.css";

const CAMPUS_TIMEZONE = "America/Chicago";

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-US", {
    timeZone: CAMPUS_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("en-US", {
    timeZone: CAMPUS_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatFloor(value) {
  if (value == null || value === "") return "";
  const floor = Number(value);
  if (!Number.isInteger(floor)) return `Floor ${value}`;
  if (floor === 0) return "Ground Floor";

  const lastTwoDigits = floor % 100;
  const suffix =
    lastTwoDigits >= 11 && lastTwoDigits <= 13
      ? "th"
      : floor % 10 === 1
        ? "st"
        : floor % 10 === 2
          ? "nd"
          : floor % 10 === 3
            ? "rd"
            : "th";
  return `${floor}${suffix} Floor`;
}

export function CheckInPage() {
  const [reservations, setReservations] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [facilityError, setFacilityError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [photoSelection, setPhotoSelection] = useState(null);

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = setInterval(refresh, 1000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [reservationResult, facilityResult] = await Promise.allSettled([
          getMyReservations(),
          getFacilities(),
        ]);

        if (!active) return;

        if (reservationResult.status === "rejected") {
          throw reservationResult.reason;
        }

        const data = reservationResult.value;
        setReservations(data);

        if (facilityResult.status === "fulfilled") {
          setFacilities(facilityResult.value);
        } else {
          setFacilityError(
            facilityResult.reason?.message || "Could not load facility details."
          );
        }

        const firstApproved = data.find(
          (r) =>
            r.status === "approved" &&
            !r.checked_in_at &&
            new Date(r.end_time) > new Date()
        );

        if (firstApproved) {
          setSelectedId(String(firstApproved.id));
        }
      } catch (err) {
        if (active) {
          setError(err.message || "Could not load reservations.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const approvedReservations = reservations.filter(
    (r) =>
      r.status === "approved" &&
      !r.checked_in_at &&
      new Date(r.end_time).getTime() > now
  );

  const selected = reservations.find(
    (r) => String(r.id) === selectedId
  );

  const selectedFacility = facilities.find(
    (facility) => String(facility.id) === String(selected?.facility_id)
  );
  const buildingLocation =
    selectedFacility?.building_name?.trim() ||
    selectedFacility?.location?.trim();
  const floorLocation = formatFloor(selectedFacility?.floor_number);
  const facilityLocation =
    buildingLocation && floorLocation
      ? `${buildingLocation} · ${floorLocation}`
      : buildingLocation || floorLocation;
  const defaultImageIndex = 0;
  const imageIndex =
    photoSelection?.reservationId === String(selected?.id)
      ? photoSelection.index
      : defaultImageIndex;

  const withinCheckInWindow =
    selected &&
    now >= new Date(selected.start_time).getTime() - 15 * 60 * 1000 &&
    now < new Date(selected.end_time).getTime();

  const rows = selected
    ? [
        {
          icon: CalendarDays,
          label: "Date",
          value: formatDate(selected.start_time),
        },
        {
          icon: Clock,
          label: "Time",
          value:
            `${formatTime(selected.start_time)} – ` +
            formatTime(selected.end_time),
        },
        {
          icon: Users,
          label: "Attendees",
          value: `${selected.attendees ?? 1}`,
        },
        {
          icon: ReceiptText,
          label: "Reservation ID",
          value: `CR-${String(selected.id).padStart(6, "0")}`,
        },
      ]
    : [];

  async function handleCheckIn() {
    if (!selected || busy) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await checkInReservation(selected.id);

      setMessage(
        `Successfully checked in to ${
          selected.facility_name || "your reservation"
        }!`
      );

      const updated = await getMyReservations();
      setReservations(updated);
      setSelectedId("");
    } catch (err) {
      setError(err.message || "Check-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StudentLayout>
      <div className="student-page checkin-page">
        <header className="checkin-hero">
          <div className="checkin-hero-art" aria-hidden="true">
            <div className="checkin-hero-platform" />
            <div className="checkin-hero-marker">
              <Check />
            </div>
          </div>
          <span className="checkin-hero-divider" aria-hidden="true" />
          <div className="checkin-hero-copy">
            <h1>Check In to Your Reservation</h1>
            <p>Confirm your arrival to start your reservation and access your space.</p>
          </div>
        </header>

        {error && <p role="alert" className="checkin-error">{error}</p>}

        {loading ? (
          <p className="checkin-loading" role="status">
            Loading your reservations...
          </p>
        ) : (
          <>
            {approvedReservations.length > 1 && (
              <div className="checkin-selection">
                <label
                  htmlFor="check-in-reservation"
                  className="checkin-selection-label"
                >
                  Select your reservation
                </label>

                <select
                  id="check-in-reservation"
                  value={selectedId}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setError("");
                    setMessage("");
                  }}
                  className="checkin-selection-select"
                >
                  <option value="">Choose a reservation</option>
                  {approvedReservations.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.facility_name || `Facility #${r.facility_id}`}
                      {" — "}
                      {formatDate(r.start_time)}
                      {" at "}
                      {formatTime(r.start_time)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selected && (
              <section className="checkin-reservation-card" aria-labelledby="checkin-facility-name">
                <div className="checkin-gallery">
                  <img
                    src={ROOM_PHOTOS[imageIndex]}
                    alt={`${selected.facility_name || "Reserved campus space"} interior`}
                    className="checkin-room-photo"
                  />
                  <div className="checkin-gallery-dots" aria-label="Room photos">
                    {ROOM_PHOTOS.map((photo, index) => (
                      <button
                        key={photo}
                        type="button"
                        aria-label={`Show room photo ${index + 1}`}
                        aria-pressed={imageIndex === index}
                        className={imageIndex === index ? "is-active" : ""}
                        onClick={() => setPhotoSelection({ reservationId: String(selected.id), index })}
                      />
                    ))}
                  </div>
                </div>

                <div className="checkin-reservation-details">
                  <div className="checkin-facility-heading">
                    <h2 id="checkin-facility-name">
                      {selected.facility_name || `Facility #${selected.facility_id}`}
                    </h2>
                    <p className="checkin-facility-location">
                      <MapPin aria-hidden="true" />
                      {facilityLocation || (facilityError ? "Location details unavailable" : "Loading location…")}
                    </p>
                    {facilityError && (
                      <p className="checkin-location-error" role="status">
                        {facilityError}
                      </p>
                    )}
                  </div>

                  <dl className="checkin-detail-grid">
                    {rows.map(({ icon: Icon, label, value }) => (
                      <div key={label} className="checkin-detail-item">
                        <Icon aria-hidden="true" />
                        <div>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      </div>
                    ))}
                  </dl>

                  <section className="checkin-booking-summary" aria-labelledby="checkin-summary-heading">
                    <h3 id="checkin-summary-heading">Booking Summary</h3>
                    <div className="checkin-summary-item">
                      <Users aria-hidden="true" />
                      <div>
                        <strong>{selected.facility_name || `Facility #${selected.facility_id}`}</strong>
                        <p>
                          {formatDate(selected.start_time)}
                          <span aria-hidden="true"> · </span>
                          {formatTime(selected.start_time)} – {formatTime(selected.end_time)}
                          <span aria-hidden="true"> · </span>
                          {selected.attendees ?? 1} attendees
                        </p>
                      </div>
                    </div>
                  </section>

                <button
                  type="button"
                  onClick={handleCheckIn}
                  disabled={busy || !withinCheckInWindow}
                  className="checkin-submit"
                >
                  <span><Check aria-hidden="true" /></span>
                  {busy ? "Checking in..." : "Check In"}
                </button>

                  {!withinCheckInWindow && (
                    <p className="checkin-window-note" role="status">
                      <Info aria-hidden="true" />
                      Check-in opens 15 minutes before your reservation and closes when it ends.
                    </p>
                  )}
                </div>
              </section>
            )}

            {!selected && !message && !error && (
              <div className="checkin-empty">
                <span><Building2 aria-hidden="true" /></span>
                <h2>{approvedReservations.length ? "Choose a reservation" : "No check-ins just yet"}</h2>
                <p>{approvedReservations.length ? "Select a reservation to see its details and check-in window." : "Your approved upcoming reservations will appear here when they’re ready."}</p>
                <Link to="/reservations">View my reservations</Link>
              </div>
            )}

            {message && (
              <p
                role="status"
                className="checkin-success"
              >
                {message}
              </p>
            )}

          </>
        )}
      </div>
    </StudentLayout>
  );
}
