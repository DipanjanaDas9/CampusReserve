import { Building2 } from "lucide-react";
export function BrandLogo() {
    return (<div className="flex items-center justify-center gap-2.5">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-brand">
        <Building2 className="h-6 w-6" aria-hidden="true"/>
      </span>
      <span className="font-display text-2xl font-bold tracking-tight text-foreground">
        CampusReserve
      </span>
    </div>);
}
export function AuthLayout({ children }) {
    return (<main className="auth-bg flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <BrandLogo />
        <p className="mt-2 text-center text-sm text-muted-foreground">
          AI-Powered Campus Space &amp; Facility Reservations
        </p>
        <div className="mt-8">{children}</div>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} CampusReserve
        </p>
      </div>
    </main>);
}
