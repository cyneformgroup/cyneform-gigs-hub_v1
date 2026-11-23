import type { EntryPage } from "@cyneform/types";
import { CRM_STATUSES, STATUS_LABELS } from "@cyneform/validators";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { Badge, Button, Card } from "../components/ui";
import { api, messageOf } from "../lib/api";
import { useAuth } from "../lib/auth";

const day = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" }) : "-";

export function CrmList() {
  const { can } = useAuth();
  const all = can("crm.view_all");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const qs = new URLSearchParams({ page: String(page), ...(status ? { status } : {}) }).toString();
  const q = useQuery({
    queryKey: ["crm", qs],
    queryFn: () => api<EntryPage>(`/crm?${qs}`),
    placeholderData: keepPreviousData,
  });
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / (q.data?.pageSize ?? 25)));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{all ? "CRM entries" : "My CRM"}</h1>
      <select
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          setPage(1);
        }}
        className="rounded border border-slate-300 px-2 py-2 text-sm"
      >
        <option value="">All statuses</option>
        {CRM_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {q.isError && <p className="text-sm text-red-600">{messageOf(q.error)}</p>}
      <Card>
        <ul className="divide-y divide-slate-100 text-sm">
          {q.data?.items.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <Link to={`/crm/${e.id}`} className="font-medium text-blue-600 hover:underline">
                  {e.clientName}
                </Link>
                <span className="block text-xs text-slate-500">
                  {all && e.ownerName ? `${e.ownerName} · ` : ""}
                  {e.clientType ?? "No type"} · next follow-up {day(e.followup1Date)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {!e.isCompleted && <Badge value="Incomplete" />}
                <Badge
                  value={
                    STATUS_LABELS[e.currentStatus as keyof typeof STATUS_LABELS] ?? e.currentStatus
                  }
                />
              </span>
            </li>
          ))}
          {q.data?.items.length === 0 && (
            <li className="py-6 text-center text-slate-500">
              No CRM entries yet. They are created when you mark outreach sent.
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
