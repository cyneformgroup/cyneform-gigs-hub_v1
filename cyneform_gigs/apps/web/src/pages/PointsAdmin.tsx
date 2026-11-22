import type { BdpOption, LedgerPage, RulesView } from "@cyneform/types";
import { AdjustSchema, AwardSchema, LEDGER_STATUSES, POINT_RULES } from "@cyneform/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { Alert, Badge, Button, Card } from "../components/ui";
import { api, messageOf } from "../lib/api";
import { useAuth } from "../lib/auth";

const selectClass = "rounded border border-slate-300 px-2 py-2 text-sm";

function Entries({ data, actions }: { data?: LedgerPage; actions?: (id: string) => ReactNode }) {
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {data?.items.map((entry) => (
        <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
          <span>
            <b>{entry.userName ?? "User"}</b> · {entry.ruleLabel}
            <span className="block text-xs text-slate-500">
              {entry.leadTitle ? `${entry.leadTitle} · ` : ""}
              {new Date(entry.earnedAt).toLocaleString("en-KE")}
              {entry.note ? ` · ${entry.note}` : ""}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <b>
              {entry.points > 0 ? "+" : ""}
              {entry.points}
            </b>
            <Badge value={entry.status.replaceAll("_", " ")} />
            {actions?.(entry.id)}
          </span>
        </li>
      ))}
      {data?.items.length === 0 && (
        <li className="py-6 text-center text-slate-500">Nothing here.</li>
      )}
    </ul>
  );
}

