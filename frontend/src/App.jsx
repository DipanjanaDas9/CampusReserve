
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
          <a href="#room-search">Room search</a>
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
              Search for a room
            </a>
          </div>

          <div className="welcome-decoration" aria-hidden="true">
            <span>CR</span>
          </div>
        </section>

        <RoomSearch navigate={navigate} />

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

function RoomSearch({ navigate }) {
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [minCapacity, setMinCapacity] = useState("1");
  const [equipment, setEquipment] = useState("");
  const [rooms, setRooms] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aiQuery, setAiQuery] = useState("");
  const [searchMode, setSearchMode] = useState("manual");

  async function handleSearch(event) {
    event.preventDefault();
    setError("");
    setHasSearched(false);

    if (endTime <= startTime) {
      setError("End time must be later than start time.");
      return;
    }
    if (!Number.isInteger(Number(minCapacity)) || Number(minCapacity) < 1) {
      setError("Minimum capacity must be a positive whole number.");
      return;
    }

    const token = sessionStorage.getItem("access_token");
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    const params = new URLSearchParams({
      date,
      start_time: startTime,
      end_time: endTime,
      min_capacity: minCapacity,
    });
    equipment
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => params.append("equipment", item));

    setLoading(true);
    try {
      const response = await fetch(
        `http://127.0.0.1:8000/rooms/search?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Room search failed.");
      }
      setRooms(data);
      setHasSearched(true);
    } catch (searchError) {
      setError(
        searchError.message === "Failed to fetch"
          ? "Cannot connect to the server. Check that FastAPI is running."
          : searchError.message
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAISearch(event) {
    event.preventDefault();
    setError("");
    setHasSearched(false);

    if (!aiQuery.trim()) {
      setError("Describe the room you need.");
      return;
    }

    const token = sessionStorage.getItem("access_token");
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }

    setSearchMode("ai");
    setLoading(true);

    try {
      const response = await fetch(
        "http://127.0.0.1:8000/rooms/ai-search",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: aiQuery.trim(),
            date: date || null,
            start_time: startTime || null,
            end_time: endTime || null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "AI room search failed.");
      }

      setRooms(data.results || []);
      setHasSearched(true);
    } catch (searchError) {
      setError(
        searchError.message === "Failed to fetch"
          ? "Cannot connect to the server. Check that FastAPI is running."
          : searchError.message
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="room-search" className="room-search-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">FIND AN AVAILABLE SPACE</p>
          <h2>Search rooms</h2>
          <p>Choose a time, group size, and any equipment you need.</p>
        </div>
      </div>
      
<form className="ai-search-form" onSubmit={handleAISearch}>
  <label htmlFor="ai-room-query">
    Describe the room you need
  </label>

  <textarea
    id="ai-room-query"
    value={aiQuery}
    onChange={(event) => setAiQuery(event.target.value)}
    placeholder="Find a room for 5 people tomorrow from 2 PM to 5 PM with a projector"
    maxLength={500}
    rows={3}
    required
  />

  <button
    className="search-rooms-button"
    type="submit"
    disabled={loading}
  >
    {loading ? "Searching..." : "Search with AI"}
  </button>
</form>

      <p className="sample-data-notice">
        SAMPLE rooms are for local development only. Their availability is not verified campus availability.
      </p>

      <form className="room-search-form" onSubmit={handleSearch}>
        <label>
          Date
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </label>
        <label>
          Start time
          <input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required />
        </label>
        <label>
          End time
          <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} required />
        </label>
        <label>
          Minimum capacity
          <input type="number" min="1" max="10000" value={minCapacity} onChange={(event) => setMinCapacity(event.target.value)} required />
        </label>
        <label className="equipment-input">
          Required equipment
          <input type="text" value={equipment} onChange={(event) => setEquipment(event.target.value)} placeholder="Whiteboard, Projector" />
          <span>Separate items with commas. All listed items must match.</span>
        </label>
        <button className="search-rooms-button" type="submit" disabled={loading}>
          {loading ? "Searching..." : "Search rooms"}
        </button>
      </form>

      {error && <p className="room-search-error" role="alert">{error}</p>}
      {loading && <p className="dashboard-message">Checking room availability...</p>}
      {hasSearched && !loading && rooms.length === 0 && (
        <p className="dashboard-message">No rooms match those needs for this time.</p>
      )}
      {hasSearched && rooms.length > 0 && (
        <div className="room-results" aria-live="polite">
          {rooms.map((room) => (
            <article className="room-result-card" key={room.id}>
              <div>
                <h3>{room.name}</h3>
                <p>{room.location} · Capacity {room.capacity}</p>
                <div className="equipment-tags">
                  {room.equipment.map((item) => <span className="equipment-tag" key={item}>{item}</span>)}
                </div>
              </div>
              {room.is_sample && <span className="sample-room-label">Sample room</span>}
            </article>
          ))}
        </div>
      )}
    </section>
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
