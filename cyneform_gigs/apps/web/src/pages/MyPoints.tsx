import type { MyPoints as MyPointsData } from "@cyneform/types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Button, Card } from "../components/ui";
import { api, messageOf } from "../lib/api";

export function MyPoints() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["my-points", page],
    queryFn: () => api<MyPointsData>(`/points/me?page=${page}`),
    placeholderData: keepPreviousData,
    refetchInterval: 5_000,
  });
  if (!query.data)
    return (
      <p className="text-sm text-slate-500">
        {query.isError ? messageOf(query.error) : "Loading..."}
      </p>
    );

  const data = query.data;
  const next = data.nextMilestone;
  const percent = next ? Math.min(100, (data.active / next) * 100) : 100;
  const pages = Math.max(1, Math.ceil(data.ledger.total / data.ledger.pageSize));
  const kes = (amount: number) => `${amount.toLocaleString("en-KE")} KES`;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">My points</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">Active points</p>
          <p className="text-2xl font-semibold">{data.active}</p>
          <p className="text-xs text-slate-500">{kes(data.cashValue)}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Pending verification</p>
          <p className="text-2xl font-semibold">{data.pending}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Expiring within 14 days</p>
          <p className="text-2xl font-semibold">{data.expiringSoon}</p>
        </Card>
      </div>
      <Card>
        <p className="text-sm">
          {next
            ? `${data.active} of ${next} points to your next milestone`
            : "You have passed every milestone."}
        </p>
        <div
          className="mt-2 h-2 rounded bg-slate-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={next ?? data.active}
          aria-valuenow={data.active}
        >
          <div className="h-2 rounded bg-slate-900" style={{ width: `${percent}%` }} />
        </div>
      </Card>
      <Card>
        <h2 className="font-semibold">Ledger</h2>
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {data.ledger.items.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                {entry.ruleLabel}
                {entry.leadTitle && (
                  <span className="block text-xs text-slate-500">{entry.leadTitle}</span>
                )}
                <span className="block text-xs text-slate-500">
                  Earned {new Date(entry.earnedAt).toLocaleDateString("en-KE")}
                  {entry.expiresAt &&
                    ` · expires ${new Date(entry.expiresAt).toLocaleDateString("en-KE")}`}
                </span>
              </span>
              <span className="text-right">
                <b>
                  {entry.points > 0 ? "+" : ""}
                  {entry.points}
                </b>{" "}
                <Badge value={entry.status.replaceAll("_", " ")} />
              </span>
            </li>
          ))}
          {data.ledger.items.length === 0 && (
            <li className="py-6 text-center text-slate-500">
              No points yet. Claim a gig to start earning.
            </li>
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
