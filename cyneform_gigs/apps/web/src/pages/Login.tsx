import { LoginSchema, VerifyOtpSchema } from "@cyneform/validators";
import { type FormEvent, useState } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { Alert, AuthShell, Button, Field } from "../components/ui";
import { messageOf } from "../lib/api";
import { useAuth } from "../lib/auth";
import { readForm } from "../lib/form";

export function Login() {
  const { status, startLogin, finishLogin } = useAuth();
  const location = useLocation();
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (status === "authenticated") return <Navigate to={from} replace />;

  async function onCredentials(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const result = readForm(e.currentTarget, LoginSchema);
    if (result.ok === false) return setErrors(result.errors);
    setErrors({});
    setBusy(true);
    try {
      setChallengeId(await startLogin(result.data.email, result.data.password));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function onCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const result = readForm(e.currentTarget, VerifyOtpSchema, { challengeId });
    if (result.ok === false) return setErrors(result.errors);
    setErrors({});
    setBusy(true);
    try {
      await finishLogin(result.data.challengeId, result.data.code);
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  if (challengeId) {
    return (
      <AuthShell
        title="Enter your code"
        subtitle="We emailed a 6-digit code to your business email."
      >
        <form onSubmit={onCode} className="space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <Field
            label="Code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            error={errors.code}
            autoFocus
          />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Checking…" : "Verify and sign in"}
          </Button>
          <button
            type="button"
            className="w-full text-center text-sm text-slate-500 hover:underline"
            onClick={() => setChallengeId(null)}
          >
            Start again
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Sign in" subtitle="Use your CyneForm business email.">
      <form onSubmit={onCredentials} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Field
          label="Business email"
          name="email"
          type="email"
          autoComplete="username"
          error={errors.email}
          autoFocus
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          error={errors.password}
        />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Continue"}
        </Button>
        <Link
          to="/forgot-password"
          className="block text-center text-sm text-brand-700 hover:underline"
        >
          Forgot your password?
        </Link>
      </form>
    </AuthShell>
  );
}
