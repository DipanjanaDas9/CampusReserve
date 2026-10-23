import { Navigate, Outlet } from "react-router-dom";
import { isAdmin } from "../lib/adminAccess";

/** Admins only; in development any signed-in user may view the demo admin pages (AdminLayout shows a banner). */
export function RequireAdmin() {
  return isAdmin() || import.meta.env.DEV ? <Outlet /> : <Navigate to="/" replace />;
}
