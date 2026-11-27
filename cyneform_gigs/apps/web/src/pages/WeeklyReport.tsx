import type { CurrentReport, ReportItem } from "@cyneform/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Alert, Badge, Button, Card } from "../components/ui";
import { api, apiBlob, messageOf } from "../lib/api";

const k = (n: number) => `${n.toLocaleString("en-KE", { maximumFractionDigits: 2 })} KES`;
const area = "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm";
const FIELDS: [string, string][] = [
  ["challenges", "Challenges faced this week"],
  ["recommendations", "Recommendations for improvement"],
  ["feedback", "Feedback for the team or management"],
  ["setbacks", "Setbacks or issues"],
  ["nextWeekCalls", "Calls and meetings planned for next week"],
];

export function WeeklyReport() {
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const cur = useQuery({
    queryKey: ["report-current"],
    queryFn: () => api<CurrentReport>("/reports/weekly/current"),
  });
  const mine = useQuery({
    queryKey: ["report-mine"],
    queryFn: () => api<ReportItem[]>("/reports/weekly/mine"),
  });
  const submit = useMutation({
    mutationFn: (b: unknown) =>
      api<{ onTime: boolean }>("/reports/weekly", { method: "POST", body: b }),
    onSuccess: (r) => {
      setMsg({
        tone: "success",
        text: r.onTime
          ? "Report submitted. You earned the on-time points."
          : "Report submitted (late).",
      });
      queryClient.invalidateQueries({ queryKey: ["report-current"] });
      queryClient.invalidateQueries({ queryKey: ["report-mine"] });
    },
    onError: (e) => setMsg({ tone: "error", text: messageOf(e) }),
  });

  async function pdf(id: string, week: string) {
    const blob = await apiBlob(`/reports/weekly/${id}/pdf`);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `weekly-report-${week}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    submit.mutate({
      weekStart: cur.data?.weekStart,
      ...Object.fromEntries(FIELDS.map(([key]) => [key, String(f.get(key) ?? "")])),
    });
  }

  const c = cur.data;
  if (!c) return <p className="text-sm text-slate-500">Loading...</p>;
  const s = c.stats;
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Weekly report</h1>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Card>
        <h2 className="font-semibold">Week of {c.weekStart}</h2>
        <p className="text-xs text-slate-500">
          Due by{" "}
          {new Date(c.deadline).toLocaleString("en-KE", {
            timeZone: "Africa/Nairobi",
            dateStyle: "full",
            timeStyle: "short",
          })}{" "}
          EAT
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
          <div>
            <dt className="text-slate-500">Outreach</dt>
            <dd className="font-semibold">{s.outreach}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Deals closed</dt>
            <dd className="font-semibold">{s.deals}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Revenue</dt>
            <dd className="font-semibold">{k(s.revenue)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Commission</dt>
            <dd className="font-semibold">{k(s.commission)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Pipeline</dt>
            <dd className="font-semibold">{k(s.pipelineValue)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Points earned</dt>
            <dd className="font-semibold">{s.pointsEarned}</dd>
          </div>
        </dl>
      </Card>

      {c.report ? (
        <Alert tone="success">
          You submitted this week's report{c.report.onTime ? " on time" : " late"}.
        </Alert>
      ) : (
        <Card>
          <form onSubmit={onSubmit} className="space-y-3">
            {FIELDS.map(([key, label]) => (
              <label key={key} className="block text-sm">
                {label}
                <textarea
                  name={key}
                  required
                  minLength={3}
                  maxLength={2000}
                  rows={3}
                  className={area}
                />
              </label>
            ))}
            <Button type="submit" disabled={submit.isPending}>
              {submit.isPending ? "Submitting..." : "Submit report"}
            </Button>
            <p className="text-xs text-slate-500">
              A submitted report cannot be edited. A PDF is emailed to the Managing Partner and to
              you.
            </p>
          </form>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold">My past reports</h2>
        <ul className="mt-2 divide-y divide-slate-100 text-sm">
          {mine.data?.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2">
              <span>
                Week of {r.weekStart}{" "}
                {r.onTime ? <Badge value="on time" /> : <Badge value="late" />}
              </span>
              <Button onClick={() => pdf(r.id, r.weekStart)}>PDF</Button>
            </li>
          ))}
          {mine.data?.length === 0 && (
            <li className="py-3 text-slate-500">Nothing submitted yet.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
