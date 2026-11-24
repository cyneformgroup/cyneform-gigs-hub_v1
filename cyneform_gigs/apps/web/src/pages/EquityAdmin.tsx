import type { BdpOption, Eligibility, GrantItem, MilestoneItem, PayoutItem } from "@cyneform/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Alert, Badge, Button, Card } from "../components/ui";
import { api, messageOf } from "../lib/api";
import { useAuth } from "../lib/auth";

const k = (n: number) => `${n.toLocaleString("en-KE", { maximumFractionDigits: 2 })} KES`;
const input = "rounded border border-slate-300 px-2 py-2 text-sm";
export function EquityAdmin() {
  const { can } = useAuth();
  const client = useQueryClient();
  const [pick, setPick] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const grants = useQuery({ queryKey: ["equity"], queryFn: () => api<GrantItem[]>("/equity") });
  const milestones = useQuery({
    queryKey: ["equity-ms"],
    queryFn: () => api<MilestoneItem[]>("/equity/milestones"),
  });
  const payouts = useQuery({
    queryKey: ["equity-po"],
    queryFn: () => api<PayoutItem[]>("/equity/payouts"),
  });
  const bdps = useQuery({
    queryKey: ["points-bdps"],
    queryFn: () => api<BdpOption[]>("/points/bdps"),
    enabled: can("points.view_all"),
  });
  const eligibility = useQuery({
    queryKey: ["equity-elig", pick],
    queryFn: () => api<Eligibility>(`/equity/eligibility/${pick}`),
    enabled: !!pick,
  });
  const done = (text: string) => {
    setMessage({ tone: "success", text });
    for (const key of ["equity", "equity-ms", "equity-po"])
      client.invalidateQueries({ queryKey: [key] });
  };
  const fail = (e: unknown) => setMessage({ tone: "error", text: messageOf(e) });
  const grant = useMutation({
    mutationFn: (body: unknown) => api<void>("/equity/grant", { method: "POST", body }),
    onSuccess: () => done("Equity granted."),
    onError: fail,
  });
  const milestone = useMutation({
    mutationFn: (body: unknown) => api<void>("/equity/milestones", { method: "POST", body }),
    onSuccess: () => done("Milestone recorded and payouts created."),
    onError: fail,
  });
  const pay = useMutation({
    mutationFn: (v: { id: string; reference: string }) =>
      api<void>(`/equity/payouts/${v.id}/pay`, {
        method: "POST",
        body: { reference: v.reference },
      }),
    onSuccess: () => done("Payout marked as paid."),
    onError: fail,
  });
  function submitGrant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    grant.mutate({
      userId: pick,
      percentage: Number(form.get("percentage")),
      reason: String(form.get("reason") ?? ""),
      override: form.get("override") === "on",
    });
  }
  function submitMilestone(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    milestone.mutate({
      name: String(form.get("name") ?? ""),
      valuation: Number(form.get("valuation")),
      notes: String(form.get("notes") ?? "") || undefined,
    });
  }
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Phantom equity</h1>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Card>
        <h2 className="font-semibold">Grants</h2>
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {grants.data?.map((g) => (
            <li key={g.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span>
                <b>{g.ownerName}</b>: {g.percentage}% of appreciation
                <span className="block text-xs text-slate-500">
                  Cliff {new Date(g.cliffDate).toLocaleDateString("en-KE")} · baseline{" "}
                  {k(g.baselineValuation)}
                </span>
              </span>
              <span className="text-right">
                <b>{g.vestedPercent}% vested</b>
                <span className="block text-xs text-slate-500">
                  {g.nextMilestone
                    ? `Next milestone ${k(g.nextMilestone)}`
                    : "All milestones reached"}
                </span>
              </span>
            </li>
          ))}
          {grants.data?.length === 0 && <li className="py-4 text-slate-500">No grants yet.</li>}
        </ul>
      </Card>
      <Card>
        <h2 className="font-semibold">Check eligibility and grant</h2>
        <select className={`${input} mt-3`} value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Select a BDP</option>
          {bdps.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.fullName}
            </option>
          ))}
        </select>
        {eligibility.data && (
          <ul className="mt-3 text-sm">
            {eligibility.data.checks.map((c) => (
              <li key={c.key}>
                {c.ok ? "Yes" : "No"}: {c.label}{" "}
                <span className="text-xs text-slate-500">({c.detail})</span>
              </li>
            ))}
          </ul>
        )}
        {can("equity.manage") && pick && (
          <form onSubmit={submitGrant} className="mt-3 flex flex-wrap items-center gap-2">
            <select name="percentage" className={input}>
              <option value="10">10% standard</option>
              <option value="15">15% exceptional</option>
            </select>
            <input name="reason" required placeholder="Reason" className={input} />
            {eligibility.data && !eligibility.data.eligible && (
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="override" /> Override eligibility
              </label>
            )}
            <Button type="submit" disabled={grant.isPending}>
              Grant
            </Button>
          </form>
        )}
      </Card>
      <Card>
        <h2 className="font-semibold">Valuation milestones</h2>
        <ul className="mt-3 text-sm">
          {milestones.data?.map((m) => (
            <li key={m.id}>
              {m.name}: {k(m.valuation)}{" "}
              <span className="text-xs text-slate-500">
                ({new Date(m.reachedAt).toLocaleDateString("en-KE")})
              </span>
            </li>
          ))}
        </ul>
        {can("equity.manage") && (
          <form onSubmit={submitMilestone} className="mt-3 flex flex-wrap items-center gap-2">
            <input name="name" required placeholder="Milestone name" className={input} />
            <input
              name="valuation"
              type="number"
              required
              min="1"
              placeholder="Valuation (KES)"
              className={input}
            />
            <input name="notes" placeholder="Notes" className={input} />
            <Button type="submit" disabled={milestone.isPending}>
              Record
            </Button>
          </form>
        )}
      </Card>
      <Card>
        <h2 className="font-semibold">Payouts</h2>
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {payouts.data?.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <b>{p.ownerName}</b>: {p.milestoneName}
                <span className="block text-xs text-slate-500">
                  {p.vestedPercent}% vested at {k(p.valuation)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <b>{k(p.amount)}</b>
                <Badge value={p.status} />
                {can("compensation.manage") && p.status === "pending" && (
                  <Button
                    onClick={() => {
                      const reference = window.prompt("Payment reference");
                      if (reference) pay.mutate({ id: p.id, reference });
                    }}
                  >
                    Mark paid
                  </Button>
                )}
              </span>
            </li>
          ))}
          {payouts.data?.length === 0 && <li className="py-4 text-slate-500">No payouts yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
