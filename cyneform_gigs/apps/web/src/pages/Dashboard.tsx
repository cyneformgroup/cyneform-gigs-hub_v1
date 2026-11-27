import type { Dashboard as Data } from "@cyneform/types";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { BarChart } from "../components/BarChart";
import { Card } from "../components/ui";
import { api } from "../lib/api";

const k = (n: number) => `${n.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
const tone = {
  urgent: "border-red-300 bg-red-50 text-red-900",
  warn: "border-amber-300 bg-amber-50 text-amber-900",
  info: "border-slate-200 bg-slate-50 text-slate-800",
} as const;

export function Dashboard() {
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<Data>("/dashboard"),
    refetchInterval: 60_000,
  });
  const d = q.data;
  if (!d) return <p className="text-sm text-slate-500">Loading...</p>;
  const t = d.tiles;
  const tiles: [string, string][] = [
    ["Active BDPs", k(t.activeBdps)],
    ["Frozen BDPs", k(t.frozenBdps)],
    ["New leads today", k(t.newLeadsToday)],
    ["Outreach, 7 days", k(t.outreachWeek)],
    ["Deals this month", k(t.dealsMonth)],
    ["Revenue this month", `${k(t.revenueMonth)} KES`],
    ["Commission pending", `${k(t.commissionPending)} KES`],
    ["Points, 7 days", k(t.pointsWeek)],
  ];
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(([label, value]) => (
          <Card key={label}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>
      {d.alerts.length > 0 && (
        <div className="space-y-2">
          {d.alerts.map((a) => (
            <Link
              key={a.text}
              to={a.link}
              className={`block rounded border px-3 py-2 text-sm ${tone[a.level]}`}
            >
              {a.text}
            </Link>
          ))}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <BarChart
            label="Outreach per day (30 days)"
            data={d.series.map((s) => ({ x: s.day, y: s.outreach }))}
          />
        </Card>
        <Card>
          <BarChart
            label="Revenue closed per day, KES (30 days)"
            data={d.series.map((s) => ({ x: s.day, y: s.revenue }))}
          />
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Top performers, 30 days</h2>
          <ol className="mt-2 space-y-1 text-sm">
            {d.top.map((p, i) => (
              <li key={p.name} className="flex justify-between">
                <span>
                  {i + 1}. {p.name}
                </span>
                <span>
                  {k(p.revenue)} KES · {k(p.points)} pts
                </span>
              </li>
            ))}
            {d.top.length === 0 && <li className="text-slate-500">No closed deals yet.</li>}
          </ol>
        </Card>
        <Card>
          <h2 className="font-semibold">Recent activity</h2>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {d.feed.map((f) => (
              <li key={`${f.at}${f.action}`}>
                {new Date(f.at).toLocaleString("en-KE", {
                  timeZone: "Africa/Nairobi",
                  dateStyle: "short",
                  timeStyle: "short",
                })}{" "}
                · {f.actor ?? "System"} · {f.action}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
