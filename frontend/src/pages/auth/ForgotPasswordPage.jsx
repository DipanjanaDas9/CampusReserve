
import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Mail } from "lucide-react";
import { AuthLayout } from "../../layouts/AuthLayout";
import { forgotPassword } from "../../api/auth";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to process your request."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
        <h1 className="font-display text-2xl font-bold text-foreground">
          Forgot Password?
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Enter your email address to request a password reset link.
        </p>

        {sent ? (
          <div
            role="status"
            className="mt-6 rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm text-foreground"
          >
            If an account exists with that email, a password reset
            link will be sent. Please check your inbox and spam folder.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-5">
            <div>
              <label
                htmlFor="recovery-email"
                className="mb-1.5 block text-sm font-medium text-foreground"
              >
                Email Address
              </label>

              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  id="recovery-email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="yourname@university.edu"
                  className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-70"
            >
              {loading && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm">
          <Link
            to="/login"
            className="font-semibold text-primary hover:underline"
          >
            Back to Login
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
