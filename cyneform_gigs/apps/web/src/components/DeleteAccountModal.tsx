import type { DeletePreview } from "@cyneform/types";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { api, messageOf } from "../lib/api";
import { Alert, Button } from "./ui";

export function DeleteAccountModal({
  userId,
  name,
  onClose,
  onDone,
}: {
  userId: string;
  name: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [error, setError] = useState("");
  const pre = useQuery({
    queryKey: ["delete-preview", userId],
    queryFn: () => api<DeletePreview>(`/accounts/${userId}/delete-preview`),
  });
  const del = useMutation({
    mutationFn: (b: unknown) =>
      api<void>(`/accounts/${userId}/delete`, { method: "POST", body: b }),
    onSuccess: onDone,
    onError: (e) => setError(messageOf(e)),
  });
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    del.mutate({ confirm: String(f.get("confirm") ?? ""), reason: String(f.get("reason") ?? "") });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <form onSubmit={onSubmit} className="w-full max-w-lg space-y-3 rounded bg-white p-5 text-sm">
        <h2 className="text-lg font-semibold">Delete {name}?</h2>
        <p>
          The account is closed now, personal details are anonymized after the retention period, and
          this cannot be undone from the screen.
        </p>
        {pre.data && pre.data.warnings.length > 0 && (
          <Alert tone="error">
            <ul className="list-disc pl-4">
              {pre.data.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Alert>
        )}
        {pre.data && pre.data.warnings.length === 0 && (
          <p className="text-slate-500">No open items found.</p>
        )}
        {pre.isLoading && <p className="text-slate-500">Loading dependency preview…</p>}
        {pre.error && <Alert tone="error">{messageOf(pre.error)}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        <label className="block">
          Reason
          <input
            name="reason"
            required
            minLength={5}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block">
          Type DELETE to confirm
          <input
            name="confirm"
            required
            autoComplete="off"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={del.isPending || pre.isLoading || !pre.data}>
            {del.isPending ? "Deleting..." : "Delete account"}
          </Button>
        </div>
      </form>
    </div>
  );
}
