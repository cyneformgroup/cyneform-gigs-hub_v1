import type { BdpOption, DealPage } from "@cyneform/types";
import { PAYMENT_STATUSES } from "@cyneform/validators";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DealBreakdown } from "../components/DealBreakdown";
import { Alert, Badge, Button, Card } from "../components/ui";
import { api, messageOf } from "../lib/api";
import { useAuth } from "../lib/auth";

const k = (n: number) => `${n.toLocaleString("en-KE", { maximumFractionDigits: 2 })} KES`;
const sel = "rounded border border-slate-300 px-2 py-2 text-sm";

export function CompensationAdmin() {
  const { can } = useAuth();
  const manage = can("compensation.manage");
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const qs = new URLSearchParams({
    page: String(page),
    ...(status ? { paymentStatus: status } : {}),
    ...(userId ? { userId } : {}),
  }).toString();
  const deals = useQuery({
    queryKey: ["comp-admin", qs],
    queryFn: () => api<DealPage>(`/compensation/admin/deals?${qs}`),
    placeholderData: keepPreviousData,
  });
  const bdps = useQuery({
    queryKey: ["points-bdps"],
    queryFn: () => api<BdpOption[]>("/points/bdps"),
    enabled: can("points.view_all"),
  });

  const act = useMutation({
    mutationFn: (v: { path: string; body?: unknown; ok: string }) =>
      api<void>(`/compensation/${v.path}`, { method: "POST", body: v.body ?? {} }).then(() => v.ok),
    onSuccess: (ok) => {
      setMsg({ tone: "success", text: ok });
      queryClient.invalidateQueries({ queryKey: ["comp-admin"] });
    },
    onError: (e) => setMsg({ tone: "error", text: messageOf(e) }),
  });
  const elite = useMutation({
    mutationFn: (b: { userId: string; elite: boolean; reason: string }) =>
      api<void>("/compensation/elite", { method: "POST", body: b }),
    onSuccess: () => setMsg({ tone: "success", text: "Cap phase updated." }),
    onError: (e) => setMsg({ tone: "error", text: messageOf(e) }),
  });
  const pages = Math.max(1, Math.ceil((deals.data?.total ?? 0) / (deals.data?.pageSize ?? 25)));

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Compensation</h1>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Card>
        <div className="flex flex-wrap gap-2">
          <select
            className={sel}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All payouts</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className={sel}
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All BDPs</option>
            {bdps.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.fullName}
              </option>
            ))}
          </select>
        </div>
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {deals.data?.items.map((d) => (
            <li key={d.id} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-left"
                  onClick={() => setOpen(open === d.id ? null : d.id)}
                >
                  <b>{d.ownerName ?? "BDP"}</b> · {d.dealName}
                  <span className="block text-xs text-slate-500">
                    project {k(d.dealValue)} · payout {k(d.finalPayout)} · tier {d.tier}
                  </span>
                </button>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge value={d.paymentStatus} />
                  <Badge
                    value={d.clientPaymentStatus === "fully_paid" ? "client paid" : "client unpaid"}
                  />
                  {manage && d.clientPaymentStatus === "not_paid" && (
                    <Button
                      onClick={() =>
                        act.mutate({ path: `${d.id}/client-paid`, ok: "Client marked as paid." })
                      }
                    >
                      Client paid
                    </Button>
                  )}
                  {manage && d.paymentStatus === "pending" && (
                    <Button
                      onClick={() =>
                        act.mutate({ path: `${d.id}/approve`, ok: "Payout approved." })
                      }
                    >
                      Approve
                    </Button>
                  )}
                  {manage && d.paymentStatus === "approved" && (
                    <Button
                      onClick={() => {
                        const ref = window.prompt("Payment reference (e.g. M-Pesa code)");
                        if (ref)
                          act.mutate({
                            path: `${d.id}/pay`,
                            body: { reference: ref },
                            ok: "Marked as paid.",
                          });
                      }}
                    >
                      Mark paid
                    </Button>
                  )}
                </span>
              </div>
              {open === d.id && <DealBreakdown d={d} />}
            </li>
          ))}
          {deals.data?.items.length === 0 && (
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

      {manage && (
        <Card>
          <h2 className="font-semibold">Elite cap (phase 3)</h2>
          <p className="text-sm text-slate-500">
            Elite performers get the highest revenue cap. Choose a BDP and switch it on or off.
          </p>
          <form
            className="mt-3 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              elite.mutate({
                userId: String(f.get("userId")),
                elite: f.get("elite") === "on",
                reason: String(f.get("reason") ?? ""),
              });
            }}
          >
            <select name="userId" required className={sel}>
              <option value="">Select a BDP</option>
              {bdps.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.fullName}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" name="elite" /> Elite
            </label>
            <input name="reason" required placeholder="Reason" className={sel} />
            <Button type="submit" disabled={elite.isPending}>
              Save
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
