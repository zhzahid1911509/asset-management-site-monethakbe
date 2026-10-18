"use client";
import { useState, useEffect } from "react";
import { ArrowRight, ShieldCheck, Leaf, Eye, EyeOff } from "lucide-react";
import { Button } from "./button";
import { createAuthClient } from "better-auth/react";
const auth = createAuthClient();
export function AuthForm() {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "reset">(
      "signin",
    ),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("token")) setMode("reset");
    else if (params.get("mode") === "signup") setMode("signup");
  }, []);
  useEffect(() => {
    setShowPassword(false);
  }, [mode]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "signup") {
        const r = await auth.signUp.email({
          name,
          email,
          password,
          callbackURL: "/auth",
        });
        if (r.error) throw new Error(r.error.message);
        setMessage("Check your email to verify your account, then sign in.");
      } else if (mode === "signin") {
        const r = await auth.signIn.email({
          email,
          password,
          callbackURL: "/auth",
        });
        if (r.error?.code === "EMAIL_NOT_VERIFIED") {
          setMessage(
            "Your email is not verified. A verification message has been queued. Check your inbox and spam folder; delivery requires the email worker.",
          );
          return;
        }
        if (r.error) throw new Error(r.error.message);
        location.assign("/app");
      } else if (mode === "forgot") {
        const r = await auth.requestPasswordReset({
          email,
          redirectTo: "/auth",
        });
        if (r.error) throw new Error(r.error.message);
        setMessage(
          "If this email has an account, a reset message will be sent.",
        );
      } else {
        const token = new URLSearchParams(location.search).get("token") ?? "";
        const r = await auth.resetPassword({ newPassword: password, token });
        if (r.error) throw new Error(r.error.message);
        history.replaceState(null, "", "/auth");
        setMode("signin");
        setPassword("");
        setMessage("Password updated. Sign in with your new password.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to continue.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <a href="/" className="brand">
          <span className="brand-mark">
            <Leaf />
          </span>
          <span>
            মনে থাকবে<small>FAMILY ASSET & RECORDS</small>
          </span>
        </a>
        <div>
          <span className="eyebrow">
            A LITTLE ORDER. A LOT OF PEACE OF MIND.
          </span>
          <h1>
            Everything you own.
            <br />
            <em>Remembered together.</em>
          </h1>
          <p>
            A thoughtful place for your family’s assets, financial records, and
            the details that matter.
          </p>
          <div className="story-list">
            <span>
              01 <b>Know what you have</b>
            </span>
            <span>
              02 <b>Keep the right people informed</b>
            </span>
            <span>
              03 <b>Make room for peace of mind</b>
            </span>
          </div>
        </div>
        <p className="muted">
          <ShieldCheck size={17} /> Private family workspaces · বাংলাদেশ
        </p>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <span className="eyebrow">YOUR FAMILY’S DIGITAL MEMORY</span>
          <h2>
            {mode === "signin"
              ? "Welcome back"
              : mode === "signup"
                ? "Create your account"
                : mode === "forgot"
                  ? "Recover your account"
                  : "Choose a new password"}
          </h2>
          <p className="muted">
            {mode === "signin"
              ? "Sign in to your family workspace."
              : "Use an email address that you can verify."}
          </p>
          <form onSubmit={submit}>
            {mode === "signup" && (
              <label>
                Your name
                <input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                Email address
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </label>
            )}
            {mode !== "forgot" && (
              <div className="password-field">
                <label htmlFor="auth-password">Password</label>
                <div className="password-control">
                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={mode === "signin" ? 1 : 12}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={
                      mode === "signin" ? "current-password" : "new-password"
                    }
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    aria-controls="auth-password"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? (
                      <EyeOff size={18} aria-hidden="true" />
                    ) : (
                      <Eye size={18} aria-hidden="true" />
                    )}
                    <span>{showPassword ? "Hide" : "Show"}</span>
                  </button>
                </div>
                {mode !== "signin" && (
                  <small>Use at least 12 characters.</small>
                )}
              </div>
            )}
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="notice">
                {message}
              </p>
            )}
            <Button disabled={busy} className="full">
              {busy
                ? "Please wait…"
                : mode === "signin"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : mode === "forgot"
                      ? "Send reset email"
                      : "Update password"}
              <ArrowRight size={17} />
            </Button>
          </form>
          <div className="auth-links">
            {mode === "signin" ? (
              <>
                <button
                  onClick={() => {
                    setMode("forgot");
                    setError("");
                  }}
                >
                  Forgot password?
                </button>
                <button
                  onClick={() => {
                    setMode("signup");
                    setError("");
                  }}
                >
                  Create an account
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setMode("signin");
                  setError("");
                }}
              >
                Back to sign in
              </button>
            )}
          </div>
          {mode === "signin" && (
            <button
              className="text-link"
              disabled={busy || !email}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await auth.sendVerificationEmail({
                    email,
                    callbackURL: "/auth",
                  });
                  if (r.error) throw new Error(r.error.message);
                  setMessage("If eligible, a verification email will be sent.");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Please retry.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Resend verification email
            </button>
          )}
          <p className="fine-print">
            Foundation release · Asset records and family access.
            <br />
            AI, document uploads and email reminders are not available yet.
          </p>
        </div>
      </section>
    </main>
  );
}
