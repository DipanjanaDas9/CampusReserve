import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { AlertCircle, Check, CheckCircle2, Eye, EyeOff, Info, Loader2, Lock, Mail, User } from "lucide-react";
import { AuthLayout, BrandLogo } from "../../layouts/AuthLayout";
import { PASSWORD_MIN_LENGTH, register, RegistrationNotConnectedError } from "../../api/auth";
const PASSWORD_RULES = [
    { id: "length", label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (p) => p.length >= PASSWORD_MIN_LENGTH },
];
const schema = z
    .object({
    fullName: z.string().trim().min(1, "Full name is required.").max(100, "Full name must be under 100 characters."),
    email: z.string().trim().min(1, "Email address is required.").email("Please enter a valid email address.").max(255),
    password: z
        .string()
        .min(1, "Password is required.")
        .max(128)
        .refine((p) => PASSWORD_RULES.every((r) => r.test(p)), "Password does not meet the requirements."),
    confirm: z.string().min(1, "Please confirm your password."),
})
    .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords do not match." });
function FieldError({ id, msg }) {
    if (!msg)
        return null;
    return (<p id={id} className="mt-1.5 flex items-center gap-1 text-sm text-destructive" role="alert">
      <AlertCircle className="h-3.5 w-3.5" aria-hidden="true"/> {msg}
    </p>);
}
function InputField({ id, label, type, placeholder, autoComplete, icon, value, onChange, error, toggle, extra }) {
    const errId = `${id}-error`;
    return (<div className="register-field">
      <div className="register-input-row">
        <span className="register-field-icon" aria-hidden="true">{icon}</span>
        <div className="register-input-control">
          <label htmlFor={id} className="register-field-label">
            {label}
          </label>
          <div className="register-input-wrap">
            <input id={id} type={toggle ? (toggle.shown ? "text" : "password") : type} autoComplete={autoComplete} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={error ? errId : undefined} className={`register-input-field ${error ? "has-error" : ""} ${toggle ? "has-toggle" : ""}`}/>
            {toggle && (<button type="button" onClick={toggle.onToggle} aria-label={toggle.shown ? "Hide password" : "Show password"} className="register-password-toggle">
              {toggle.shown ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
            </button>)}
          </div>
        </div>
      </div>
      {extra}
      <FieldError id={errId} msg={error}/>
    </div>);
}
export function RegisterPage() {
    const navigate = useNavigate();
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [errors, setErrors] = useState({});
    const [notice, setNotice] = useState(null);
    const [loading, setLoading] = useState(false);
    async function onSubmit(e) {
        e.preventDefault();
        if (loading)
            return;
        setNotice(null);
        const parsed = schema.safeParse({ fullName, email, password, confirm });
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
            await register({ full_name: parsed.data.fullName, email: parsed.data.email, password: parsed.data.password });
            setNotice({ kind: "success", text: "Account created successfully! Redirecting to sign in..." });
            setPassword("");
            setConfirm("");
            setTimeout(() => navigate("/login"), 1500);
        }
        catch (err) {
            if (err instanceof RegistrationNotConnectedError) {
                setNotice({ kind: "info", text: err.message });
            }
            else {
                setNotice({ kind: "error", text: err instanceof Error ? err.message : "Registration failed." });
            }
        }
        finally {
            setLoading(false);
        }
    }
    const noticeStyles = {
        info: "border-primary/30 bg-accent text-accent-foreground",
        error: "border-destructive/30 bg-destructive/10 text-destructive",
        success: "border-primary/30 bg-accent text-accent-foreground",
    };
    return (<AuthLayout variant="register">
      <div className="register-card">
        <div className="login-card-brand"><BrandLogo /></div>
        <h1 className="register-heading">Student Registration</h1>
        <p className="register-description">Join CampusReserve in minutes</p>

        {notice && (<div role="status" className={`mt-5 flex items-start gap-2 rounded-lg border p-3 text-sm ${noticeStyles[notice.kind]}`}>
            {notice.kind === "error" ? (<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true"/>) : notice.kind === "success" ? (<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true"/>) : (<Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true"/>)}
            <span>{notice.text}</span>
          </div>)}

        <form onSubmit={onSubmit} noValidate className="register-form">
          <InputField id="fullName" label="Full Name" type="text" placeholder="Enter your full name" autoComplete="name" icon={<User className="h-4 w-4" aria-hidden="true"/>} value={fullName} onChange={setFullName} error={errors.fullName}/>
          <InputField id="email" label="University Email" type="email" placeholder="yourname@university.edu" autoComplete="email" icon={<Mail className="h-4 w-4" aria-hidden="true"/>} value={email} onChange={setEmail} error={errors.email}/>
          <InputField id="password" label="Password" type="password" placeholder="Create a password" autoComplete="new-password" icon={<Lock className="h-4 w-4" aria-hidden="true"/>} value={password} onChange={setPassword} error={errors.password} toggle={{ shown: showPw, onToggle: () => setShowPw((s) => !s) }} extra={<ul className="mt-2 space-y-1" aria-label="Password requirements">
                {PASSWORD_RULES.map((r) => {
                const ok = r.test(password);
                return (<li key={r.id} className={`flex items-center gap-1.5 text-xs ${ok ? "text-primary" : "text-muted-foreground"}`}>
                      <Check className="h-3.5 w-3.5" aria-hidden="true"/> {r.label}
                    </li>);
            })}
              </ul>}/>
          <InputField id="confirm" label="Confirm Password" type="password" placeholder="Confirm your password" autoComplete="new-password" icon={<Lock className="h-4 w-4" aria-hidden="true"/>} value={confirm} onChange={setConfirm} error={errors.confirm} toggle={{ shown: showConfirm, onToggle: () => setShowConfirm((s) => !s) }}/>

          <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-brand transition hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-70">
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true"/>}
            {loading ? "Creating account..." : "Register"}
          </button>
        </form>

        <p className="register-signin">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Sign In
          </Link>
        </p>
      </div>
    </AuthLayout>);
}
export default RegisterPage;
