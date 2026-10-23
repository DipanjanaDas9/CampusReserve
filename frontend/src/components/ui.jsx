import { AlertCircle, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

const STATUS_TONES = {
  pending: "bg-chart-4/25 text-foreground",
  approved: "bg-success/15 text-success-strong",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status, className }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", STATUS_TONES[status], className)}>
      {status}
    </span>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Loading({ label = "Loading…" }) {
  return (
    <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {label}
    </p>
  );
}

export function ErrorMessage({ children, onRetry }) {
  if (!children) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{children}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-semibold underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon: Icon, children }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border bg-card py-14 text-center text-muted-foreground shadow-card">
      {Icon && <Icon className="h-8 w-8" aria-hidden="true" />}
      {children}
    </div>
  );
}

export function EquipmentTags({ items }) {
  if (!items?.length) return <span className="text-xs text-muted-foreground">No listed equipment</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          {item}
        </span>
      ))}
    </div>
  );
}

export const inputClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-brand hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-md border border-input bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50";
