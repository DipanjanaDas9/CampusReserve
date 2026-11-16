import { CalendarPlus, GraduationCap, Landmark, Users } from "lucide-react";
import { Link } from "react-router-dom";
export function BrandLogo() {
    return (<div className="auth-brand flex items-center justify-center gap-3">
      <span className="auth-brand-mark flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-brand">
        <GraduationCap className="h-6 w-6" aria-hidden="true"/>
      </span>
      <span className="auth-brand-name font-display text-2xl font-bold tracking-tight text-foreground">
        <span>Campus</span><span>Reserve</span>
      </span>
    </div>);
}
export function AuthLayout({ children, showTagline = true, variant }) {
    const isLogin = variant === "login";
    const isRegister = variant === "register";
    const isAuth = isLogin || isRegister;
    return (<main className={`auth-bg auth-layout flex min-h-screen flex-col items-center justify-center px-4 py-10${isLogin ? " login-auth" : isRegister ? " register-auth" : ""}`}>
      {isAuth && (
        <header className="auth-page-topbar">
          <Link to="/login" className="auth-page-brand" aria-label="CampusReserve home">
            <BrandLogo />
          </Link>
          <Link to={isLogin ? "/register" : "/login"} className="auth-page-action">
            {isLogin ? "Create account" : "Sign in"}
          </Link>
        </header>
      )}
      <div className={`auth-shell w-full max-w-md${isLogin ? " login-auth-shell" : ""}${isRegister ? " register-auth-shell" : ""}`}>
        {!isAuth && <BrandLogo />}
        {isAuth ? (
          <section className="auth-showcase" aria-label="CampusReserve">
            <div className="auth-showcase-copy">
              <h1>{isRegister ? <>Create Your<br />Campus<span>Reserve</span><br />Account</> : <>Welcome to<br />Campus<span>Reserve</span></>}</h1>
              <p>{isRegister
                ? "Join CampusReserve to find, reserve, and make the most of campus spaces for study, meetings, and more."
                : "Find, reserve, and make the most of campus spaces for study, meetings, and events."}</p>
              <div className="auth-benefits" aria-label="CampusReserve features">
                {isRegister ? (
                  <>
                    <span><CalendarPlus aria-hidden="true" /> Reserve Spaces</span>
                    <span><Users aria-hidden="true" /> Study Together</span>
                    <span><Landmark aria-hidden="true" /> Stay Organized</span>
                  </>
                ) : (
                  <>
                    <span><CalendarPlus aria-hidden="true" /> Find &amp; Reserve Spaces</span>
                    <span><Users aria-hidden="true" /> Study, Meet &amp; Collaborate</span>
                    <span><Landmark aria-hidden="true" /> Across Campus Facilities</span>
                  </>
                )}
              </div>
            </div>
          </section>
        ) : showTagline ? (
          <p className="auth-tagline mt-2 text-center text-sm text-muted-foreground">
            AI-Powered Campus Space &amp; Facility Reservations
          </p>
        ) : null}
        <div className={isAuth ? "login-card-wrap" : "mt-8"}>{children}</div>
        {!isAuth && (
          <p className="mt-8 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} CampusReserve
          </p>
        )}
      </div>

    </main>);
}
