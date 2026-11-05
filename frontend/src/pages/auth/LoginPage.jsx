import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { AlertCircle, ArrowRight, Eye, EyeOff, Info, Loader2, Lock, Mail } from "lucide-react";
import { AuthLayout } from "../../layouts/AuthLayout";
import { AuthNotConnectedError, login, ROLE_REDIRECTS } from "../../api/auth";
const schema = z.object({
    email: z
        .string()
        .trim()
        .min(1, "Email address is required.")
        .email("Please enter a valid email address.")
        .max(255),
    password: z.string().min(1, "Password is required.").max(128),
});
function FieldError({ id, msg }) {
    if (!msg)
        return null;
    return (<p id={id} className="mt-1.5 flex items-center gap-1 text-sm text-destructive" role="alert">
      <AlertCircle className="h-3.5 w-3.5" aria-hidden="true"/> {msg}
    </p>);
}
export function LoginPage() {
    const [email, setEmail] = useState("");
    const [searchParams] = useSearchParams();
    const sessionExpired = searchParams.get("reason") === "expired";
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("student");
    const [show, setShow] = useState(false);
    const [errors, setErrors] = useState({});
    const [notice, setNotice] = useState(null);
    const [loading, setLoading] = useState(false);
    async function onSubmit(e) {
        e.preventDefault();
        setNotice(null);
        const parsed = schema.safeParse({ email, password });
        if (!parsed.success) {
            const errs = {};
            for (const issue of parsed.error.issues) {
                const k = issue.path[0];
                errs[k] ??= issue.message;
            }
            setErrors(errs);
            return;
        }
        setErrors({});
        setLoading(true);
        try {
            const res = await login({ ...parsed.data, remember: false, role });
            window.location.assign(ROLE_REDIRECTS[res.role]);
        }
        catch (err) {
            if (err instanceof AuthNotConnectedError) {
                setNotice({ kind: "info", text: err.message });
            }
            else {
                setNotice({ kind: "error", text: err instanceof Error ? err.message : "Sign in failed." });
            }
        }
        finally {
            setPassword("");
            setLoading(false);
        }
    }
    const inputBase = "login-input w-full rounded-lg border bg-background py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground transition focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary";
    return (<AuthLayout variant="login" showTagline={false}>
      <div className="login-card rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
        <div className="login-heading">
          <h1 className="font-display text-2xl font-bold text-foreground">Welcome Back!</h1>
        </div>
        <p className="login-description mt-1 text-sm text-muted-foreground">Sign in to reserve, manage, and discover campus spaces.</p>
        {sessionExpired && (
          <div
            role="status"
            className="mt-5 flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm text-foreground"
          >
            <Info
              className="mt-0.5 h-5 w-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold">Session expired</p>
              <p className="mt-1 text-muted-foreground">
                Your session has expired. Please sign in again.
              </p>
            </div>
          </div>
        )}

        <div role="tablist" aria-label="Account type" className="login-role-tabs mt-6 grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted p-1">
          {["student", "admin"].map((r) => (<button key={r} type="button" role="tab" aria-selected={role === r} onClick={() => { setRole(r); setNotice(null); }} className={`login-role-tab rounded-md py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${role === r ? "is-selected bg-primary text-primary-foreground shadow-brand" : "text-muted-foreground hover:text-foreground"}`}>
              {r === "student" ? "Student" : "Admin"}
            </button>))}
        </div>

        {notice && (<div role="status" className={`mt-5 flex items-start gap-2 rounded-lg border p-3 text-sm ${notice.kind === "info"
                ? "border-primary/30 bg-accent text-accent-foreground"
                : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
            {notice.kind === "info" ? (<Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true"/>) : (<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true"/>)}
            <span>{notice.text}</span>
          </div>)}

        <form onSubmit={onSubmit} noValidate className="login-form mt-6 flex flex-col">
          <div>
            <label htmlFor="email" className="login-field-label mb-1.5 block text-sm font-medium text-foreground">
              <Mail aria-hidden="true" />
              Email Address
            </label>
            <div className="relative">
              <Mail className="login-input-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/>
              <input id="email" type="email" autoComplete="email" placeholder={role === "admin" ? "admin@university.edu" : "yourname@university.edu"} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} className={`${inputBase} ${errors.email ? "border-destructive" : "border-input"}`}/>
            </div>
            <FieldError id="email-error" msg={errors.email}/>
          </div>

          <div>
            <label htmlFor="password" className="login-field-label mb-1.5 block text-sm font-medium text-foreground">
              <Lock aria-hidden="true" />
              Password
            </label>
            <div className="relative">
              <Lock className="login-input-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/>
              <input id="password" type={show ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined} className={`${inputBase} pr-10 ${errors.password ? "border-destructive" : "border-input"}`}/>
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {show ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
              </button>
            </div>
            <FieldError id="password-error" msg={errors.password}/>
          </div>

          <div className="login-forgot-row flex items-center justify-end">
              <Link
                to="/forgot-password"
                className="text-sm font-medium text-primary hover:underline"
              >
                Forgot Password?
              </Link>
          </div>

          <button type="submit" disabled={loading} className="login-submit flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-brand transition hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-70">
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true"/>}
            {loading ? "Signing in..." : role === "admin" ? "Sign In as Admin" : "Sign In"}
            {!loading && <ArrowRight aria-hidden="true" />}
          </button>
        </form>

        {role === "student" ? (<p className="login-register mt-6 text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link to="/register" className="font-semibold text-primary hover:underline">
            Register
          </Link>
        </p>) : (<p className="login-register mt-6 text-center text-sm text-muted-foreground">
            Admin accounts are created by your campus administrator.
          </p>)}
      </div>
    </AuthLayout>);
}
export default LoginPage;
