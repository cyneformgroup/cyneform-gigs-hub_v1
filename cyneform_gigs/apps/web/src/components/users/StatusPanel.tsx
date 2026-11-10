import type {
  ChangeStatusInput,
  DeleteUserInput,
  StatusHistoryItem,
  UserDetail,
} from "@cyneform/types";
import {
  ChangeStatusSchema,
  DEACTIVATION_TYPES,
  DeleteUserSchema,
  FREEZE_REASONS,
  MANAGEABLE_STATUSES,
} from "@cyneform/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { api, messageOf } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { readForm } from "../../lib/form";
import { Alert, Badge, Button, Card, Field, SelectField } from "../ui";

const label = (s: string) => s.replace("_", " ");
const OTHER = "Other";

export function StatusPanel({ user }: { user: UserDetail }) {
  const { user: me, can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [picked, setPicked] = useState("");
  const [reasonChoice, setReasonChoice] = useState<string>(FREEZE_REASONS[0]);

  const history = useQuery({
    queryKey: ["status-history", user.id],
    queryFn: () => api<StatusHistoryItem[]>(`/users/${user.id}/status-history`),
  });

  const change = useMutation({
    mutationFn: (body: ChangeStatusInput) =>
      api<UserDetail>(`/users/${user.id}/status`, { method: "POST", body }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["user", user.id], updated);
      queryClient.invalidateQueries({ queryKey: ["status-history", user.id] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const remove = useMutation({
    mutationFn: (body: DeleteUserInput) =>
      api<void>(`/users/${user.id}`, { method: "DELETE", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      navigate("/users");
    },
  });

  const protectedUser = user.role === "super_admin" || user.id === me?.id;
  const editable = can("users.manage_status") && !protectedUser;

  // A deactivated account can only be reactivated, and not at all if it was deactivated permanently.
  const options: string[] =
    user.status === "deactivated"
      ? user.deactivationType === "permanent"
        ? []
        : ["active"]
      : MANAGEABLE_STATUSES.filter((s) => s !== user.status);
  const chosen = options.includes(picked) ? picked : (options[0] ?? "");
  const usePreset = chosen === "frozen" && reasonChoice !== OTHER;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const result = readForm(form, ChangeStatusSchema, usePreset ? { reason: reasonChoice } : {});
    if (result.ok === false) return setError(Object.values(result.errors)[0] ?? "Check the form.");
    setError(null);
    change.mutate(result.data, { onSuccess: () => form.reset() });
  }

  function onDelete(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = readForm(e.currentTarget, DeleteUserSchema);
    if (result.ok === false)
      return setDeleteError(Object.values(result.errors)[0] ?? "Check the form.");
    setDeleteError(null);
    remove.mutate(result.data);
  }

  return (
    <Card className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Account status</h2>
        <Badge value={user.status} />
      </div>
      {user.status === "deactivated" && user.deactivationType === "permanent" && (
        <p className="mt-2 text-sm text-slate-500">
          Deactivated permanently. This account cannot be reactivated.
        </p>
      )}

      {editable && options.length > 0 && (
        <form onSubmit={onSubmit} noValidate className="mt-4 grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Change to"
            name="status"
            value={chosen}
            onChange={(e) => setPicked(e.target.value)}
          >
            {options.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </SelectField>
          {chosen === "frozen" && (
            <SelectField
              label="Freeze reason"
              value={reasonChoice}
              onChange={(e) => setReasonChoice(e.target.value)}
            >
              {[...FREEZE_REASONS, OTHER].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </SelectField>
          )}
          {chosen === "deactivated" && (
            <SelectField
              label="Deactivation type"
              name="deactivationType"
              hint="Permanent cannot be undone"
            >
              {DEACTIVATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </SelectField>
          )}
          {!usePreset && (
            <Field label="Reason" name="reason" hint="Recorded in the history and audit log" />
          )}
          <div className="space-y-2 sm:col-span-2 empty:hidden">
            {(error || change.error) && (
              <Alert tone="error">{error ?? messageOf(change.error)}</Alert>
            )}
            {change.isSuccess && (
              <Alert tone="success">Status updated. Any active sessions were ended.</Alert>
            )}
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? "Saving…" : "Apply"}
            </Button>
          </div>
        </form>
      )}

      <ul className="mt-5 divide-y divide-slate-100">
        {history.data?.map((h) => (
          <li key={h.id} className="py-3 text-sm">
            <p>
              <span className="capitalize">{h.fromStatus ? label(h.fromStatus) : "New"}</span> →{" "}
              <span className="font-medium capitalize">{label(h.toStatus)}</span>
              <span className="text-slate-500">
                {" "}
                · {h.changedByName ?? "System"} · {new Date(h.createdAt).toLocaleString("en-KE")}
              </span>
            </p>
            <p className="text-slate-600">{h.reason}</p>
          </li>
        ))}
        {history.data?.length === 0 && (
          <li className="py-3 text-sm text-slate-500">No status changes yet.</li>
        )}
      </ul>

      {can("users.delete") && !protectedUser && (
        <form onSubmit={onDelete} noValidate className="mt-6 border-t border-red-100 pt-4">
          <h3 className="text-sm font-semibold text-red-700">Delete account</h3>
          <p className="mt-1 text-xs text-slate-500">
            The person is locked out immediately and hidden from the system. Personal data is
            anonymised after 30 days.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
            <Field label="Type DELETE" name="confirm" autoComplete="off" />
            <Field label="Reason" name="reason" />
            <Button type="submit" variant="danger" disabled={remove.isPending}>
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
          {(deleteError || remove.error) && (
            <div className="mt-3">
              <Alert tone="error">{deleteError ?? messageOf(remove.error)}</Alert>
            </div>
          )}
        </form>
      )}
    </Card>
  );
}
