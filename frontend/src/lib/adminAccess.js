// The backend has no roles yet (risk R-04). Real admins are users whose stored
// role is "admin"; in development anyone signed in may open the admin pages as a demo.
export function currentUser() {
  try {
    return JSON.parse(sessionStorage.getItem("campus_user") || "null");
  } catch {
    return null;
  }
}

export const isAdmin = () => currentUser()?.role === "admin";

export const isDemoAdmin = () => !isAdmin() && import.meta.env.DEV;
