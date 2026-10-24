// Small fetch wrapper for the FastAPI backend: adds the bearer token and turns
// error responses into readable messages (FastAPI's `detail`).
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const FALLBACK_MESSAGES = {
  401: "Your session has expired. Please sign in again.",
  403: "You don't have permission to do that.",
  404: "Not found.",
  500: "The server could not complete the request.",
};

function detailMessage(detail, status) {
  if (typeof detail === "string") return detail;
  // 422 validation errors: [{loc: [..., "field"], msg}]
  if (Array.isArray(detail) && detail.length) return detail.map((d) => `${d.loc?.at(-1) ?? "input"}: ${d.msg}`).join("; ");
  return FALLBACK_MESSAGES[status] ?? "Request failed. Please try again.";
}

export async function apiRequest(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(API_BASE_URL + path, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${sessionStorage.getItem("access_token") || ""}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Cannot reach the server. Check that the backend is running.", 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(detailMessage(data?.detail, res.status), res.status);
  return data;
}
