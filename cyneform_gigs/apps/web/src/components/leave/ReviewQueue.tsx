import type { DecideLeaveInput, LeavePage, LeaveRequest } from "@cyneform/types";
import { DecideLeaveSchema, LEAVE_STATUSES } from "@cyneform/validators";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, messageOf } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { Alert, Badge, Button, Card } from "../ui";

function ReviewRow({ request }: { request: LeaveRequest }) {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const decide = useMutation({
    mutationFn: (body: DecideLeaveInput) =>
      api<LeaveRequest>(`/leave/${request.id}/decide`, {
        method: "POST",
        body,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leave"] }),
  });

  function submit(decision: "approved" | "rejected") {
    const parsed = DecideLeaveSchema.safeParse({
      decision,
      note: note.trim() || undefined,
    });
    if (!parsed.success) return setLocalError(parsed.error.issues[0]?.message ?? "Check the form.");
    setLocalError(null);
    decide.mutate(parsed.data);
  }

  const mine = request.userId === me?.id;

  return (
    <li className="p-4 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">{request.userName}</p>
          <p>
            {request.startDate} → {request.endDate}{" "}
            <span className="text-slate-500">
              ({request.days} {request.days === 1 ? "day" : "days"})
            </span>
          </p>
          <p className="text-slate-600">{request.reason}</p>
          {request.decisionNote && (
            <p className="mt-1 text-slate-500">
              {request.decidedByName}: {request.decisionNote}
            </p>
          )}
        </div>
        <Badge value={request.status} />
      </div>

      {request.status === "pending" && (
        <div className="mt-3 space-y-2">
          {mine ? (
            <p className="text-slate-500">
              You can't decide your own request. Another Admin or the Super Admin will.
            </p>
          ) : (
            <>
              {(localError || decide.error) && (
                <Alert tone="error">{localError ?? messageOf(decide.error)}</Alert>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label="Note (required to reject)"
                  placeholder="Note (required to reject)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="min-w-0 flex-1 rounded-md px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-brand-600 focus:outline-none"
                />
                <Button onClick={() => submit("approved")} disabled={decide.isPending}>
                  Approve
                </Button>
                <Button
                  variant="danger"
                  onClick={() => submit("rejected")}
                  disabled={decide.isPending}
                >
                  Reject
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function ReviewQueue() {
  const [status, setStatus] = useState<"all" | (typeof LEAVE_STATUSES)[number]>("pending");
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ["leave", "all", status, page],
    queryFn: () =>
      api<LeavePage>(
        `/leave?${status === "all" ? "" : `status=${status}&`}page=${page}&pageSize=20`,
      ),
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Review requests</h2>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
          className="rounded-md px-2 py-1.5 text-sm capitalize ring-1 ring-slate-300"
        >
          <option value="all">All</option>
          {LEAVE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <Card className="p-0">
        {error && (
          <div className="p-4">
            <Alert tone="error">{messageOf(error)}</Alert>
          </div>
        )}
        {isLoading && <p className="p-4 text-sm text-slate-500">Loading…</p>}
        <ul className="divide-y divide-slate-100">
          {data?.items.map((r) => (
            <ReviewRow key={r.id} request={r} />
          ))}
          {data?.items.length === 0 && (
            <li className="p-6 text-center text-sm text-slate-500">
              Nothing {status === "all" ? "to review" : status} right now.
            </li>
          )}
        </ul>
        <div className="flex items-center justify-between border-t border-slate-200 p-4 text-sm text-slate-600">
          <span>{data?.total ?? 0} requests</span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span>
              Page {page} of {pages}
            </span>
            <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      </Card>
    </section>
  );
}
