import { API_BASE_URL, apiFetch } from "./client";

export { API_BASE_URL };
export const ROLE_REDIRECTS = { student: "/", admin: "/admin" };
export const PASSWORD_MIN_LENGTH = 8;
export class AuthNotConnectedError extends Error {}
export class RegistrationNotConnectedError extends Error {}

export async function login({ email, password, role }) {
  const data = await apiFetch("/auth/login", { method: "POST", body: { email, password }, auth: false });
  if (!data?.access_token || !data?.user) throw new Error("Invalid login response from server.");
  const accountRole = data.user.role || "student";
  if (role === "admin" && accountRole !== "admin") {
    throw new Error("This account does not have administrator access. Sign in on the Student tab.");
  }
  sessionStorage.setItem("access_token", data.access_token);
  sessionStorage.setItem("campus_user", JSON.stringify({ ...data.user, role: accountRole }));
  return { ...data, role: accountRole };
}

export async function register({ full_name, email, password }) {
  await apiFetch("/auth/register", { method: "POST", body: { name: full_name, email, password }, auth: false });
}
