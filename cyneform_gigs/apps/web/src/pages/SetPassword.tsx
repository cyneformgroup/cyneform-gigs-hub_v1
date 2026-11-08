import { SetPasswordSchema } from "@cyneform/validators";
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { z } from "zod";
import { Alert, AuthShell, Button, Field } from "../components/ui";
import { api, messageOf } from "../lib/api";
import { readForm } from "../lib/form";

const FormSchema = SetPasswordSchema.extend({ confirm: z.string() }).refine(
  (v) => v.password === v.confirm,
  {
    path: ["confirm"],
    message: "Passwords do not match",
  },
);

export function SetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const result = readForm(e.currentTarget, FormSchema, { token });
    if (result.ok === false) return setErrors(result.errors);
    setErrors({});
    setBusy(true);
    try {
      await api<void>("/auth/set-password", {
        method: "POST",
        body: { token, password: result.data.password },
      });
      setDone(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthShell title="Password saved">
        <Alert tone="success">Your password is set. You can now sign in.</Alert>
        <Link
          to="/login"
          className="block text-center text-sm font-medium text-brand-700 hover:underline"
        >
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose your password"
      subtitle="At least 10 characters, with upper case, lower case and a number."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {!token && (
          <Alert tone="error">This link is incomplete. Open the link from your email again.</Alert>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        {errors.token && <Alert tone="error">{errors.token}</Alert>}
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          error={errors.password}
          autoFocus
        />
        <Field
          label="Confirm password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          error={errors.confirm}
        />
        <Button type="submit" className="w-full" disabled={busy || !token}>
          {busy ? "Saving…" : "Save password"}
        </Button>
      </form>
    </AuthShell>
  );
}
