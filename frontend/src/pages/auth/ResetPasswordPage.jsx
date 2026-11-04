import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthLayout } from "../../layouts/AuthLayout";
import { resetPassword, validateResetToken } from "../../api/auth";

export function ResetPasswordPage() {
  const [token] = useState(
    () => new URLSearchParams(window.location.search).get("token") || ""
  );

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [linkStatus, setLinkStatus] = useState("checking");

  // Remove the reset token from the visible URL.
  useEffect(() => {
    if (!token) return;

    const url = new URL(window.location.href);
    url.searchParams.delete("token");

    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash
    );
  }, [token]);

  // Check whether the reset link is still valid.
  useEffect(() => {
    if (!token) {
      setLinkStatus("invalid");
      return;
    }

    let active = true;

    validateResetToken(token)
      .then((response) => {
        if (active) {
          setLinkStatus(response.valid ? "valid" : "invalid");
        }
      })
      .catch(() => {
        if (active) {
          setLinkStatus("error");
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  async function onSubmit(event) {
    event.preventDefault();
    setError("");

    if (!token || linkStatus !== "valid") {
      setError("Please request a new password reset link.");
      return;
    }

    if (password.length < 8 || password.length > 128) {
      setError("Password must contain between 8 and 128 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await resetPassword(token, password);

      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === "Invalid or expired password reset link."
      ) {
        setLinkStatus("invalid");
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to reset password."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
        <h1 className="font-display text-2xl font-bold text-foreground">
          Reset Password
        </h1>

        {linkStatus === "checking" ? (
          <p
            role="status"
            className="mt-5 text-sm text-muted-foreground"
          >
            Checking your password reset link...
          </p>
        ) : linkStatus === "invalid" ? (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          >
            This password reset link has expired or has already
            been used. Please request a new link.
          </div>
        ) : linkStatus === "error" ? (
          <div
            role="alert"
            className="mt-5 text-sm text-destructive"
          >
            Unable to verify this reset link.
            Please try again or request a new link.
          </div>
        ) : success ? (
          <div
            role="status"
            className="mt-5 rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm text-foreground"
          >
            Password updated successfully!
            You can now sign in with your new password.
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose a new password for your CampusReserve account.
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="new-password"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  New Password
                </label>

                <input
                  id="new-password"
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  Confirm New Password
                </label>

                <input
                  id="confirm-password"
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
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
                {loading ? "Updating Password..." : "Reset Password"}
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-sm">
          <Link
            to={
              success || linkStatus === "valid"
                ? "/login"
                : "/forgot-password"
            }
            className="font-semibold text-primary hover:underline"
          >
            {success || linkStatus === "valid"
              ? "Back to Login"
              : "Request a New Link"}
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
