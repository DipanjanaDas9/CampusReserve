import { useEffect, useState } from "react";
import { Bell, CalendarCheck, CalendarX, CheckCircle2, Clock, Info, XCircle } from "lucide-react";
import { StudentLayout } from "../layouts/StudentLayout";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../api/notifications";
import { timeAgo } from "../lib/format";
import { cn } from "../lib/utils";
import { ErrorMessage, Loading, PageHeader } from "../components/ui";

const ICONS = { submitted: Clock, approved: CalendarCheck, rejected: XCircle, cancelled: CalendarX, checked_in: CheckCircle2, system: Info };
const TONES = {
  submitted: "bg-primary/15 text-primary",
  approved: "bg-success/15 text-success-strong",
  rejected: "bg-destructive/10 text-destructive-strong",
  cancelled: "bg-destructive/10 text-destructive-strong",
  checked_in: "bg-success/15 text-success-strong",
  system: "bg-muted text-muted-foreground",
};

export function NotificationsPage() {
  const [notes, setNotes] = useState(null);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  function load() {
    listNotifications().then(setNotes).catch((e) => setError(e.message));
  }
  useEffect(load, []);
  function retry() {
    setError("");
    load();
  }

  async function markRead(n) {
    if (n.read) return;
    setNotes((ns) => ns.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    markNotificationRead(n.id).catch((e) => setError(e.message));
  }

  async function markAll() {
    setNotes((ns) => ns.map((n) => ({ ...n, read: true })));
    markAllNotificationsRead().catch((e) => setError(e.message));
  }

  const unread = (notes || []).filter((n) => !n.read).length;
  const shown = filter === "all" ? notes || [] : (notes || []).filter((n) => !n.read);

  return (
    <StudentLayout active="notifications">
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Notifications" subtitle={`${unread} unread`}>
          <button type="button" onClick={markAll} disabled={unread === 0} className="text-sm font-medium text-primary disabled:opacity-40">
            Mark all as read
          </button>
        </PageHeader>

        <div role="tablist" aria-label="Notification filter" className="mb-4 inline-flex rounded-lg bg-secondary p-1">
          {["all", "unread"].map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn("rounded-md px-4 py-1.5 text-sm font-medium capitalize", filter === f ? "bg-card shadow-card" : "text-muted-foreground")}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="mb-3">
          <ErrorMessage onRetry={notes ? undefined : retry}>{error}</ErrorMessage>
        </div>
        {!notes && !error && <Loading />}
        {notes && (
          <div className="overflow-hidden rounded-xl border bg-card shadow-card">
            {shown.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                <Bell className="h-8 w-8" aria-hidden="true" />
                You're all caught up.
              </div>
            ) : (
              shown.map((n) => {
                const Icon = ICONS[n.kind] || Info;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => markRead(n)}
                    className={cn("flex w-full items-start gap-4 border-b px-5 py-4 text-left last:border-b-0", !n.read && "bg-accent/50")}
                  >
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", TONES[n.kind])}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{n.title}</span>
                        <span className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{n.body}</p>
                    </div>
                    {!n.read && <span className="mt-2 h-2.5 w-2.5 rounded-full bg-primary" aria-label="Unread" />}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
