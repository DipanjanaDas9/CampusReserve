
import { useEffect, useState } from "react";
import {
  Bell,
  CalendarCheck,
  CalendarX,
  Clock,
  Info,
} from "lucide-react";

import { StudentLayout } from "../layouts/StudentLayout";
import { cn } from "../lib/utils";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../api/notifications";

const ICONS = {
  confirmed: CalendarCheck,
  reminder: Clock,
  cancelled: CalendarX,
  system: Info,
};

const TONES = {
  confirmed: "bg-success/15 text-success",
  reminder: "bg-primary/15 text-primary",
  cancelled: "bg-destructive/15 text-destructive",
  system: "bg-muted text-muted-foreground",
};

function formatNotificationTime(timestamp) {
  // SQLite CURRENT_TIMESTAMP returns UTC without a timezone suffix.
  const utcTimestamp = timestamp.includes("T")
    ? timestamp
    : timestamp.replace(" ", "T") + "Z";

  return new Date(utcTimestamp).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function NotificationsPage() {
  const [notes, setNotes] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await getNotifications();

        if (active) {
          setNotes(data);
        }
      } catch (err) {
        if (active) {
          setError(err.message || "Could not load notifications.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const unread = notes.filter((n) => !n.read).length;

  const shown =
    filter === "all"
      ? notes
      : notes.filter((n) => !n.read);

  async function handleRead(id) {
    const notification = notes.find((n) => n.id === id);

    if (!notification || notification.read) return;

    setError("");

    try {
      await markNotificationRead(id);

      setNotes((current) =>
        current.map((n) =>
          n.id === id ? { ...n, read: true } : n
        )
      );
    } catch (err) {
      setError(err.message || "Could not mark notification as read.");
    }
  }

  async function handleReadAll() {
    if (busy || unread === 0) return;

    setBusy(true);
    setError("");

    try {
      await markAllNotificationsRead();

      setNotes((current) =>
        current.map((n) => ({ ...n, read: true }))
      );
    } catch (err) {
      setError(err.message || "Could not mark notifications as read.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StudentLayout active="notifications">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              {unread} unread notification{unread === 1 ? "" : "s"}
            </p>
          </div>

          <button
            type="button"
            onClick={handleReadAll}
            disabled={unread === 0 || busy}
            className="text-sm font-medium text-primary disabled:opacity-40"
          >
            {busy ? "Updating..." : "Mark all as read"}
          </button>
        </div>

        {error && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mb-4 inline-flex rounded-lg bg-secondary p-1">
          {["all", "unread"].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium capitalize",
                filter === f
                  ? "bg-card shadow-card"
                  : "text-muted-foreground"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border bg-card shadow-card">
          {loading ? (
            <div className="py-16 text-center text-muted-foreground">
              Loading notifications...
            </div>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <Bell className="h-8 w-8" />
              You're all caught up.
            </div>
          ) : (
            shown.map((n) => {
              const Icon = ICONS[n.kind] || Info;

              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleRead(n.id)}
                  className={cn(
                    "flex w-full items-start gap-4 border-b px-5 py-4 text-left last:border-b-0",
                    !n.read && "bg-accent/50"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                      TONES[n.kind] || TONES.system
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{n.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatNotificationTime(n.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {n.body}
                    </p>
                  </div>

                  {!n.read && (
                    <span className="mt-2 h-2.5 w-2.5 rounded-full bg-primary" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </StudentLayout>
  );
}
