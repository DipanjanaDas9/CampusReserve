// Facilities API (backend/app/routers/facilities.py). Writes require an administrator.
import { apiRequest } from "./http";

export const listFacilities = () => apiRequest("/facilities");
export const getFacility = (id) => apiRequest(`/facilities/${encodeURIComponent(id)}`);
export const createFacility = (facility) => apiRequest("/facilities", { method: "POST", body: facility });
export const updateFacility = (id, facility) => apiRequest(`/facilities/${encodeURIComponent(id)}`, { method: "PUT", body: facility });
export const deleteFacility = (id) => apiRequest(`/facilities/${encodeURIComponent(id)}`, { method: "DELETE" });
