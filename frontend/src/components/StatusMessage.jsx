import { AlertCircle, Info } from "lucide-react";
import { cn } from "../lib/utils";

const TONES = {
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  info: "border-primary/30 bg-accent text-accent-foreground",
};

export function StatusMessage({ kind = "info", children, className }) {
  if (!children) return null;
  const Icon = kind === "error" ? AlertCircle : Info;
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cn("flex items-start gap-2 rounded-lg border p-3 text-sm", TONES[kind], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
