import { Navigate, Outlet } from "react-router-dom";
import { isAdmin } from "../lib/adminAccess";

/** Admins only (role from the login response); everyone else goes to the student dashboard. */
export function RequireAdmin() {
  return isAdmin() ? <Outlet /> : <Navigate to="/" replace />;
}
