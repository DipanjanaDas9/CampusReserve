import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import Dashboard from "./Dashboard.jsx";
import { LoginPage } from "./pages/auth/LoginPage.jsx";
import { RegisterPage } from "./pages/auth/RegisterPage.jsx";
import { AvailabilityPage } from "./pages/AvailabilityPage.jsx";
import { MyReservationsPage } from "./pages/MyReservationsPage.jsx";
import { CheckInPage } from "./pages/CheckInPage.jsx";
import { NotificationsPage } from "./pages/NotificationsPage.jsx";
import { BookPage } from "./pages/BookPage.jsx";
import { AiFinderPage } from "./pages/AiFinderPage.jsx";
import { SearchSpacesPage } from "./pages/SearchSpacesPage.jsx";
import { FacilityDetailsPage } from "./pages/FacilityDetailsPage.jsx";
import { RequireAdmin } from "./components/RequireAdmin.jsx";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage.jsx";
import { ComingSoonPage } from "./pages/admin/ComingSoonPage.jsx";
import { ApprovalsPage } from "./pages/admin/ApprovalsPage.jsx";
import { ManageFacilitiesPage } from "./pages/admin/ManageFacilitiesPage.jsx";
import { UsersPage } from "./pages/admin/UsersPage";
import { ReportsPage } from "./pages/admin/ReportsPage";
import { AdminNotificationsPage } from "./pages/admin/AdminNotificationsPage";
import { useEffect, useState } from "react";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage.jsx";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage.jsx";

function RequireLogin() {
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");

    if (!token) return;

    function expireSession() {
      sessionStorage.removeItem("access_token");
      sessionStorage.removeItem("campus_user");
      setExpired(true);
    }

    let expirationTime;

    try {
      const payload = JSON.parse(
        atob(
          token.split(".")[1]
            .replace(/-/g, "+")
            .replace(/_/g, "/")
        )
      );

      expirationTime = payload.exp * 1000;

      if (!Number.isFinite(expirationTime)) {
        throw new Error("Invalid token expiration");
      }
    } catch {
      expireSession();
      return;
    }

    const remainingTime = expirationTime - Date.now();

    if (remainingTime <= 0) {
      expireSession();
      return;
    }

    // Automatically expire the session when the JWT expires.
    const timer = setTimeout(expireSession, remainingTime);

    // Also check when the user returns to the browser tab.
    function checkExpiration() {
      if (Date.now() >= expirationTime) {
        expireSession();
      }
    }

    window.addEventListener("focus", checkExpiration);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", checkExpiration);
    };
  }, []);

  if (expired) {
    return <Navigate to="/login?reason=expired" replace />;
  }

  if (!sessionStorage.getItem("access_token")) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
export default function App() { return <BrowserRouter><Routes>
<Route path="/login" element={<LoginPage />} /><Route path="/register" element={<RegisterPage />} />
<Route path="/forgot-password" element={<ForgotPasswordPage />} />
<Route path="/reset-password" element={<ResetPasswordPage />} />
<Route element={<RequireLogin />}>
<Route path="/" element={<Dashboard />} /><Route path="/dashboard" element={<Navigate to="/" replace />} />
<Route path="/availability" element={<AvailabilityPage />} /><Route path="/reservations" element={<MyReservationsPage />} />
<Route path="/check-in" element={<CheckInPage />} /><Route path="/notifications" element={<NotificationsPage />} />
<Route path="/spaces/:id/book" element={<BookPage />} />
<Route path="/ai-finder" element={<AiFinderPage />} />
<Route path="/search" element={<SearchSpacesPage />} />
<Route path="/spaces/:id" element={<FacilityDetailsPage />} />
<Route element={<RequireAdmin />}>
<Route path="/admin" element={<AdminDashboardPage />} />
<Route path="/admin/approvals" element={<ApprovalsPage />} />
<Route path="/admin/facilities" element={<ManageFacilitiesPage />} />
<Route path="/admin/users" element={<UsersPage />} />
<Route path="/admin/reports" element={<ReportsPage />} />
<Route path="/admin/notifications" element={<AdminNotificationsPage/>} />

</Route></Route>

<Route path="*" element={<Navigate to="/" replace />} /></Routes></BrowserRouter>; }
