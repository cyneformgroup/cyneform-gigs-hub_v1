import type { RunDetail, RunItem, SourceItem } from "@cyneform/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SourceForm } from "../components/sources/SourceForm";
import { Alert, Button, Card } from "../components/ui";
import { api, messageOf } from "../lib/api";
import { useAuth } from "../lib/auth";

const tone: Record<string, string> = {
  healthy: "bg-green-100 text-green-700",
  degraded: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
  blocked: "bg-red-100 text-red-700",
  unknown: "bg-slate-100 text-slate-600",
  success: "bg-green-100 text-green-700",
  partial: "bg-amber-100 text-amber-700",
  running: "bg-blue-100 text-blue-700",
};
const Pill = ({ v }: { v: string }) => (
  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone[v] ?? tone.unknown}`}>
    {v}
  </span>
);
const when = (d: string | null) => (d ? new Date(d).toLocaleString("en-KE") : "—");

export function Sources() {
  const { can } = useAuth();
  const manage = can("sources.manage");
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SourceItem | "new" | null>(null);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: () => api<SourceItem[]>("/sources"),
  });
  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: () => api<RunItem[]>("/sources/runs"),
    refetchInterval: 10_000,
  });
  const detail = useQuery({
    queryKey: ["run", openRun],
    queryFn: () => api<RunDetail>(`/sources/runs/${openRun}`),
    enabled: !!openRun,
  });

  const runNow = useMutation({
    mutationFn: (id: string) => api<unknown>(`/sources/${id}/run`, { method: "POST" }),
    onSuccess: () => {
      setNotice("Run queued. It appears in the history below within seconds.");
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["runs"] }), 3000);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/sources/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sources"] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Lead sources</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sites the hunter reads for gigs. Only add sites whose terms allow it.
          </p>
        </div>
        {manage && !editing && <Button onClick={() => setEditing("new")}>Add source</Button>}
      </div>

      <div className="mt-4 space-y-2 empty:hidden">
        {notice && <Alert tone="success">{notice}</Alert>}
        {(runNow.error || remove.error) && (
          <Alert tone="error">{messageOf(runNow.error ?? remove.error)}</Alert>
        )}
      </div>

      {editing && (
        <div className="mt-6">
          <SourceForm
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        </div>
      )}

      <Card className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-2">Source</th>
              <th>Method</th>
              <th>Schedule</th>
              <th>Next run</th>
              <th>Health</th>
              <th>Last run</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sources.data?.map((s) => (
              <tr key={s.id}>
                <td className="py-2">
                  <span className="font-medium">{s.name}</span>
                  {!s.enabled && <span className="ml-2 text-xs text-slate-400">disabled</span>}
                  {s.autoPublish && (
                    <span className="ml-2 text-xs text-blue-600">auto-publish</span>
                  )}
                </td>
                <td>{s.config.strategy}</td>
                <td>{s.schedule ?? "manual"}</td>
                <td>{when(s.nextRunAt)}</td>
                <td>
                  <Pill v={s.health} />
                </td>
                <td>{when(s.lastRunAt)}</td>
                <td className="space-x-3 whitespace-nowrap text-right">
                  {manage && (
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={() => runNow.mutate(s.id)}
                    >
                      Run now
                    </button>
                  )}
                  {manage && (
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={() => setEditing(s)}
                    >
                      Edit
                    </button>
                  )}
                  {manage && (
                    <button
                      type="button"
                      className="text-red-600 hover:underline"
                      onClick={() => window.confirm(`Delete "${s.name}"?`) && remove.mutate(s.id)}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {sources.data?.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-500">
                  No sources yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="mt-6 overflow-x-auto">
        <h2 className="font-semibold">Run history</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              <th className="py-2">Source</th>
              <th>Started</th>
              <th>Status</th>
              <th>Pages</th>
              <th>Found</th>
              <th>Added</th>
              <th>Dup</th>
              <th>Rejected</th>
              <th>Errors</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {runs.data?.map((r) => (
              <tr
                key={r.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => setOpenRun(openRun === r.id ? null : r.id)}
              >
                <td className="py-2">
                  {r.sourceName ?? "—"} <span className="text-xs text-slate-400">{r.trigger}</span>
                </td>
                <td>{when(r.startedAt)}</td>
                <td>
                  <Pill v={r.status} />
                </td>
                <td>{r.pages}</td>
                <td>{r.found}</td>
                <td>{r.added}</td>
                <td>{r.duplicates}</td>
                <td>{r.rejected}</td>
                <td>{r.errorCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {openRun && detail.data && (
          <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-red-600">
            {detail.data.errors.map((e) => (
              <li key={e.stage + e.message + e.url}>
                {e.stage}: {e.message} {e.url && `(${e.url})`}
              </li>
            ))}
            {detail.data.errors.length === 0 && (
              <li className="text-slate-500">No errors in this run.</li>
            )}
          </ul>
        )}
      </Card>
    </div>
  );
}
