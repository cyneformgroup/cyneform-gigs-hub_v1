import type { ChangeStatusInput, StatusHistoryItem, UserDetail } from "@cyneform/types";
import { ChangeStatusSchema, MANAGEABLE_STATUSES } from "@cyneform/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { api, messageOf } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { readForm } from "../../lib/form";
import { Alert, Badge, Button, Card, Field, SelectField } from "../ui";

const label = (s: string) => s.replace("_", " ");

export function StatusPanel({ user }: { user: UserDetail }) {
  const { user: me, can } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

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

  const editable = can("users.manage_status") && user.role !== "super_admin" && user.id !== me?.id;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const result = readForm(form, ChangeStatusSchema);
    if (result.ok === false) return setError(Object.values(result.errors)[0] ?? "Check the form.");
    setError(null);
    change.mutate(result.data, { onSuccess: () => form.reset() });
  }

  return (
    <Card className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Account status</h2>
        <Badge value={user.status} />
      </div>

      {editable && (
        <form
          onSubmit={onSubmit}
          noValidate
          className="mt-4 grid gap-4 sm:grid-cols-[12rem_1fr_auto] sm:items-end"
        >
          <SelectField label="Change to" name="status">
            {MANAGEABLE_STATUSES.filter((s) => s !== user.status).map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </SelectField>
          <Field label="Reason" name="reason" hint="Recorded in the history and audit log" />
          <Button type="submit" disabled={change.isPending}>
            {change.isPending ? "Saving…" : "Apply"}
          </Button>
          <div className="space-y-2 sm:col-span-3 empty:hidden">
            {(error || change.error) && (
              <Alert tone="error">{error ?? messageOf(change.error)}</Alert>
            )}
            {change.isSuccess && (
              <Alert tone="success">Status updated. Any active sessions were ended.</Alert>
            )}
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
    </Card>
  );
}
