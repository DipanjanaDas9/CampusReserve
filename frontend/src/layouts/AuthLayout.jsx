import { Landmark } from "lucide-react";
export function BrandLogo() {
    return (<div className="auth-brand flex items-center justify-center gap-3">
      <span className="auth-brand-mark flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-brand">
        <Landmark className="h-6 w-6" aria-hidden="true"/>
      </span>
      <span className="auth-brand-name font-display text-2xl font-bold tracking-tight text-foreground">
        <span>Campus</span><span>Reserve</span>
      </span>
    </div>);
}
export function AuthLayout({ children, showTagline = true, variant }) {
    const isLogin = variant === "login";
    return (<main className={`auth-bg auth-layout flex min-h-screen flex-col items-center justify-center px-4 py-10${isLogin ? " login-auth" : ""}`}>
      <div className={`auth-shell w-full max-w-md${isLogin ? " login-auth-shell" : ""}`}>
        <BrandLogo />
        {showTagline && (
          <p className="auth-tagline mt-2 text-center text-sm text-muted-foreground">
            AI-Powered Campus Space &amp; Facility Reservations
          </p>
        )}
        <div className={isLogin ? "login-card-wrap mt-8" : "mt-8"}>{children}</div>
        {!isLogin && (
          <p className="mt-8 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} CampusReserve
          </p>
        )}
      </div>

    </main>);
}
