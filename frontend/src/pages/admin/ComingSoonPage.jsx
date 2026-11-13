import { Hammer } from "lucide-react";
import { AdminLayout } from "../../layouts/AdminLayout";

export function ComingSoonPage({ active, title }) {
  return (
    <AdminLayout active={active}>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border bg-card py-16 text-center text-muted-foreground shadow-card">
          <Hammer className="h-8 w-8" aria-hidden="true" />
          Coming soon
        </div>
      </div>
    </AdminLayout>
  );
}
