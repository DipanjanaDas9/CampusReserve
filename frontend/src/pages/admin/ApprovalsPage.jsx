import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, Check, ClipboardCheck, Clock, Mail, Users, X } from "lucide-react";
import { AdminLayout } from "../../layouts/AdminLayout";
import { approveReservation, listAdminReservations, rejectReservation } from "../../api/admin";
import { fmtDate, fmtRange } from "../../lib/format";
import { cn } from "../../lib/utils";
import { EmptyState, ErrorMessage, Loading, PageHeader, StatusBadge, inputClass, primaryButton, secondaryButton } from "../../components/ui";

const STATUSES = ["pending", "approved", "rejected", "cancelled"];

export function ApprovalsPage() {
  const [params, setParams] = useSearchParams();
  const status = STATUSES.includes(params.get("status")) ? params.get("status") : "pending";
  const [loaded, setLoaded] = useState({ status: null, items: null });
  const items = loaded.status === status ? loaded.items : null;
  const setItems = (update) => setLoaded((l) => ({ ...l, items: update(l.items) }));
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    listAdminReservations(status)
      .then((list) => setLoaded({ status, items: list }))
      .catch((e) => setError(e.message));
  }, [status]);

  async function decide(r, action) {
    setBusyId(r.id);
    setError("");
    try {
      if (action === "approve") await approveReservation(r.id);
      else await rejectReservation(r.id, reason.trim());
      setItems((xs) => xs.filter((x) => x.id !== r.id));
      setRejecting(null);
      setReason("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminLayout active="approvals">
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Reservation Approvals" subtitle="Approve or decline student reservation requests" />

        <div role="tablist" aria-label="Status filter" className="mb-4 inline-flex flex-wrap rounded-lg bg-secondary p-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={status === s}
              onClick={() => {
                setError("");
                setParams({ status: s });
              }}
              className={cn("rounded-md px-4 py-1.5 text-sm font-medium capitalize", status === s ? "bg-card shadow-card" : "text-muted-foreground")}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="mb-3">
          <ErrorMessage>{error}</ErrorMessage>
        </div>
        {!items && !error && <Loading />}
        {items?.length === 0 && <EmptyState icon={ClipboardCheck}>No {status} reservations.</EmptyState>}

        <div className="space-y-3">
          {items?.map((r) => (
            <article key={r.id} className="rounded-xl border bg-card p-5 shadow-card">
              <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{r.room.name}</h2>
                    <StatusBadge status={r.status} />
                    {r.is_no_show && <span className="text-xs font-medium text-destructive-strong">No-show</span>}
                    {r.checked_in_at && <span className="text-xs font-medium text-success-strong">Checked in</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" aria-hidden="true" />{fmtDate(r.date)}</span>
                    <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden="true" />{fmtRange(r)}</span>
                    <span className="flex items-center gap-1.5"><Users className="h-4 w-4" aria-hidden="true" />{r.attendees} people</span>
                    <span className="flex items-center gap-1.5"><Mail className="h-4 w-4" aria-hidden="true" />{r.user.name} ({r.user.email})</span>
                  </div>
                  <p className="mt-2 text-sm"><span className="font-medium">Purpose:</span> {r.purpose}</p>
                  {r.notes && <p className="text-sm text-muted-foreground"><span className="font-medium">Notes:</span> {r.notes}</p>}
                  {r.decision_reason && <p className="text-sm text-muted-foreground"><span className="font-medium">Reason:</span> {r.decision_reason}</p>}
                </div>
                {r.status === "pending" && rejecting !== r.id && (
                  <div className="flex gap-2">
                    <button type="button" className={primaryButton} disabled={busyId === r.id} onClick={() => decide(r, "approve")}>
                      <Check className="h-4 w-4" aria-hidden="true" /> Approve
                    </button>
                    <button type="button" className={secondaryButton} disabled={busyId === r.id} onClick={() => { setRejecting(r.id); setReason(""); }}>
                      <X className="h-4 w-4" aria-hidden="true" /> Decline
                    </button>
                  </div>
                )}
              </div>
              {rejecting === r.id && (
                <form className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4" onSubmit={(e) => { e.preventDefault(); decide(r, "reject"); }}>
                  <div className="min-w-64 flex-1">
                    <label htmlFor={`reason-${r.id}`} className="mb-1 block text-sm font-medium">
                      Reason shown to the student (optional)
                    </label>
                    <input id={`reason-${r.id}`} className={inputClass} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Room reserved for exams that day" autoFocus />
                  </div>
                  <button type="submit" className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50" disabled={busyId === r.id}>
                    Confirm decline
                  </button>
                  <button type="button" className={secondaryButton} onClick={() => setRejecting(null)}>
                    Back
                  </button>
                </form>
              )}
            </article>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
