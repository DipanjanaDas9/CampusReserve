
import { useEffect, useState } from "react";
import {
  Bell,
  CheckCheck,
  CalendarCheck,
  CalendarX,
  Clock,
  Info,
} from "lucide-react";

import { StudentLayout } from "../layouts/StudentLayout";
import { StudentPageHeader } from "../components/StudentPageHeader";
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
      <div className="student-page notifications-page mx-auto max-w-5xl">
        <StudentPageHeader eyebrow="STAY IN THE LOOP" title="Your campus updates" description="Booking decisions, reservation updates, and everything you need to know." />
        <div className="notification-summary"><span className="notification-summary-icon"><Bell size={22} /></span><div><strong>{loading ? "Checking your updates…" : unread ? `${unread} unread notification${unread === 1 ? "" : "s"}` : "You’re all caught up"}</strong><p>All your reservation updates, in one place.</p></div><button type="button" onClick={handleReadAll} disabled={unread === 0 || busy}><CheckCheck size={16} />{busy ? "Updating…" : "Mark all as read"}</button></div>
        {error && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="student-tabs" aria-label="Notification filters">
          {["all", "unread"].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium capitalize",
                filter === f
                  ? "bg-card shadow-card"
                  : "text-muted-foreground"
              )}
            >
              {f} <span className="student-tab-count">{loading ? "—" : f === "all" ? notes.length : unread}</span>
            </button>
          ))}
        </div>

        <div className="notification-list" aria-live="polite">
          {loading ? (
            <div className="student-empty" role="status">
              Loading notifications...
            </div>
          ) : shown.length === 0 ? (
            <div className="student-empty"><span className="student-empty-icon"><CheckCheck size={28} /></span><h2>{filter === "unread" ? "A clear inbox. A clear mind." : "Your updates will land here"}</h2><p>{filter === "unread" ? "You’ve read all your notifications. We’ll keep you posted." : "We’ll let you know when there’s news about your reservations."}</p></div>
          ) : (
            shown.map((n) => {
              const Icon = ICONS[n.kind] || Info;

              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleRead(n.id)}
                  aria-label={`${n.read ? "Read" : "Mark as read"}: ${n.title}`}
                  className={cn(
                    "notification-item",
                    !n.read && "is-unread"
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

                  <div className="notification-copy">
                    <div className="notification-item-heading">
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
                    <span className="notification-unread-dot" aria-label="Unread" />
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
