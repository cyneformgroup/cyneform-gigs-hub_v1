import type { AdminReport, BdpOption, SubmissionItem } from "@cyneform/types";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Badge, Button, Card } from "../components/ui";
import { api, apiBlob, messageOf } from "../lib/api";

const k = (n: number) => n.toLocaleString("en-KE", { maximumFractionDigits: 0 });
const iso = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
const inp = "rounded border border-slate-300 px-2 py-2 text-sm";

export function ReportsAdmin() {
  const today = new Date();
  const [from, setFrom] = useState(iso(new Date(today.getTime() - 6 * 86_400_000)));
  const [to, setTo] = useState(iso(today));
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const qs = new URLSearchParams({
    from,
    to,
    ...(picked.length ? { userIds: picked.join(",") } : {}),
  }).toString();

  const report = useQuery({
    queryKey: ["admin-report", qs],
    queryFn: () => api<AdminReport>(`/reports/admin?${qs}`),
  });
  const subs = useQuery({
    queryKey: ["report-subs"],
    queryFn: () => api<SubmissionItem[]>("/reports/submissions"),
  });
  const bdps = useQuery({
    queryKey: ["points-bdps"],
    queryFn: () => api<BdpOption[]>("/points/bdps"),
  });
  const email = useMutation({
    mutationFn: () => api<void>(`/reports/admin/email?${qs}`, { method: "POST" }),
    onSuccess: () => setMsg({ tone: "success", text: "Report emailed to you." }),
    onError: (e) => setMsg({ tone: "error", text: messageOf(e) }),
  });

  function preset(days: number) {
    setFrom(iso(new Date(today.getTime() - (days - 1) * 86_400_000)));
    setTo(iso(today));
  }
  async function pdf() {
    try {
      const blob = await apiBlob(`/reports/admin/pdf?${qs}`);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `report-${from}-${to}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setMsg({ tone: "error", text: messageOf(e) });
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Reports</h1>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Card>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={`${inp} block`}
            />
          </label>
          <label className="text-sm">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={`${inp} block`}
            />
          </label>
          <Button onClick={() => preset(1)}>Today</Button>
          <Button onClick={() => preset(7)}>7 days</Button>
          <Button onClick={() => preset(30)}>30 days</Button>
          <select
            multiple
            value={picked}
            onChange={(e) => setPicked(Array.from(e.target.selectedOptions, (o) => o.value))}
            className={`${inp} h-20`}
            title="Hold Ctrl to pick several. Empty means all BDPs."
          >
            {bdps.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.fullName}
              </option>
            ))}
          </select>
          <Button onClick={pdf}>Download PDF</Button>
          <Button onClick={() => email.mutate()} disabled={email.isPending}>
            Email me the PDF
          </Button>
        </div>
      </Card>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-1">#</th>
                <th>BDP</th>
                <th className="text-right">Outreach</th>
                <th className="text-right">Deals</th>
                <th className="text-right">Revenue</th>
                <th className="text-right">Commission</th>
                <th className="text-right">Points</th>
                <th className="text-right">Reports</th>
              </tr>
            </thead>
            <tbody>
              {report.data?.rows.map((r, i) => (
                <tr key={r.userId} className="border-t border-slate-100">
                  <td className="py-1">{i + 1}</td>
                  <td>{r.name}</td>
                  <td className="text-right">{r.outreach}</td>
                  <td className="text-right">{r.deals}</td>
                  <td className="text-right">{k(r.revenue)}</td>
                  <td className="text-right">{k(r.commission)}</td>
                  <td className="text-right">{r.points}</td>
                  <td className="text-right">{r.reports}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.data?.rows.length === 0 && (
            <p className="py-4 text-sm text-slate-500">No data for this selection.</p>
          )}
        </div>
      </Card>
      <Card>
        <h2 className="font-semibold">This week's submissions</h2>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          {subs.data?.map((s) => (
            <li key={s.userId} className="rounded bg-slate-50 px-2 py-1">
              {s.name} <Badge value={s.submitted ? (s.onTime ? "on time" : "late") : "missing"} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
