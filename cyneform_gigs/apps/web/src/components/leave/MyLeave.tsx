import type { CreateLeaveInput, LeaveRequest } from "@cyneform/types";
import { CreateLeaveSchema } from "@cyneform/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { ApiError, api, messageOf } from "../../lib/api";
import { readForm } from "../../lib/form";
import { Alert, Badge, Button, Card, Field } from "../ui";

export function MyLeave() {
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["leave"] });

  const list = useQuery({
    queryKey: ["leave", "mine"],
    queryFn: () => api<LeaveRequest[]>("/leave/mine"),
  });
  const todayEAT = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });

  const create = useMutation({
    mutationFn: (body: CreateLeaveInput) => api<LeaveRequest>("/leave", { method: "POST", body }),
    onSuccess: refresh,
    onError: (err) => {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api<LeaveRequest>(`/leave/${id}/cancel`, { method: "POST" }),
    onSuccess: refresh,
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const result = readForm(form, CreateLeaveSchema);
    if (result.ok === false) return setErrors(result.errors);
    setErrors({});
    create.mutate(result.data, { onSuccess: () => form.reset() });
  }

  const serverError =
    create.error && !(create.error instanceof ApiError && create.error.fields)
      ? create.error
      : null;

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">My leave</h2>
      <Card>
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          {serverError && (
            <div className="sm:col-span-2">
              <Alert tone="error">{messageOf(serverError)}</Alert>
            </div>
          )}
          {create.isSuccess && (
            <div className="sm:col-span-2">
              <Alert tone="success">Request sent. You will see the decision here.</Alert>
            </div>
          )}
          <Field label="From" name="startDate" type="date" error={errors.startDate} />
          <Field label="To" name="endDate" type="date" error={errors.endDate} />
          <div className="sm:col-span-2">
            <Field label="Reason" name="reason" error={errors.reason} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Sending…" : "Request leave"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="mt-4 p-0">
        {cancel.error && (
          <div className="p-4">
            <Alert tone="error">{messageOf(cancel.error)}</Alert>
          </div>
        )}
        <ul className="divide-y divide-slate-100">
          {list.data?.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-4 p-4 text-sm">
              <div>
                <p className="font-medium">
                  {r.startDate} → {r.endDate}{" "}
                  <span className="font-normal text-slate-500">
                    ({r.days} {r.days === 1 ? "day" : "days"})
                  </span>
                </p>
                <p className="text-slate-600">{r.reason}</p>
                {r.decisionNote && (
                  <p className="mt-1 text-slate-500">
                    Note from {r.decidedByName}: {r.decisionNote}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge value={r.status} />
                {(r.status === "pending" ||
                  (r.status === "approved" && r.startDate > todayEAT)) && (
                  <Button
                    variant="secondary"
                    onClick={() => cancel.mutate(r.id)}
                    disabled={cancel.isPending}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </li>
          ))}
          {list.data?.length === 0 && (
            <li className="p-6 text-center text-sm text-slate-500">No leave requests yet.</li>
          )}
        </ul>
      </Card>
    </section>
  );
}
