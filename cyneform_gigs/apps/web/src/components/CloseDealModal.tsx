import type { CloseDealInput, DealItem, EntryDetail } from "@cyneform/types";
import { CLIENT_PAYMENT_STATUSES, CloseDealSchema } from "@cyneform/validators";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, messageOf } from "../lib/api";
import { DealBreakdown } from "./DealBreakdown";
import { Alert, Button, Card } from "./ui";

const label = { fully_paid: "Fully paid", not_paid: "Not paid yet" } as const;

export function CloseDealModal({ entry, onClose }: { entry: EntryDetail; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [paid, setPaid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DealItem | null>(null);

  const close = useMutation({
    mutationFn: (body: CloseDealInput) =>
      api<DealItem>(`/compensation/close/${entry.id}`, { method: "POST", body }),
    onSuccess: (deal) => {
      setResult(deal);
      for (const key of ["crm-entry", "crm", "my-points", "compensation"])
        queryClient.invalidateQueries({ queryKey: [key] });
    },
  });

  function submit() {
    const parsed = CloseDealSchema.safeParse({
      projectValue: value === "" ? Number.NaN : Number(value),
      clientPaymentStatus: paid || undefined,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the form");
    setError(null);
    close.mutate(parsed.data);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <Card>
        <div className="w-full max-w-md space-y-4">
          {result ? (
            <>
              <h2 className="font-semibold">Deal closed: {result.dealName}</h2>
              <DealBreakdown d={result} />
              <div className="flex justify-end">
                <Button onClick={onClose}>Done</Button>
              </div>
            </>
          ) : (
            <>
              <h2 className="font-semibold">Close deal: {entry.clientName}</h2>
              <p className="text-sm text-slate-500">
                This ends the entry and calculates your compensation. It cannot be undone.
              </p>
              <label className="block text-sm">
                Project value (KES)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                Has the client paid?
                <select
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select...</option>
                  {CLIENT_PAYMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {label[s]}
                    </option>
                  ))}
                </select>
              </label>
              {(error || close.error) && (
                <Alert tone="error">{error ?? messageOf(close.error)}</Alert>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="button" onClick={submit} disabled={close.isPending}>
                  {close.isPending ? "Calculating..." : "Close deal"}
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
