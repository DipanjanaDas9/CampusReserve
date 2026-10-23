// Shared fetch wrapper for the FastAPI backend (backend/main.py).
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export function currentUser() {
  try {
    return JSON.parse(sessionStorage.getItem("campus_user") || "null");
  } catch {
    return null;
  }
}

export function clearSession() {
  sessionStorage.removeItem("access_token");
  sessionStorage.removeItem("campus_user");
}

export async function apiFetch(path, { method = "GET", body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) headers.Authorization = `Bearer ${sessionStorage.getItem("access_token") || ""}`;
  let res;
  try {
    res = await fetch(API_BASE_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error("Cannot connect to the server. Check that the backend is running.");
  }
  if (res.status === 401 && auth) {
    // Expired or invalid token: send the user back to sign in.
    clearSession();
    window.location.assign("/login");
    throw new Error("Your session has expired. Please sign in again.");
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.detail;
    throw new Error(
      typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((d) => d.msg).join(" ") : "Request failed. Please try again."
    );
  }
  return data;
}