export function PointsAdmin() {
  const { can } = useAuth();
  const manage = can("points.manage");
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"ledger" | "pending" | "manual">("ledger");
  const [filter, setFilter] = useState({ userId: "", status: "", ruleKey: "" });
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const bdps = useQuery({
    queryKey: ["points-bdps"],
    queryFn: () => api<BdpOption[]>("/points/bdps"),
  });
  const rules = useQuery({
    queryKey: ["points-rules"],
    queryFn: () => api<RulesView>("/points/rules"),
    enabled: can("rules.view"),
  });
  const queryString = new URLSearchParams(
    Object.entries(filter).filter(([, value]) => value),
  ).toString();
  const ledger = useQuery({
    queryKey: ["points-ledger", queryString],
    queryFn: () => api<LedgerPage>(`/points/ledger${queryString ? `?${queryString}` : ""}`),
    enabled: tab === "ledger",
  });
  const pending = useQuery({
    queryKey: ["points-pending"],
    queryFn: () => api<LedgerPage>("/points/pending"),
    enabled: tab === "pending" && manage,
  });

  const done = (text: string) => {
    setMessage({ tone: "success", text });
    queryClient.invalidateQueries({ queryKey: ["points-ledger"] });
    queryClient.invalidateQueries({ queryKey: ["points-pending"] });
    queryClient.invalidateQueries({ queryKey: ["my-points"] });
  };
  const fail = (error: unknown) => setMessage({ tone: "error", text: messageOf(error) });
  const verify = useMutation({
    mutationFn: (input: { id: string; decision: "verify" | "reject"; note?: string }) =>
      api<void>(`/points/${input.id}/verify`, {
        method: "POST",
        body: { decision: input.decision, note: input.note },
      }),
    onSuccess: () => done("Verification updated."),
    onError: fail,
  });
  const award = useMutation({
    mutationFn: (body: { userId: string; ruleKey: string; leadId?: string; note?: string }) =>
      api("/points/award", { method: "POST", body }),
    onSuccess: () => done("Points awarded."),
    onError: fail,
  });
  const adjust = useMutation({
    mutationFn: (body: { userId: string; points: number; reason: string }) =>
      api<void>("/points/adjust", { method: "POST", body }),
    onSuccess: () => done("Adjustment saved."),
    onError: fail,
  });

  function submitAward(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = AwardSchema.safeParse({
      userId: String(form.get("userId") ?? ""),
      ruleKey: String(form.get("ruleKey") ?? ""),
      leadId: String(form.get("leadId") || "") || undefined,
      note: String(form.get("note") || "") || undefined,
    });
    if (!parsed.success) {
      setMessage({ tone: "error", text: parsed.error.issues[0]?.message ?? "Check the award." });
      return;
    }
    setMessage(null);
    award.mutate(parsed.data);
  }

  function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = AdjustSchema.safeParse({
      userId: String(form.get("userId") ?? ""),
      points: Number(form.get("points")),
      reason: String(form.get("reason") ?? ""),
    });
    if (!parsed.success) {
      setMessage({
        tone: "error",
        text: parsed.error.issues[0]?.message ?? "Check the adjustment.",
      });
      return;
    }
    setMessage(null);
    adjust.mutate(parsed.data);
  }

  const tabs = [
    ["ledger", "Ledger"],
    ...(manage
      ? ([
          ["pending", "Pending verification"],
          ["manual", "Manual"],
        ] as const)
      : []),
  ] as const;
  const bdpOptions = (name: string) => (
    <select name={name} required className={selectClass}>
      <option value="">Select a BDP</option>
      {bdps.data?.map((bdp) => (
        <option key={bdp.id} value={bdp.id}>
          {bdp.fullName}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Points admin</h1>
      <div className="flex gap-2">
        {tabs.map(([key, label]) => (
          <Button
            key={key}
            variant={tab === key ? "primary" : "secondary"}
            onClick={() => {
              setTab(key);
              setMessage(null);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {bdps.isError && <Alert tone="error">{messageOf(bdps.error)}</Alert>}

      {tab === "ledger" && (
        <Card>
          <div className="flex flex-wrap gap-2">
            <select
              className={selectClass}
              value={filter.userId}
              onChange={(event) => setFilter({ ...filter, userId: event.target.value })}
            >
              <option value="">All BDPs</option>
              {bdps.data?.map((bdp) => (
                <option key={bdp.id} value={bdp.id}>
                  {bdp.fullName}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={filter.status}
              onChange={(event) => setFilter({ ...filter, status: event.target.value })}
            >
              <option value="">All statuses</option>
              {LEDGER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <select
              className={selectClass}
              value={filter.ruleKey}
              onChange={(event) => setFilter({ ...filter, ruleKey: event.target.value })}
            >
              <option value="">All rules</option>
              {POINT_RULES.map((rule) => (
                <option key={rule.key} value={rule.key}>
                  {rule.label}
                </option>
              ))}
              <option value="manual_adjustment">Manual adjustment</option>
            </select>
          </div>
          <div className="mt-3">
            <Entries data={ledger.data} />
          </div>
          {ledger.isError && <Alert tone="error">{messageOf(ledger.error)}</Alert>}
          {ledger.data && ledger.data.total > ledger.data.items.length && (
            <p className="mt-2 text-xs text-slate-500">
              Showing the latest {ledger.data.items.length} of {ledger.data.total}. Narrow the
              filters to see more.
            </p>
          )}
        </Card>
      )}

      {tab === "pending" && manage && (
        <Card>
          <Entries
            data={pending.data}
            actions={(id) => (
              <>
                <Button onClick={() => verify.mutate({ id, decision: "verify" })}>Verify</Button>
                <Button
                  variant="danger"
                  onClick={() =>
                    verify.mutate({
                      id,
                      decision: "reject",
                      note: window.prompt("Reason for rejecting (optional)") ?? undefined,
                    })
                  }
                >
                  Reject
                </Button>
              </>
            )}
          />
          {pending.isError && <Alert tone="error">{messageOf(pending.error)}</Alert>}
        </Card>
      )}

      {tab === "manual" && manage && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <h2 className="font-semibold">Award points</h2>
            <form onSubmit={submitAward} className="mt-3 space-y-3">
              {bdpOptions("userId")}
              <select name="ruleKey" required className={`${selectClass} w-full`}>
                <option value="">Select a rule</option>
                {rules.data?.rules.map((rule) => (
                  <option key={rule.key} value={rule.key}>
                    {rule.label} ({rule.points})
                  </option>
                ))}
              </select>
              <input
                name="leadId"
                placeholder="Gig id (optional)"
                className={`${selectClass} w-full`}
              />
              <input
                name="note"
                placeholder="Note (optional)"
                className={`${selectClass} w-full`}
              />
              <Button type="submit" disabled={award.isPending}>
                Award
              </Button>
            </form>
            {rules.isError && <Alert tone="error">{messageOf(rules.error)}</Alert>}
          </Card>
          <Card>
            <h2 className="font-semibold">Adjust points</h2>
            <form onSubmit={submitAdjustment} className="mt-3 space-y-3">
              {bdpOptions("userId")}
              <input
                name="points"
                type="number"
                step="0.01"
                min="-1000"
                max="1000"
                required
                placeholder="Points, e.g. 5 or -2"
                className={`${selectClass} w-full`}
              />
              <input
                name="reason"
                minLength={3}
                maxLength={500}
                required
                placeholder="Reason (required)"
                className={`${selectClass} w-full`}
              />
              <Button type="submit" disabled={adjust.isPending}>
                Save adjustment
              </Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
