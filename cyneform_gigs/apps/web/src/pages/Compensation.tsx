import type {
  CompensationStructure,
  CompensationSummary,
  DealPage,
  RolloverItem,
} from "@cyneform/types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DealBreakdown } from "../components/DealBreakdown";
import { Badge, Button, Card } from "../components/ui";
import { api, messageOf } from "../lib/api";

const k = (n: number) => `${n.toLocaleString("en-KE", { maximumFractionDigits: 2 })} KES`;
const day = (s: string) => new Date(s).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" });

export function Compensation() {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const summary = useQuery({
    queryKey: ["compensation", "summary"],
    queryFn: () => api<CompensationSummary>("/compensation/summary"),
  });
  const deals = useQuery({
    queryKey: ["compensation", "deals", page],
    queryFn: () => api<DealPage>(`/compensation/deals?page=${page}`),
    placeholderData: keepPreviousData,
  });
  const rollover = useQuery({
    queryKey: ["compensation", "rollover"],
    queryFn: () => api<RolloverItem[]>("/compensation/rollover"),
  });
  const structure = useQuery({
    queryKey: ["compensation", "structure"],
    queryFn: () => api<CompensationStructure>("/compensation/structure"),
  });
  const s = summary.data;
  const pages = Math.max(1, Math.ceil((deals.data?.total ?? 0) / (deals.data?.pageSize ?? 25)));

  if (!s)
    return (
      <p className="text-sm text-slate-500">
        {summary.isError ? messageOf(summary.error) : "Loading..."}
      </p>
    );
  const stat = (label: string, value: string, note?: string) => (
    <Card>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
      {note && <p className="text-xs text-slate-500">{note}</p>}
    </Card>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">My compensation</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stat("Paid to date", k(s.lifetimePaid))}
        {stat("Awaiting payout", k(s.pendingPayout))}
        {stat(
          "Rollover balance",
          k(s.rolloverBalance),
          s.rolloverExpiringSoon > 0
            ? `${k(s.rolloverExpiringSoon)} expires within 7 days`
            : undefined,
        )}
        {stat("Active points", String(s.activePoints))}
        {stat(
          `Revenue this month (${s.month})`,
          k(s.monthRevenue),
          `Tier ${s.tier}, ${s.rate}%${s.nextTierAt ? `. Next tier above ${k(s.nextTierAt)}` : ""}`,
        )}
        {stat("Revenue cap", `${s.capRate}%`, `Phase ${s.capPhase}`)}
      </div>

      <Card>
        <h2 className="font-semibold">Deals</h2>
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {deals.data?.items.map((d) => (
            <li key={d.id} className="py-2">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                onClick={() => setOpen(open === d.id ? null : d.id)}
              >
                <span>
                  <b>{d.dealName}</b>
                  <span className="block text-xs text-slate-500">
                    {day(d.closedAt)} · project {k(d.dealValue)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <b>{k(d.finalPayout)}</b>
                  <Badge value={d.paymentStatus} />
                  {d.clientPaymentStatus === "not_paid" && <Badge value="client unpaid" />}
                </span>
              </button>
              {open === d.id && <DealBreakdown d={d} />}
            </li>
          ))}
          {deals.data?.items.length === 0 && (
            <li className="py-6 text-center text-slate-500">No closed deals yet.</li>
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

      <Card>
        <h2 className="font-semibold">Rollover</h2>
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {rollover.data?.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2">
              <span>
                {k(r.rolloverAmount)}{" "}
                <span className="text-xs text-slate-500">
                  from {day(r.createdAt)}, expires {day(r.expiresAt)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {r.status === "active" && <b>{k(r.remainingBalance)} left</b>}
                <Badge value={r.status} />
              </span>
            </li>
          ))}
          {rollover.data?.length === 0 && <li className="py-4 text-slate-500">No rollover.</li>}
        </ul>
      </Card>

      {structure.data && (
        <Card>
          <h2 className="font-semibold">How it works</h2>
          <p className="mt-1 text-sm text-slate-500">
            Commission rate by your revenue this month. A point is worth{" "}
            {k(structure.data.kesPerPoint)}. Rollover lasts {structure.data.rolloverDays} days.
          </p>
          <ul className="mt-2 text-sm">
            {structure.data.tiers.map((t) => (
              <li key={t.tier}>
                Tier {t.tier}: {k(t.from)}
                {t.to ? ` to ${k(t.to)}` : " and above"} earns {t.rate}%
              </li>
            ))}
          </ul>
          <ul className="mt-2 text-sm">
            {structure.data.caps.map((c) => (
              <li key={c.phase}>
                Cap phase {c.phase}: {c.rate}% of the project. {c.note}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
