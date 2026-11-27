import type { DataRequestItem } from "@cyneform/types";
import { DATA_REQUEST_TYPES } from "@cyneform/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Alert, Badge, Button, Card } from "../components/ui";
import { api, apiBlob, messageOf } from "../lib/api";

const label: Record<string, string> = {
  access: "Access: a copy of my data",
  correction: "Correction: fix incorrect data",
  erasure: "Erasure: delete my data",
  objection: "Objection: stop a type of processing",
  portability: "Portability: move my data elsewhere",
};

export function Privacy() {
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const list = useQuery({
    queryKey: ["my-data-requests"],
    queryFn: () => api<DataRequestItem[]>("/privacy/requests/mine"),
  });
  const create = useMutation({
    mutationFn: (b: unknown) =>
      api<{ id: string }>("/privacy/requests", { method: "POST", body: b }),
    onSuccess: () => {
      setMsg({
        tone: "success",
        text: "Request received. The administrators will respond by the due date shown.",
      });
      queryClient.invalidateQueries({ queryKey: ["my-data-requests"] });
    },
    onError: (e) => setMsg({ tone: "error", text: messageOf(e) }),
  });

  async function download() {
    try {
      const blob = await apiBlob("/privacy/export");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setMsg({ tone: "error", text: messageOf(e) });
    }
  }
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    create.mutate(
      { type: String(f.get("type")), details: String(f.get("details") ?? "") },
      { onSuccess: () => form.reset() },
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Privacy and my data</h1>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Card>
        <h2 className="font-semibold">What we hold</h2>
        <p className="mt-2 text-sm text-slate-600">
          We keep your profile, points, CRM entries, deals and compensation, weekly reports,
          training views, meeting attendance and notifications. Under the Kenya Data Protection Act
          you may ask to see, correct, restrict, move or erase your personal data. Some financial
          records must be kept by law, and we will tell you if that applies.
        </p>
        <div className="mt-3">
          <Button onClick={download}>Download all my data (JSON)</Button>
          <span className="ml-2 text-xs text-slate-500">Once an hour</span>
        </div>
      </Card>
      <Card>
        <h2 className="font-semibold">Make a request</h2>
        <form onSubmit={onSubmit} className="mt-3 space-y-3 text-sm">
          <select name="type" className="w-full rounded border border-slate-300 px-3 py-2">
            {DATA_REQUEST_TYPES.map((t) => (
              <option key={t} value={t}>
                {label[t]}
              </option>
            ))}
          </select>
          <textarea
            name="details"
            required
            minLength={5}
            maxLength={2000}
            rows={3}
            placeholder="Tell us what you need"
            className="w-full rounded border border-slate-300 px-3 py-2"
          />
          <Button type="submit" disabled={create.isPending}>
            Send request
          </Button>
        </form>
      </Card>
      <Card>
        <h2 className="font-semibold">My requests</h2>
        <ul className="mt-2 divide-y divide-slate-100 text-sm">
          {list.data?.map((r) => (
            <li key={r.id} className="py-2">
              <div className="flex justify-between">
                <span>
                  <b className="capitalize">{r.type}</b>{" "}
                  <Badge value={r.status.replace("_", " ")} />
                </span>
                <span className="text-xs text-slate-500">
                  Due {new Date(r.dueAt).toLocaleDateString("en-KE")}
                </span>
              </div>
              <p className="text-slate-600">{r.details}</p>
              {r.response && <p className="mt-1 rounded bg-slate-50 p-2">Response: {r.response}</p>}
            </li>
          ))}
          {list.data?.length === 0 && <li className="py-3 text-slate-500">No requests yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
