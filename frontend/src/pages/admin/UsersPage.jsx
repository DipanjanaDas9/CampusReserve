import { useEffect, useState } from "react";
import { CalendarDays, GraduationCap, Search, ShieldCheck, Users } from "lucide-react";
import { apiRequest } from "../../api/http";
import { AdminBanner } from "../../components/AdminBanner";
import { AdminLayout } from "../../layouts/AdminLayout";
import { CAMPUS_TIME_ZONE } from "../../lib/datetime";
import { reservationTimestamp } from "./reportMetrics";
import "./AdminDashboardPage.css";

const number = new Intl.NumberFormat("en-US");
const registrationDate = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: CAMPUS_TIME_ZONE,
});
const roles = { student: "Student", admin: "Administrator" };

function formatRegistered(value) {
  if (!value) return "Unknown";
  const timestamp = reservationTimestamp(value.replace(" ", "T"));
  return Number.isFinite(timestamp) ? registrationDate.format(timestamp) : value;
}

function UserDirectory({ users, loading, error }) {
  return <div className="operations-table-scroll" role="region" aria-label="User directory" tabIndex={0}>
    <table className="operations-table">
      <thead><tr>
        {["Name", "Email", "Role", "Registered"].map(label => <th key={label} scope="col">{label}</th>)}
      </tr></thead>
      <tbody>
        {users.map(user => {
          const name = user.name || "Unnamed user";
          const initials = name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase() || "—";
          return <tr key={user.id}>
            <th scope="row"><span className="operations-table-person">
              <span className="operations-avatar" aria-hidden="true">{initials}</span>
              <strong>{name}</strong>
            </span></th>
            <td>{user.email || "—"}</td>
            <td><span className={`operations-badge${user.role === "admin" ? " is-admin" : ""}`}>
              {roles[user.role] || user.role || "Unknown"}
            </span></td>
            <td><span className="operations-table-item"><CalendarDays aria-hidden="true" />{formatRegistered(user.created_at)}</span></td>
          </tr>;
        })}
        {!users.length && <tr><td colSpan={4} className="operations-empty">
          {loading ? "Loading users…" : error ? "The user directory is unavailable." : "No users match these filters."}
        </td></tr>}
      </tbody>
    </table>
  </div>;
}

export function UsersPage() {
  const [users, setUsers] = useState(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest("/admin/users")
      .then(data => {
        if (!Array.isArray(data)) throw new Error("Unexpected users response.");
        if (active) setUsers(data);
      })
      .catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, []);

  const loading = !users && !error;
  const term = search.trim().toLowerCase();
  const shown = (users || []).filter(user =>
    (!roleFilter || user.role === roleFilter) &&
    (!term || [user.name, user.email].some(value => value?.toLowerCase().includes(term))));
  const cards = [
    ["Total Users", users?.length, Users],
    ["Students", users?.filter(user => user.role === "student").length, GraduationCap],
    ["Administrators", users?.filter(user => user.role === "admin").length, ShieldCheck],
  ];

  return <AdminLayout active="users">
    <div className="admin-banner-page operations-dashboard operations-users">
      <AdminBanner eyebrow="Admin • User Management" title="Manage Campus Users"
        description="Search registered CampusReserve accounts and view their roles and registration dates." />

      <section className="operations-metrics" aria-label="User overview">
        {cards.map(([label, value, Icon]) => <div key={label} className="operations-metric admin-metric-lift">
          <span className="operations-icon"><Icon aria-hidden="true" /></span>
          <div><h2>{label}</h2><strong>{value == null ? "—" : number.format(value)}</strong></div>
        </div>)}
      </section>

      <section className="operations-panel" aria-labelledby="user-directory-title">
        <header>
          <div>
            <h2 id="user-directory-title">User Directory</h2>
            {users && <p role="status">{number.format(shown.length)} of {number.format(users.length)} users</p>}
          </div>
          <div className="operations-users-filters">
            <label className="operations-filter operations-search">
              <span className="sr-only">Search users</span><Search aria-hidden="true" />
              <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name or email…" />
            </label>
            <label className="operations-filter">
              <span className="operations-filter-icon"><ShieldCheck aria-hidden="true" /></span>
              <span className="operations-filter-field">Role
                <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)}>
                  <option value="">All Roles</option>
                  <option value="student">Students</option>
                  <option value="admin">Administrators</option>
                </select>
              </span>
            </label>
          </div>
        </header>
        {error && <p className="operations-error" role="alert">{error}</p>}
        <UserDirectory users={shown} loading={loading} error={error} />
      </section>
    </div>
  </AdminLayout>;
}
