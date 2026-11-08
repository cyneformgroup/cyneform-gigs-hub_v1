import { ForgotPasswordSchema } from "@cyneform/validators";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { Alert, AuthShell, Button, Field } from "../components/ui";
import { api, messageOf } from "../lib/api";
import { readForm } from "../lib/form";

export function ForgotPassword() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const result = readForm(e.currentTarget, ForgotPasswordSchema);
    if (result.ok === false) return setErrors(result.errors);
    setErrors({});
    setBusy(true);
    try {
      await api<void>("/auth/forgot-password", {
        method: "POST",
        body: result.data,
      });
      setSent(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email a reset link to your personal address."
    >
      {sent ? (
        <Alert tone="success">
          If that account exists, a reset link is on its way. It expires in 1 hour.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Business email" name="email" type="email" error={errors.email} autoFocus />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
      <Link to="/login" className="block text-center text-sm text-brand-700 hover:underline">
        Back to sign in
      </Link>
    </AuthShell>
  );
}
