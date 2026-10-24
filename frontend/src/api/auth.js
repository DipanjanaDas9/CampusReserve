
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

export const ROLE_REDIRECTS = {
  student: "/",
  admin: "/admin",
};

export const PASSWORD_MIN_LENGTH = 8;

export class AuthNotConnectedError extends Error {}
export class RegistrationNotConnectedError extends Error {}

async function post(path, payload) {
  const res = await fetch(API_BASE_URL + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
      typeof body?.detail === "string"
        ? body.detail
        : "Request failed. Check your input and try again."
    );
  }

  return body;
}

export async function login({ email, password, role }) {
  // The backend authenticates both students and administrators.
  const data = await post("/auth/login", { email, password });

  if (!data?.access_token || !data?.user) {
    throw new Error("Invalid login response from server.");
  }

  // Never trust the selected tab to determine permissions.
  const actualRole = data.user.role;

  if (actualRole !== "student" && actualRole !== "admin") {
    throw new Error("Unknown account role.");
  }

  if (role && role !== actualRole) {
    throw new Error(
      `This account has the ${actualRole} role. Please select the correct sign-in tab.`
    );
  }

  sessionStorage.setItem("access_token", data.access_token);
  sessionStorage.setItem("campus_user", JSON.stringify(data.user));

  return {
    ...data,
    role: actualRole,
  };
}

export async function register({ full_name, email, password }) {
  await post("/auth/register", {
    name: full_name,
    email,
    password,
  });
}
