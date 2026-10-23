import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import Dashboard from "./Dashboard.jsx";
import { currentUser } from "./api/client";
import { LoginPage } from "./pages/auth/LoginPage.jsx";
import { RegisterPage } from "./pages/auth/RegisterPage.jsx";
import { SearchSpacesPage } from "./pages/SearchSpacesPage.jsx";
import { FacilityDetailsPage } from "./pages/FacilityDetailsPage.jsx";
import { AvailabilityPage } from "./pages/AvailabilityPage.jsx";
import { MyReservationsPage } from "./pages/MyReservationsPage.jsx";
import { CheckInPage } from "./pages/CheckInPage.jsx";
import { NotificationsPage } from "./pages/NotificationsPage.jsx";
import { BookPage } from "./pages/BookPage.jsx";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage.jsx";
import { ApprovalsPage } from "./pages/admin/ApprovalsPage.jsx";
import { ManageFacilitiesPage } from "./pages/admin/ManageFacilitiesPage.jsx";

function RequireLogin() {
  return sessionStorage.getItem("access_token") ? <Outlet /> : <Navigate to="/login" replace />;
}

// The UI hides admin pages from students; the backend enforces it with require_admin.
function RequireAdmin() {
  return currentUser()?.role === "admin" ? <Outlet /> : <Navigate to="/" replace />;
}

function Home() {
  return currentUser()?.role === "admin" ? <Navigate to="/admin" replace /> : <Dashboard />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<RequireLogin />}>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/search" element={<SearchSpacesPage />} />
          <Route path="/spaces/:id" element={<FacilityDetailsPage />} />
          <Route path="/spaces/:id/book" element={<BookPage />} />
          <Route path="/availability" element={<AvailabilityPage />} />
          <Route path="/reservations" element={<MyReservationsPage />} />
          <Route path="/check-in" element={<CheckInPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/approvals" element={<ApprovalsPage />} />
            <Route path="/admin/facilities" element={<ManageFacilitiesPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
