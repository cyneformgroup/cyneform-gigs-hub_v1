import type { DataRequestItem } from "@cyneform/types";
import { DATA_REQUEST_STATUSES } from "@cyneform/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Badge, Button, Card } from "../components/ui";
import { api, messageOf } from "../lib/api";

export function DataRequests() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("open");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const list = useQuery({
    queryKey: ["data-requests", status],
    queryFn: () => api<DataRequestItem[]>(`/privacy/requests${status ? `?status=${status}` : ""}`),
  });
  const resolve = useMutation({
    mutationFn: (v: { id: string; status: string; response: string }) =>
      api<void>(`/privacy/requests/${v.id}/resolve`, {
        method: "POST",
        body: { status: v.status, response: v.response },
      }),
    onSuccess: () => {
      setMsg({ tone: "success", text: "Saved. The user was notified." });
      queryClient.invalidateQueries({ queryKey: ["data-requests"] });
    },
    onError: (e) => setMsg({ tone: "error", text: messageOf(e) }),
  });
  function act(r: DataRequestItem, to: "in_progress" | "completed" | "rejected") {
    const response = window.prompt(
      to === "rejected" ? "Reason for rejecting" : "Response to the user",
    );
    if (response && response.trim().length >= 3)
      resolve.mutate({ id: r.id, status: to, response: response.trim() });
  }
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Data requests</h1>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="rounded border border-slate-300 px-2 py-2 text-sm"
      >
        <option value="">All</option>
        {DATA_REQUEST_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace("_", " ")}
          </option>
        ))}
      </select>
      <Card>
        <ul className="divide-y divide-slate-100 text-sm">
          {list.data?.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <b>{r.ownerName}</b> · <span className="capitalize">{r.type}</span>{" "}
                  <Badge value={r.status.replace("_", " ")} />{" "}
                  {r.overdue && <Badge value="overdue" />}
                </span>
                <span className="text-xs text-slate-500">
                  Due {new Date(r.dueAt).toLocaleDateString("en-KE")}
                </span>
              </div>
              <p className="text-slate-600">{r.details}</p>
              {(r.status === "open" || r.status === "in_progress") && (
                <div className="mt-2 flex gap-2">
                  {r.status === "open" && (
                    <Button onClick={() => act(r, "in_progress")}>Start</Button>
                  )}
                  <Button onClick={() => act(r, "completed")}>Complete</Button>
                  <Button onClick={() => act(r, "rejected")}>Reject</Button>
                </div>
              )}
              {r.response && (
                <p className="mt-1 rounded bg-slate-50 p-2 text-xs">Response: {r.response}</p>
              )}
            </li>
          ))}
          {list.data?.length === 0 && (
            <li className="py-6 text-center text-slate-500">Nothing here.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
