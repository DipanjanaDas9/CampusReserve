import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { listFacilities } from "./api/facilities";
import { getMyReservations } from "./api/reservations";
import { RoomCard } from "./components/RoomCard";
import { StudentLayout } from "./layouts/StudentLayout";
import { campusParts } from "./lib/datetime";
import { facilityToRoom } from "./lib/rooms";
import "./App.css";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1800&q=85";

export default function Dashboard() {
  const [facilities, setFacilities] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loadingSpaces, setLoadingSpaces] = useState(true);
  const [loadingReservations, setLoadingReservations] = useState(true);
  const [spaceError, setSpaceError] = useState("");
  const [reservationError, setReservationError] = useState("");
  const user = JSON.parse(sessionStorage.getItem("campus_user") || "null");
  const firstName = user?.name?.trim().split(/\s+/)[0];

  useEffect(() => {
    let cancelled = false;
    listFacilities()
      .then((items) => {
        if (!cancelled) {
          setFacilities(items.filter((item) => item.is_active));
          setSpaceError("");
        }
      })
      .catch((error) => {
        if (!cancelled) setSpaceError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingSpaces(false);
      });

    getMyReservations()
      .then((items) => {
        if (!cancelled) {
          setReservations(items);
          setReservationError("");
        }
      })
      .catch((error) => {
        if (!cancelled) setReservationError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingReservations(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const upcomingReservations = useMemo(() => {
    const now = new Date();
    return reservations
      .filter(
        (reservation) =>
          new Date(reservation.end_time) >= now &&
          ["pending", "approved"].includes(reservation.status)
      )
      .sort(
        (a, b) => new Date(a.start_time) - new Date(b.start_time)
      )
      .slice(0, 3);
  }, [reservations]);

  const recommendedSpaces = facilities.slice(0, 3).map(facilityToRoom);
  const greeting = firstName ? `Welcome back, ${firstName}!` : "Welcome back!";

  return (
    <StudentLayout>
      <div className="campus-dashboard">
        <section
          className="campus-page-banner dashboard-hero"
          style={{ "--dashboard-hero-image": `url("${HERO_IMAGE}")` }}
        >
          <div className="dashboard-hero-copy">
            <p className="dashboard-eyebrow">YOUR CAMPUS, YOUR POSSIBILITIES</p>
            <h1>{greeting} <span aria-hidden="true">👋</span></h1>
            <p>Find, reserve, and make the most of your campus spaces.</p>
            <Link to="/search" className="dashboard-hero-button">
              Find a space <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </section>

        <div className="dashboard-lower-grid">
          <section className="dashboard-panel dashboard-quick-panel">
            <div className="dashboard-section-heading">
              <div><p className="dashboard-section-kicker">GET STARTED</p><h2>Quick Actions</h2></div>
            </div>
            <div className="dashboard-quick-actions">
              <Link to="/search"><span><Search aria-hidden="true" /></span><strong>Find a Space</strong></Link>
              <Link to="/ai-finder"><span><Sparkles aria-hidden="true" /></span><strong>AI Space Finder</strong></Link>
              <Link to="/availability"><span><CalendarDays aria-hidden="true" /></span><strong>Check Availability</strong></Link>
              <Link to="/check-in"><span><CheckCircle2 aria-hidden="true" /></span><strong>Check In</strong></Link>
            </div>
          </section>

          <section className="dashboard-panel dashboard-upcoming-panel">
            <div className="dashboard-section-heading">
              <div><p className="dashboard-section-kicker">YOUR SCHEDULE</p><h2>Upcoming Reservations</h2></div>
              <Link to="/reservations">View all <ArrowRight aria-hidden="true" /></Link>
            </div>
            {reservationError && <p className="dashboard-inline-error" role="alert">{reservationError}</p>}
            {loadingReservations ? (
              <p className="dashboard-panel-message" role="status">Loading reservations…</p>
            ) : upcomingReservations.length ? (
              <ul className="dashboard-reservation-list">
                {upcomingReservations.map((reservation) => {
                  const start = campusParts(reservation.start_time);
                  const end = campusParts(reservation.end_time);
                  return (
                    <li key={reservation.id}>
                      <span className="dashboard-reservation-icon"><CalendarCheck aria-hidden="true" /></span>
                      <div className="dashboard-reservation-copy">
                        <strong>{reservation.facility_name || `Space ${reservation.facility_id}`}</strong>
                        <span><Clock3 aria-hidden="true" />{start.date} · {start.time}–{end.time}</span>
                      </div>
                      <span className={`reservation-status status-${reservation.status}`}>{reservation.status}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="dashboard-empty-upcoming">
                <span><CalendarDays aria-hidden="true" /></span>
                <p>No upcoming reservations yet.</p>
                <Link to="/search">Explore spaces <ArrowRight aria-hidden="true" /></Link>
              </div>
            )}
          </section>
        </div>

        <section className="dashboard-recommendations">
          <div className="dashboard-section-heading">
            <div><p className="dashboard-section-kicker">CURATED FOR YOUR CAMPUS</p><h2>Smart Suggestions for You</h2></div>
            <Link to="/search">Explore all spaces <ArrowRight aria-hidden="true" /></Link>
          </div>
          {spaceError && <p className="dashboard-inline-error" role="alert">{spaceError}</p>}
          {loadingSpaces ? (
            <p className="dashboard-panel-message" role="status">Loading campus spaces…</p>
          ) : recommendedSpaces.length ? (
            <div className="dashboard-recommendation-grid">
              {recommendedSpaces.map((room) => <RoomCard key={room.id} room={room} />)}
            </div>
          ) : (
            <div className="dashboard-empty-spaces">
              <Users aria-hidden="true" />
              <div><strong>Spaces will show up here</strong><p>Your campus administrator hasn’t added any spaces yet.</p></div>
            </div>
          )}
        </section>

      </div>
    </StudentLayout>
  );
}
