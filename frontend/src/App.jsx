
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Login from "./pages/login";
import Register from "./pages/Register";

function Home() {
  return (
    <main style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      padding: "24px",
      background: "#f3f6fb",
      textAlign: "center"
    }}>
      <div>
        <h1 style={{ color: "#163b65" }}>CampusReserve</h1>
        <p>Find and reserve your campus spaces.</p>
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: "12px",
          marginTop: "24px"
        }}>
          <Link to="/login">Sign in</Link>
          <Link to="/register">Create account</Link>
        </div>
      </div>
    </main>
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
