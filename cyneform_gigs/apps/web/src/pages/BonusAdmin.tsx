import type { BonusItem, BonusPage } from "@cyneform/types";
import { BONUS_STATUSES } from "@cyneform/validators";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Badge, Button, Card } from "../components/ui";
import { api, messageOf } from "../lib/api";
import { useAuth } from "../lib/auth";

const k = (n: number) => `${n.toLocaleString("en-KE", { maximumFractionDigits: 2 })} KES`;
export function BonusAdmin() {
  const { can } = useAuth();
  const client = useQueryClient();
  const [status, setStatus] = useState("pending_review");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const query = new URLSearchParams({
    page: String(page),
    ...(status ? { status } : {}),
  }).toString();
  const q = useQuery({
    queryKey: ["bonus", query],
    queryFn: () => api<BonusPage>(`/bonus?${query}`),
    placeholderData: keepPreviousData,
  });
  const action = useMutation({
    mutationFn: (v: { id: string; path: string; body: unknown }) =>
      api<void>(`/bonus/${v.id}/${v.path}`, { method: "POST", body: v.body }),
    onSuccess: () => {
      setMessage({ tone: "success", text: "Bonus updated." });
      client.invalidateQueries({ queryKey: ["bonus"] });
    },
    onError: (e) => setMessage({ tone: "error", text: messageOf(e) }),
  });
  function decide(item: BonusItem, decision: "authorize" | "decline" | "defer") {
    const notes = window.prompt(decision === "authorize" ? "Notes for the record" : "Reason");
    if (!notes || notes.trim().length < 3) return;
    let amount: number | undefined;
    if (decision === "authorize") {
      const answer = window.prompt(
        `Bonus amount (maximum ${k(item.maxPayout)})`,
        String(item.maxPayout),
      );
      amount = answer ? Number(answer) : undefined;
      if (!amount || Number.isNaN(amount)) return;
    }
    action.mutate({
      id: item.id,
      path: "decision",
      body: { decision, notes: notes.trim(), amount },
    });
  }
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / (q.data?.pageSize ?? 25)));
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Performance bonus</h1>
      <p className="text-sm text-slate-500">
        Candidates are checked every Thursday at 8:00 AM. Authorized bonuses are paid from rollover
        after a major invoice clears.
      </p>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <select
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          setPage(1);
        }}
        className="rounded border border-slate-300 px-2 py-2 text-sm"
      >
        <option value="">All statuses</option>
        {BONUS_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <Card>
        <ul className="divide-y divide-slate-100 text-sm">
          {q.data?.items.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span>
                <b>{b.ownerName ?? "BDP"}</b>: {b.contractsClosed} contracts in the window
                <span className="block text-xs text-slate-500">
                  Rollover {k(b.rolloverSnapshot)}, up to {k(b.maxPayout)}
                  {b.amount ? `, authorized ${k(b.amount)}` : ""}
                  {b.liquidatedAmount ? `, liquidated ${k(b.liquidatedAmount)}` : ""}
                </span>
                {b.decisionNotes && (
                  <span className="block text-xs text-slate-500">Note: {b.decisionNotes}</span>
                )}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Badge value={b.status} />
                {can("bonus.authorize") && ["pending_review", "deferred"].includes(b.status) && (
                  <>
                    <Button onClick={() => decide(b, "authorize")}>Authorize</Button>
                    <Button onClick={() => decide(b, "defer")}>Defer</Button>
                    <Button onClick={() => decide(b, "decline")}>Decline</Button>
                  </>
                )}
                {can("compensation.manage") && b.status === "liquidated" && (
                  <Button
                    onClick={() => {
                      const reference = window.prompt("Payment reference");
                      if (reference) action.mutate({ id: b.id, path: "pay", body: { reference } });
                    }}
                  >
                    Mark paid
                  </Button>
                )}
              </span>
            </li>
          ))}
          {q.data?.items.length === 0 && (
            <li className="py-6 text-center text-slate-500">Nothing here.</li>
          )}
        </ul>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span>
            Page {page} of {pages}
          </span>
          <Button disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      </Card>
    </div>
  );
}
