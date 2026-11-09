import type { SetOverridesInput, UserDetail } from "@cyneform/types";
import { PERMISSIONS, ROLE_DEFAULTS, SetOverridesSchema } from "@cyneform/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { Alert, Badge, Button, Card, Field, PageHeader } from "../components/ui";
import { ProfileForm } from "../components/users/ProfileForm";
import { StatusPanel } from "../components/users/StatusPanel";
import { api, messageOf } from "../lib/api";
import { useAuth } from "../lib/auth";

type Choice = "default" | "grant" | "deny";

function PermissionEditor({ user }: { user: UserDetail }) {
  const queryClient = useQueryClient();
  const [choices, setChoices] = useState<Record<string, Choice>>(
    Object.fromEntries(user.overrides.map((o) => [o.permissionCode, o.effect])),
  );
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: SetOverridesInput) =>
      api<UserDetail>(`/users/${user.id}/permissions`, { method: "PUT", body }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["user", user.id], updated);
      setReason("");
    },
  });

  function onSave() {
    const overrides = PERMISSIONS.filter(
      (p) => !p.superAdminOnly && (choices[p.code] ?? "default") !== "default",
    ).map((p) => ({
      permissionCode: p.code,
      effect: choices[p.code] as "grant" | "deny",
      reason:
        reason.trim() || user.overrides.find((o) => o.permissionCode === p.code)?.reason || "",
    }));
    const parsed = SetOverridesSchema.safeParse({ overrides });
    if (!parsed.success)
      return setLocalError("Add a short reason (at least 3 characters) for the change.");
    setLocalError(null);
    save.mutate(parsed.data);
  }

  const defaults = ROLE_DEFAULTS[user.role] as readonly string[];

  return (
    <Card className="mt-6">
      <h2 className="font-semibold">Permissions</h2>
      <p className="mt-1 text-sm text-slate-500">
        Start from the role's defaults, then grant or deny individual permissions for this person.
      </p>
      <div className="mt-4 divide-y divide-slate-100">
        {PERMISSIONS.map((p) => (
          <div key={p.code} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="font-mono text-sm">{p.code}</p>
              <p className="text-xs text-slate-500">{p.description}</p>
            </div>
            {p.superAdminOnly ? (
              <span className="text-xs text-slate-400">Super Admin only</span>
            ) : (
              <select
                aria-label={`Setting for ${p.code}`}
                value={choices[p.code] ?? "default"}
                onChange={(e) => setChoices({ ...choices, [p.code]: e.target.value as Choice })}
                className="rounded-md px-2 py-1.5 text-sm ring-1 ring-slate-300"
              >
                <option value="default">
                  Role default ({defaults.includes(p.code) ? "allowed" : "not allowed"})
                </option>
                <option value="grant">Grant</option>
                <option value="deny">Deny</option>
              </select>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        {(localError || save.error) && (
          <Alert tone="error">{localError ?? messageOf(save.error)}</Alert>
        )}
        {save.isSuccess && <Alert tone="success">Permissions updated.</Alert>}
        <Field
          label="Reason for change"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          hint="Recorded in the audit log"
        />
        <Button onClick={onSave} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save permissions"}
        </Button>
      </div>
    </Card>
  );
}

export function UserDetailPage() {
  const { id = "" } = useParams();
  const { user: me, can } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: user,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["user", id],
    queryFn: () => api<UserDetail>(`/users/${id}`),
  });

  const invite = useMutation({
    mutationFn: () => api<void>(`/users/${id}/invite`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error || !user) return <Alert tone="error">{messageOf(error)}</Alert>;

  const rows: [string, string][] = [
    ["ID", user.contractorNumber],
    ["Business email", user.businessEmail],
    ["Personal email", user.personalEmail],
    ["Phone", user.phone ?? "—"],
    ["Location", user.location ?? "—"],
    [
      "Last sign-in",
      user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("en-KE") : "Never",
    ],
  ];
  const editable = can("permissions.grant") && user.role !== "super_admin" && user.id !== me?.id;

  return (
    <>
      <Link to="/users" className="text-sm text-brand-700 hover:underline">
        ← All users
      </Link>
      <div className="mt-2">
        <PageHeader
          title={user.fullName}
          action={
            <div className="flex items-center gap-2">
              <span className="text-sm capitalize text-slate-500">
                {user.role.replace("_", " ")}
              </span>
              <Badge value={user.passwordSet ? user.status : "pending"} />
            </div>
          }
        />
      </div>

      <Card>
        <dl className="grid gap-4 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase text-slate-500">{label}</dt>
              <dd className="mt-0.5 text-sm">{value}</dd>
            </div>
          ))}
        </dl>
        {!user.passwordSet && can("users.create") && (
          <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
            {invite.isSuccess && <Alert tone="success">A new invite has been sent.</Alert>}
            {invite.error && <Alert tone="error">{messageOf(invite.error)}</Alert>}
            <Button variant="secondary" onClick={() => invite.mutate()} disabled={invite.isPending}>
              Resend invite
            </Button>
          </div>
        )}
      </Card>

      {can("users.edit") && <ProfileForm key={`profile-${user.id}`} user={user} />}
      <StatusPanel key={`status-${user.id}`} user={user} />
      {editable && <PermissionEditor key={user.id} user={user} />}
    </>
  );
}
