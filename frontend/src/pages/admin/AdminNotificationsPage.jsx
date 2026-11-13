
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCheck,
  Check,
  RefreshCw,
  CalendarDays,
} from "lucide-react";
import { AdminLayout } from "../../layouts/AdminLayout";

const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function formatDate(value) {
  if (!value) return "Unknown date";

  // SQLite CURRENT_TIMESTAMP is stored in UTC.
  const normalized = value.includes("T")
    ? value
    : value.replace(" ", "T") + "Z";

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadNotifications = useCallback(async (signal) => {
    const token = sessionStorage.getItem("access_token");

    if (!token) {
      throw new Error("Please log in as an administrator.");
    }

    const response = await fetch(`${API_BASE_URL}/notifications`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal,
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Session expired. Please log in again.");
      }
      if (response.status === 403) {
        throw new Error("Access denied.");
      }
      throw new Error("Unable to load notifications.");
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("Unexpected response from the server.");
    }

    return data;
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      setActionError("");

      try {
        const data = await loadNotifications(controller.signal);

        if (!controller.signal.aborted) {
          setNotifications(data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    load();

    return () => controller.abort();
  }, [loadNotifications, refreshKey]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications]
  );

  async function authenticatedPatch(path) {
    const token = sessionStorage.getItem("access_token");

    if (!token) {
      throw new Error("Please log in as an administrator.");
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        response.status === 401
          ? "Session expired. Please log in again."
          : "Unable to update notifications."
      );
    }
  }

  async function markAsRead(notificationId) {
    setBusyId(notificationId);
    setActionError("");

    try {
      await authenticatedPatch(
        `/notifications/${notificationId}/read`
      );

      setNotifications((previous) =>
        previous.map((item) =>
          item.id === notificationId
            ? { ...item, read: true, is_read: 1 }
            : item
        )
      );
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function markAllAsRead() {
    setMarkingAll(true);
    setActionError("");

    try {
      await authenticatedPatch("/notifications/read-all");

      setNotifications((previous) =>
        previous.map((item) => ({
          ...item,
          read: true,
          is_read: 1,
        }))
      );
    } catch (err) {
      setActionError(err.message);
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <AdminLayout active="notifications">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Admin Notifications
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Stay updated on reservation requests and cancellations.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRefreshKey((key) => key + 1)}
              disabled={loading || markingAll || busyId !== null}
              className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>

            <button
              type="button"
              onClick={markAllAsRead}
              disabled={
                loading ||
                markingAll ||
                busyId !== null ||
                unreadCount === 0
              }
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              <CheckCheck className="h-4 w-4" />
              {markingAll ? "Updating..." : "Mark all as read"}
            </button>
          </div>
        </div>

        {!loading && !error && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-5 shadow-card">
              <p className="text-sm text-muted-foreground">
                Total Notifications
              </p>
              <p className="mt-2 text-3xl font-bold text-foreground">
                {notifications.length}
              </p>
            </div>

            <div className="rounded-xl border bg-card p-5 shadow-card">
              <p className="text-sm text-muted-foreground">
                Unread
              </p>
              <p className="mt-2 text-3xl font-bold text-foreground">
                {unreadCount}
              </p>
            </div>

            <div className="rounded-xl border bg-card p-5 shadow-card">
              <p className="text-sm text-muted-foreground">
                Read
              </p>
              <p className="mt-2 text-3xl font-bold text-foreground">
                {notifications.length - unreadCount}
              </p>
            </div>
          </div>
        )}

        {(error || actionError) && (
          <div
            role="alert"
            className="rounded-lg border border-destructive p-4 text-sm text-destructive"
          >
            {error || actionError}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border bg-card shadow-card">
          <div className="flex items-center justify-between border-b p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Bell className="h-5 w-5" />
              Notification History
            </h2>

            {!loading && !error && unreadCount > 0 && (
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                {unreadCount} unread
              </span>
            )}
          </div>

          {loading ? (
            <p className="p-10 text-center text-muted-foreground">
              Loading notifications...
            </p>
          ) : error ? null : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <Bell className="h-9 w-9 text-muted-foreground" />
              <p className="font-medium text-foreground">
                No notifications yet
              </p>
              <p className="text-sm text-muted-foreground">
                New reservation requests and cancellations will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`flex items-start gap-4 p-5 ${
                    !notification.read ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="rounded-full bg-muted p-3">
                    <CalendarDays className="h-5 w-5 text-foreground" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-foreground">
                        {notification.title}
                      </h3>

                      {!notification.read && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                          New
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {notification.body}
                    </p>

                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatDate(notification.created_at)}
                      {notification.reservation_id != null &&
                        ` · Reservation #${notification.reservation_id}`}
                    </p>
                  </div>

                  {!notification.read && (
                    <button
                      type="button"
                      title="Mark as read"
                      aria-label={`Mark notification ${notification.id} as read`}
                      disabled={busyId !== null || markingAll}
                      onClick={() => markAsRead(notification.id)}
                      className="rounded-lg border p-2 text-foreground hover:bg-muted disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
