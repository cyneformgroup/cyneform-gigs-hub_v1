import type { ZodType, z } from "zod";

export type FormResult<T> = { ok: true; data: T } | { ok: false; errors: Record<string, string> };

export function readForm<S extends ZodType>(
  form: HTMLFormElement,
  schema: S,
  extra: Record<string, unknown> = {},
): FormResult<z.output<S>> {
  const raw: Record<string, unknown> = { ...extra };
  new FormData(form).forEach((value, key) => {
    if (typeof value === "string" && value.trim() !== "") raw[key] = value;
  });
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };

  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.map(String).join(".") || "_";
    errors[key] ??= issue.message.startsWith("Invalid input")
      ? "This field is required"
      : issue.message;
  }
  return { ok: false, errors };
}
