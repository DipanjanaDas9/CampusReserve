
import { useEffect, useMemo, useState } from "react";
import { Search, Users, GraduationCap, ShieldCheck } from "lucide-react";
import { AdminLayout } from "../../layouts/AdminLayout";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export function UsersPage() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadUsers() {
      try {
        setLoading(true);
        setError("");

        const token = sessionStorage.getItem("access_token");

        if (!token) {
          throw new Error("Please log in as an administrator.");
        }

        const response = await fetch(`${API_BASE_URL}/admin/users`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Your session has expired. Please log in again.");
          }
          if (response.status === 403) {
            throw new Error("Administrator access is required.");
          }
          throw new Error("Unable to load registered users.");
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error("Unexpected response from the server.");
        }

        setUsers(data);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadUsers();

    return () => controller.abort();
  }, []);

  const students = users.filter((user) => user.role === "student").length;
  const admins = users.filter((user) => user.role === "admin").length;

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term);

      const matchesRole =
        roleFilter === "all" || user.role === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [users, search, roleFilter]);

  function formatDate(value) {
    if (!value) return "Unknown";

    // SQLite CURRENT_TIMESTAMP is stored in UTC.
    const normalized = value.includes("T")
      ? value
      : value.replace(" ", "T") + "Z";

    const date = new Date(normalized);

    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString();
  }

  return (
    <AdminLayout active="users">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Users Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View and search registered CampusReserve users.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Total Users", value: users.length, Icon: Users },
            { label: "Students", value: students, Icon: GraduationCap },
            { label: "Administrators", value: admins, Icon: ShieldCheck },
          ].map(({ label, value, Icon }) => (
            <div
              key={label}
              className="rounded-xl border bg-card p-5 shadow-card"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {label}
                </span>
                <Icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="mt-3 text-3xl font-bold text-foreground">
                {loading ? "—" : value}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border bg-card shadow-card">
          <div className="flex flex-col gap-4 border-b p-5 sm:flex-row">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name or email"
                aria-label="Search users"
                className="w-full rounded-lg border bg-background py-2 pl-10 pr-3 text-sm text-foreground"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              aria-label="Filter users by role"
              className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="all">All roles</option>
              <option value="student">Students</option>
              <option value="admin">Administrators</option>
            </select>
          </div>

          {loading ? (
            <p className="p-8 text-center text-muted-foreground">
              Loading registered users...
            </p>
          ) : error ? (
            <p role="alert" className="p-8 text-center text-destructive">
              {error}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Email</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                    <th className="px-5 py-3 font-medium">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b last:border-0">
                      <td className="px-5 py-4 font-medium text-foreground">
                        {user.name}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">
                        {user.email}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium capitalize text-foreground">
                          {user.role}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">
                        {formatDate(user.created_at)}
                      </td>
                    </tr>
                  ))}

                  {filteredUsers.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-5 py-10 text-center text-muted-foreground"
                      >
                        No users match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
