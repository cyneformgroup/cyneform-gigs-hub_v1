import type { GigItem, OutreachInput, OutreachResult } from "@cyneform/types";
import {
  CHANNEL_LABELS,
  OUTREACH_CHANNELS,
  OutreachSchema,
  SOCIAL_PLATFORMS,
} from "@cyneform/validators";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { api, messageOf } from "../lib/api";
import { Alert, Button, Card } from "./ui";

export function OutreachModal({ gig, onClose }: { gig: GigItem; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [channels, setChannels] = useState<OutreachInput["channels"]>([]);
  const [platforms, setPlatforms] = useState<OutreachInput["socialPlatforms"]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: (body: OutreachInput) =>
      api<OutreachResult>(`/gigs/${gig.id}/outreach`, { method: "POST", body }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["gigs"] });
      queryClient.invalidateQueries({ queryKey: ["my-claims"] });
      navigate(`/crm/${r.entryId}`);
    },
  });

  const toggle = <T extends string>(list: T[], v: T, on: boolean) =>
    on ? [...list, v] : list.filter((x) => x !== v);

  function submit() {
    const parsed = OutreachSchema.safeParse({
      channels,
      socialPlatforms: platforms,
      notes: notes || undefined,
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the form");
    setError(null);
    send.mutate(parsed.data);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <Card>
        <div className="w-full max-w-md space-y-4">
          <h2 className="font-semibold">Mark outreach sent: {gig.title}</h2>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Outreach channel</legend>
            {OUTREACH_CHANNELS.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={channels.includes(c)}
                  onChange={(e) => setChannels(toggle(channels, c, e.target.checked))}
                />
                {CHANNEL_LABELS[c]}
              </label>
            ))}
          </fieldset>
          {channels.includes("social") && (
            <fieldset className="flex flex-wrap gap-3">
              <legend className="text-sm font-medium">Which platforms?</legend>
              {SOCIAL_PLATFORMS.map((p) => (
                <label key={p} className="flex items-center gap-1 text-sm capitalize">
                  <input
                    type="checkbox"
                    checked={platforms.includes(p)}
                    onChange={(e) => setPlatforms(toggle(platforms, p, e.target.checked))}
                  />
                  {p}
                </label>
              ))}
            </fieldset>
          )}
          <label className="block text-sm font-medium">
            Notes (optional)
            <textarea
              value={notes}
              maxLength={1000}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          {(error || send.error) && <Alert tone="error">{error ?? messageOf(send.error)}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={send.isPending}>
              {send.isPending ? "Saving..." : "Mark outreach sent"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
