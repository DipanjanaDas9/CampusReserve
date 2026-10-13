
import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useNavigate,
} from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import "./App.css";

function Home() {
  const navigate = useNavigate();
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const user = JSON.parse(
    sessionStorage.getItem("campus_user") || "null"
  );

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
          "http://127.0.0.1:8000/facilities"
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
      <header className="dashboard-header">
        <Link to="/" className="dashboard-brand">
          <span className="brand-icon">C</span>
          CampusReserve
        </Link>

        <nav className="dashboard-nav">
          <a href="#facilities">Facilities</a>
          <a href="#reservations">My reservations</a>
          <button onClick={handleLogout} className="logout-button">
            Log out
          </button>
        </nav>
      </header>

      <main className="dashboard-main">
        <section className="welcome-banner">
          <div>
            <p className="eyebrow">YOUR CAMPUS, YOUR SPACE</p>
            <h1>
              Welcome back{user?.name ? `, ${user.name}` : ""}!
            </h1>
            <p>
              Find a space to study, collaborate, or practice.
            </p>
            <a href="#facilities" className="dashboard-cta">
              Explore facilities
            </a>
          </div>

          <div className="welcome-decoration" aria-hidden="true">
            <span>CR</span>
          </div>
        </section>

        <section id="facilities" className="facilities-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">EXPLORE YOUR OPTIONS</p>
              <h2>Campus facilities</h2>
              <p>Find a space that fits your needs.</p>
            </div>

            <span className="facility-count">
              {facilities.length} spaces
            </span>
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

          {!loading && !error && facilities.length === 0 && (
            <p className="dashboard-message">
              No facilities are available yet.
            </p>
          )}

          {!loading && !error && facilities.length > 0 && (
            <div className="facility-grid">
              {facilities.map((facility) => (
                <article className="facility-card" key={facility.id}>
                  <div className="facility-icon" aria-hidden="true">
                    {facility.name.toLowerCase().includes("computer")
                      ? "▦"
                      : facility.name.toLowerCase().includes("practice")
                      ? "♫"
                      : "⌂"}
                  </div>

                  <div className="facility-card-content">
                    <h3>{facility.name}</h3>
                    <p className="facility-capacity">
                      Capacity: {facility.capacity} people
                    </p>

                    <div className="equipment-list">
                      <span className="equipment-label">Equipment</span>
                      <div className="equipment-tags">
                        {facility.equipment?.map((item) => (
                          <span className="equipment-tag" key={item}>
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    className="reserve-button"
                    onClick={() =>
                      alert(
                        "Reservation booking is our next feature!"
                      )
                    }
                  >
                    Reserve a space
                    <span aria-hidden="true"> →</span>
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="reservations" className="reservation-placeholder">
          <div>
            <p className="eyebrow">COMING NEXT</p>
            <h2>Your reservations</h2>
            <p>
              Soon you'll be able to view bookings, track requests,
              and manage your reservations here.
            </p>
          </div>
          <span className="calendar-icon" aria-hidden="true">▦</span>
        </section>
      </main>

      <footer className="dashboard-footer">
        CampusReserve · Campus spaces, simplified.
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Routes>
    </BrowserRouter>
  );
}
