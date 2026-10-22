// Matches CampusReserve dev backend/main.py, not Lovable's proposed /api/v1 API.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
export const ROLE_REDIRECTS = { student: "/" };
export const PASSWORD_MIN_LENGTH = 8;
export class AuthNotConnectedError extends Error {}
export class RegistrationNotConnectedError extends Error {}
async function post(path, payload) {
  const res = await fetch(API_BASE_URL + path, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof body?.detail === "string" ? body.detail : "Request failed. Check your input and try again.");
  return body;
}
export async function login({email,password,role}) {
  if(role !== "student") throw new Error("Administrator sign-in is not supported by the current backend.");
  const data = await post("/auth/login",{email,password});
  if (!data?.access_token || !data?.user) throw new Error("Invalid login response from server.");
  sessionStorage.setItem("access_token",data.access_token);
  sessionStorage.setItem("campus_user",JSON.stringify(data.user));
  return {...data,role:"student"};
}
export async function register({full_name,email,password}) {
  await post("/auth/register",{name:full_name,email,password});
}
