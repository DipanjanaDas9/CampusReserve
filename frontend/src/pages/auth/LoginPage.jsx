import { useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { AlertCircle, Eye, EyeOff, Info, Loader2, Lock, Mail } from "lucide-react";
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
    const inputBase = "w-full rounded-lg border bg-background py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground transition focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary";
    return (<AuthLayout>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
        <h1 className="font-display text-2xl font-bold text-foreground">Welcome Back</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to your account to continue.</p>

        <div role="tablist" aria-label="Account type" className="mt-6 grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted p-1">
          {["student", "admin"].map((r) => (<button key={r} type="button" role="tab" aria-selected={role === r} onClick={() => { setRole(r); setNotice(null); }} className={`rounded-md py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${role === r ? "bg-primary text-primary-foreground shadow-brand" : "text-muted-foreground hover:text-foreground"}`}>
              {r === "student" ? "Student" : "Admin"}
            </button>))}
        </div>

        {notice && (<div role="status" className={`mt-5 flex items-start gap-2 rounded-lg border p-3 text-sm ${notice.kind === "info"
                ? "border-primary/30 bg-accent text-accent-foreground"
                : "border-destructive/30 bg-destructive/10 text-destructive"}`}>
            {notice.kind === "info" ? (<Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true"/>) : (<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true"/>)}
            <span>{notice.text}</span>
          </div>)}

        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-foreground">
              Email Address
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/>
              <input id="email" type="email" autoComplete="email" placeholder={role === "admin" ? "admin@university.edu" : "yourname@university.edu"} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-error" : undefined} className={`${inputBase} ${errors.email ? "border-destructive" : "border-input"}`}/>
            </div>
            <FieldError id="email-error" msg={errors.email}/>
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-foreground">
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/>
              <input id="password" type={show ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined} className={`${inputBase} pr-10 ${errors.password ? "border-destructive" : "border-input"}`}/>
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {show ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
              </button>
            </div>
            <FieldError id="password-error" msg={errors.password}/>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Session lasts until this tab closes.</span>
            <button type="button" onClick={() => setNotice({kind:"info",text:"Password reset is not supported by the current backend."})} className="text-sm font-medium text-primary hover:underline">Forgot Password?</button>
          </div>

          <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-brand transition hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-70">
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true"/>}
            {loading ? "Signing in..." : role === "admin" ? "Sign In as Admin" : "Sign In"}
          </button>
        </form>

        {role === "student" ? (<p className="mt-6 text-center text-sm text-muted-foreground">
          Don't have an account?{" "}
          <Link to="/register" className="font-semibold text-primary hover:underline">
            Register
          </Link>
        </p>) : (<p className="mt-6 text-center text-sm text-muted-foreground">
            Admin accounts are created by your campus administrator.
          </p>)}
      </div>
    </AuthLayout>);
}
export default LoginPage;
