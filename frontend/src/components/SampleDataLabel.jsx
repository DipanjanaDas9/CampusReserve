import { Info } from "lucide-react";
import { cn } from "../lib/utils";

/** Marks content that comes from src/data/* instead of the backend. */
export function SampleDataLabel({ children = "Sample data", className }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-chart-4/20 px-2.5 py-0.5 text-xs font-medium text-foreground", className)}>
      <Info className="h-3.5 w-3.5" aria-hidden="true" />
      {children}
    </span>
  );
}
