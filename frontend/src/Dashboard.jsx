import { useEffect, useMemo, useState } from "react";
import {
  Armchair,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarCheck,
  Clock3,
  LayoutDashboard,
  LogOut,
  MapPin,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import "./App.css";

const facilityImages = [
  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=900&q=80",
];

const navigation = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard, active: true },
  { label: "Search Spaces", to: "/search", icon: Search },
  { label: "My Reservations", to: "/reservations", icon: CalendarCheck },
  { label: "Notifications", to: "/notifications", icon: Bell },
  { label: "AI Assistant", to: "/ai-finder", icon: Sparkles },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const user = JSON.parse(
    sessionStorage.getItem("campus_user") || "null"
  );
  const firstName = user?.name?.trim().split(/\s+/)[0];
  const initials = user?.name
    ?.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "ST";

  const filteredFacilities = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return facilities;

    return facilities.filter((facility) =>
      [facility.name, ...(facility.equipment || [])]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [facilities, searchTerm]);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");

    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    let cancelled = false;

    async function loadFacilities() {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"}/facilities`
        );

        if (!response.ok) {
          throw new Error("Unable to load facilities.");
        }

        const data = await response.json();

        if (!cancelled) {
          setFacilities(data);
          setError("");
        }
      } catch {
        if (!cancelled) {
          setError(
            "Couldn't load facilities. Make sure the backend is running."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadFacilities();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  function handleLogout() {
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("campus_user");
    navigate("/login", { replace: true });
  }

  return (
    <div className="dashboard">
      <aside className="dashboard-sidebar">
        <Link to="/" className="dashboard-brand">
          <Building2 aria-hidden="true" />
          <span>CampusReserve</span>
        </Link>

        <nav className="dashboard-nav" aria-label="Main navigation">
          {navigation.map(({ label, to, icon: Icon, active }) => (
            <Link
              key={label}
              to={to}
              aria-current={active ? "page" : undefined}
              className={`dashboard-nav-link${active ? " is-active" : ""}`}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
          <Link to="/check-in" className="dashboard-nav-link">
            <Clock3 aria-hidden="true" />
            <span>Check in</span>
          </Link>
        </nav>

        <div className="dashboard-account">
          <div className="account-avatar">{initials}</div>
          <div className="account-details">
            <strong>{user?.name || "Student"}</strong>
            <span>{user?.email || "Campus member"}</span>
          </div>
          <button
            className="sidebar-logout"
            onClick={handleLogout}
            aria-label="Log out"
            title="Log out"
          >
            <LogOut aria-hidden="true" />
          </button>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <label className="dashboard-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Search spaces</span>
            <input
              type="search"
              placeholder="Search spaces..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
          <Link
            to="/notifications"
            className="topbar-icon-button"
            aria-label="Notifications"
          >
            <Bell aria-hidden="true" />
          </Link>
          <div className="topbar-avatar" aria-label={user?.name || "Student"}>
            {initials}
          </div>
        </header>

        <div className="dashboard-content">
          <section className="dashboard-welcome">
            <h1>
              Welcome back{firstName ? `, ${firstName}` : ""}! <span aria-hidden="true">👋</span>
            </h1>
            <p>
              Find and reserve the perfect space for your meetings, study
              sessions, or events.
            </p>
          </section>

          <section className="dashboard-stats" aria-label="Reservation overview">
            <Link to="/reservations" className="dashboard-stat">
              <div className="stat-label">
                <CalendarCheck className="stat-icon blue" aria-hidden="true" />
                <span>Upcoming Reservations</span>
              </div>
              <strong className="stat-action">View</strong>
            </Link>
            <Link to="/notifications" className="dashboard-stat">
              <div className="stat-label">
                <Bell className="stat-icon orange" aria-hidden="true" />
                <span>Pending Requests</span>
              </div>
              <strong className="stat-action orange-text">View</strong>
            </Link>
            <Link to="/availability" className="dashboard-stat">
              <div className="stat-label">
                <Building2 className="stat-icon green" aria-hidden="true" />
                <span>Spaces to Explore</span>
              </div>
              <strong className="stat-value green-text">
                {loading ? "…" : facilities.length}
              </strong>
            </Link>
            <Link to="/availability" className="dashboard-stat quick-book-stat">
              <div className="stat-label">
                <ArrowUpRight className="stat-icon blue" aria-hidden="true" />
                <span>Quick Book</span>
              </div>
              <strong className="stat-action">Find a space</strong>
            </Link>
          </section>

          <section id="facilities" className="recommended-section">
            <div className="recommended-heading">
              <h2>Recommended Spaces</h2>
              <Link to="/availability" className="view-all-link">
                View All
              </Link>
            </div>

            {loading && (
              <p className="dashboard-message">Loading facilities...</p>
            )}

            {error && (
              <div className="dashboard-error">
                <p>{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="retry-button"
                >
                  Try again
                </button>
              </div>
            )}

            {!loading && !error && filteredFacilities.length === 0 && (
              <p className="dashboard-message">
                {searchTerm
                  ? "No spaces match your search."
                  : "No facilities are available yet."}
              </p>
            )}

            {!loading && !error && filteredFacilities.length > 0 && (
              <div className="facility-grid">
                {filteredFacilities.map((facility) => {
                  const imageIndex = Math.max(
                    0,
                    (Number(facility.id) - 1) % facilityImages.length
                  );

                  return (
                    <article className="facility-card" key={facility.id}>
                      <img
                        className="facility-image"
                        src={facilityImages[imageIndex]}
                        alt=""
                      />
                      <div className="facility-card-content">
                        <h3>{facility.name}</h3>
                        <p className="facility-detail">
                          <Users aria-hidden="true" />
                          Capacity: {facility.capacity}
                        </p>
                        <p className="facility-detail equipment-detail">
                          <Armchair aria-hidden="true" />
                          {facility.equipment?.length
                            ? facility.equipment.join(", ")
                            : "Flexible seating"}
                        </p>
                        <p className="facility-detail">
                          <MapPin aria-hidden="true" />
                          Campus facility
                        </p>
                        <button
                          className="reserve-button"
                          onClick={() =>
                            navigate(`/spaces/${facility.id}`, {
                              state: {
                                room: {
                                  ...facility,
                                  location: "Campus facility",
                                  photo: facilityImages[imageIndex],
                                  isSample: Boolean(facility.is_sample),
                                },
                              },
                            })
                          }
                        >
                          View Details
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
