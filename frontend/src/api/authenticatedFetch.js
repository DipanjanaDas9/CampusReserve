
export async function authenticatedFetch(url, options = {}) {
  const token = sessionStorage.getItem("access_token");

  if (!token) {
    window.location.replace("/login");
    throw new Error("Please sign in again.");
  }

  const headers = new Headers(options.headers);

  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // The backend rejected the JWT.
        console.log("JWT REJECTED — redirecting to login");

        sessionStorage.removeItem("access_token");
        sessionStorage.removeItem("campus_user");

        window.location.replace("/login?reason=expired");

        throw new Error(
        "Your session has expired. Please sign in again."
        );
  }

  return response;
}
