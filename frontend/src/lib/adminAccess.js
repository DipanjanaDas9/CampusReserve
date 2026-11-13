// The role comes from the backend's login response (users.role: "student" | "admin").
export function currentUser() {
  try {
    return JSON.parse(sessionStorage.getItem("campus_user") || "null");
  } catch {
    return null;
  }
}

export const isAdmin = () => currentUser()?.role === "admin";
