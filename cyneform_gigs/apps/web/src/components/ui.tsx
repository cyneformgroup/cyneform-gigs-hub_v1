import type { ComponentProps, ReactNode } from "react";

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

const buttonStyles = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  secondary: "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        buttonStyles[variant],
        className,
      )}
    />
  );
}

const inputStyles =
  "mt-1 block w-full rounded-md border-0 px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-600 focus:outline-none";

interface FieldBase {
  label: string;
  error?: string;
  hint?: string;
}

export function Field({ label, error, hint, ...input }: ComponentProps<"input"> & FieldBase) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input {...input} className={cx(inputStyles, error && "ring-red-500")} />
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1 block text-xs text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

export function SelectField({
  label,
  error,
  hint,
  children,
  ...select
}: ComponentProps<"select"> & FieldBase) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select {...select} className={cx(inputStyles, error && "ring-red-500")}>
        {children}
      </select>
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1 block text-xs text-red-600">
          {error}
        </span>
      )}
    </label>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={cx("rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200", className)}
    />
  );
}

const alertStyles = {
  error: "bg-red-50 text-red-700 ring-red-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  info: "bg-brand-50 text-brand-700 ring-brand-100",
};

export function Alert({
  tone = "info",
  children,
}: {
  tone?: keyof typeof alertStyles;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("rounded-md px-3 py-2 text-sm ring-1", alertStyles[tone])}
    >
      {children}
    </div>
  );
}

const badgeStyles: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700",
  frozen: "bg-sky-50 text-sky-700",
  on_leave: "bg-amber-50 text-amber-700",
  deactivated: "bg-slate-100 text-slate-600",
  pending: "bg-amber-50 text-amber-700",
};

export function Badge({ value }: { value: string }) {
  return (
    <span
      className={cx(
        "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        badgeStyles[value] ?? "bg-slate-100 text-slate-700",
      )}
    >
      {value.replace("_", " ")}
    </span>
  );
}

/** Centred card used by the signed-out screens (sign-in, set password, forgot password). */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-lg font-semibold tracking-tight text-brand-700">
          CyneForm
        </p>
        <Card>
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-5 space-y-4">{children}</div>
        </Card>
      </div>
    </main>
  );
}

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {action}
    </div>
  );
}
