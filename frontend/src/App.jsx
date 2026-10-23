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
function RequireLogin() { return sessionStorage.getItem("access_token") ? <Outlet /> : <Navigate to="/login" replace />; }
export default function App() { return <BrowserRouter><Routes>
<Route path="/login" element={<LoginPage />} /><Route path="/register" element={<RegisterPage />} />
<Route element={<RequireLogin />}>
<Route path="/" element={<Dashboard />} /><Route path="/dashboard" element={<Navigate to="/" replace />} />
<Route path="/availability" element={<AvailabilityPage />} /><Route path="/reservations" element={<MyReservationsPage />} />
<Route path="/check-in" element={<CheckInPage />} /><Route path="/notifications" element={<NotificationsPage />} />
<Route path="/spaces/:id/book" element={<BookPage />} />
<Route path="/ai-finder" element={<AiFinderPage />} />
<Route path="/search" element={<SearchSpacesPage />} /></Route>
<Route path="*" element={<Navigate to="/" replace />} /></Routes></BrowserRouter>; }
