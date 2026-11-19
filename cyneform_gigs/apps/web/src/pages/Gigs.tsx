import type { GigItem, GigPage, ReviewGigsInput, ReviewResult } from "@cyneform/types";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Button, Card } from "../components/ui";
import { api, messageOf } from "../lib/api";
import { useAuth } from "../lib/auth";

const TABS = [
  ["pending_review", "Pending review"],
  ["new", "Published"],
  ["rejected", "Rejected"],
] as const;
const input = "rounded-md border border-slate-300 px-3 py-2 text-sm";
const money = (g: GigItem) =>
  g.budget != null ? `${g.currency ?? ""} ${g.budget.toLocaleString()}`.trim() : "—";

export function Gigs() {
  const { can } = useAuth();
  const reviewer = can("gigs.review");
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>(reviewer ? "pending_review" : "new");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const gigs = useQuery({
    queryKey: ["gigs", status, q, page],
    queryFn: () =>
      api<GigPage>(
        `/gigs?${new URLSearchParams({ status, page: String(page), ...(q ? { search: q } : {}) })}`,
      ),
    placeholderData: keepPreviousData,
  });

  const review = useMutation({
    mutationFn: (body: ReviewGigsInput) =>
      api<ReviewResult>("/gigs/review", { method: "POST", body }),
    onSuccess: (r) => {
      setPicked(new Set());
      setReason("");
      setMsg(
        `${r.updated} updated${r.skipped ? `, ${r.skipped} skipped (already changed or event date passed)` : ""}.`,
      );
      queryClient.invalidateQueries({ queryKey: ["gigs"] });
    },
  });

  const items = gigs.data?.items ?? [];
  const pages = Math.max(1, Math.ceil((gigs.data?.total ?? 0) / (gigs.data?.pageSize ?? 50)));
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const act = (action: "approve" | "reject") =>
    review.mutate({ ids: [...picked], action, reason: reason || undefined });

  return (
    <div>
      <h1 className="text-xl font-semibold">{reviewer ? "Gigs" : "Available gigs"}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {reviewer
          ? "Review what the hunter found. Approving publishes gigs and notifies admins and BDPs."
          : "Upcoming gigs. Claiming opens in the next release."}
      </p>

      {reviewer && (
        <div className="mt-4 flex gap-2">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setStatus(key);
                setPage(1);
                setPicked(new Set());
              }}
              className={`rounded-md px-3 py-1.5 text-sm ${status === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {label} ({gigs.data?.counts[key] ?? 0})
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(search);
          setPage(1);
        }}
      >
        <input
          className={`${input} w-64`}
          placeholder="Search title or venue"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button type="submit">Search</Button>
      </form>

      <div className="mt-4 space-y-2 empty:hidden">
        {msg && <Alert tone="success">{msg}</Alert>}
        {review.error && <Alert tone="error">{messageOf(review.error)}</Alert>}
      </div>

      {reviewer && picked.size > 0 && (
        <Card className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">{picked.size} selected</span>
          {status !== "new" && (
            <Button disabled={review.isPending} onClick={() => act("approve")}>
              Approve and publish
            </Button>
          )}
          {status !== "rejected" && (
            <>
              <input
                className={`${input} w-56`}
                placeholder="Reason (required to reject)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                variant="danger"
                disabled={review.isPending || reason.trim().length < 3}
                onClick={() => act("reject")}
              >
                {status === "new" ? "Unpublish" : "Reject"}
              </Button>
            </>
          )}
        </Card>
      )}

      <Card className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr>
              {reviewer && (
                <th className="w-8 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={items.length > 0 && picked.size === items.length}
                    onChange={(e) =>
                      setPicked(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())
                    }
                  />
                </th>
              )}
              <th className="py-2">Gig</th>
              <th>Date</th>
              <th>Venue</th>
              <th>Category</th>
              <th>Budget</th>
              {reviewer && <th>Source</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((g) => (
              <>
                <tr key={g.id} className="align-top hover:bg-slate-50">
                  {reviewer && (
                    <td className="py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${g.title}`}
                        checked={picked.has(g.id)}
                        onChange={() => toggle(g.id)}
                      />
                    </td>
                  )}
                  <td className="py-2">
                    <button
                      type="button"
                      className="text-left font-medium text-blue-700 hover:underline"
                      onClick={() => setOpen(open === g.id ? null : g.id)}
                    >
                      {g.title}
                    </button>
                  </td>
                  <td className="whitespace-nowrap">
                    {new Date(g.startsAt).toLocaleString("en-KE", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td>{g.venue ?? "—"}</td>
                  <td>{g.category ?? "—"}</td>
                  <td>{money(g)}</td>
                  {reviewer && <td>{g.sourceName ?? "—"}</td>}
                </tr>
                {open === g.id && (
                  <tr key={`${g.id}-d`} className="bg-slate-50">
                    <td
                      colSpan={reviewer ? 7 : 5}
                      className="space-y-2 px-4 py-3 text-xs text-slate-700"
                    >
                      {g.description && <p className="whitespace-pre-line">{g.description}</p>}
                      <p>
                        {[...g.contacts.emails, ...g.contacts.phones, ...g.contacts.handles].join(
                          " · ",
                        ) || "No contacts found"}
                      </p>
                      {g.contacts.websites.length > 0 && <p>{g.contacts.websites.join(" · ")}</p>}
                      <p>
                        <a
                          className="text-blue-600 hover:underline"
                          href={g.eventUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Original listing
                        </a>
                        {g.rejectReason && (
                          <span className="ml-3 text-red-600">Rejected: {g.rejectReason}</span>
                        )}
                      </p>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-500">
                  Nothing here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>{gigs.data?.total ?? 0} gig(s)</span>
          <span className="space-x-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="disabled:opacity-40"
            >
              Prev
            </button>
            <span>
              {page} / {pages}
            </span>
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
              className="disabled:opacity-40"
            >
              Next
            </button>
          </span>
        </div>
      </Card>
    </div>
  );
}
