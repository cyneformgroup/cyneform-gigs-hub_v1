import type { TrainingItem, ViewSession } from "@cyneform/types";
import { DEFAULT_WATERMARK } from "@cyneform/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { TrainingViewer } from "../components/TrainingViewer";
import { Alert, Badge, Button, Card } from "../components/ui";
import { api, messageOf } from "../lib/api";
import { useAuth } from "../lib/auth";

const field = "w-full rounded border border-slate-300 px-3 py-2 text-sm";
export function Training() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [session, setSession] = useState<(ViewSession & { id: string }) | null>(null);
  const [message, setMessage] = useState("");
  const files = useQuery({
    queryKey: ["training"],
    queryFn: () => api<TrainingItem[]>("/training"),
  });
  const open = useMutation({
    mutationFn: (id: string) =>
      api<ViewSession>(`/training/${id}/view`, { method: "POST" }).then((s) => ({ ...s, id })),
    onSuccess: (s) => {
      setSession(s);
      void qc.invalidateQueries({ queryKey: ["training"] });
    },
    onError: (e) => setMessage(messageOf(e)),
  });
  const upload = useMutation({
    mutationFn: (fd: FormData) => api<{ id: string }>("/training", { method: "POST", body: fd }),
    onSuccess: () => {
      setMessage("Uploaded. All BDPs were notified.");
      void qc.invalidateQueries({ queryKey: ["training"] });
    },
    onError: (e) => setMessage(messageOf(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/training/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["training"] }),
    onError: (e) => setMessage(messageOf(e)),
  });
  async function download() {
    if (!session) return;
    try {
      const { url } = await api<{ url: string }>(`/training/${session.id}/download`, {
        method: "POST",
      });
      const blob = await api<Blob>(url, { blob: true });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${session.title}.${session.fileType}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setMessage(messageOf(e));
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    upload.mutate(new FormData(form), { onSuccess: () => form.reset() });
  }
  const folders = new Map<string, TrainingItem[]>();
  for (const item of files.data ?? [])
    folders.set(item.folder, [...(folders.get(item.folder) ?? []), item]);
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Training library</h1>
      {message && <Alert tone="success">{message}</Alert>}
      <p className="text-sm text-slate-600">
        Each view is logged and carries your name and contractor number. Opening a file for the
        first time earns points.
      </p>
      {can("training.manage") && (
        <Card>
          <h2 className="font-semibold">Upload material</h2>
          <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input name="title" required minLength={3} placeholder="Title" className={field} />
            <input name="folder" placeholder="Folder (default General)" className={field} />
            <input
              name="description"
              placeholder="Description"
              className={`${field} sm:col-span-2`}
            />
            <input
              name="watermark"
              defaultValue={DEFAULT_WATERMARK}
              className={`${field} sm:col-span-2`}
            />
            <input
              name="file"
              type="file"
              required
              accept=".pdf,.docx,.pptx,.mp4,.jpg,.jpeg,.png"
              className="sm:col-span-2"
            />
            <div>
              <Button type="submit" disabled={upload.isPending}>
                {upload.isPending ? "Uploading…" : "Upload"}
              </Button>
            </div>
          </form>
          <p className="mt-2 text-xs text-slate-500">
            PDF, DOCX, PPTX, MP4, JPG or PNG, up to 50 MB.
          </p>
        </Card>
      )}
      {[...folders].map(([folder, items]) => (
        <Card key={folder}>
          <h2 className="font-semibold capitalize">{folder.replace(/-/g, " ")}</h2>
          <ul className="divide-y">
            {items.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <span>
                  <b>{f.title}</b>
                  <span className="block text-xs text-slate-500">
                    {f.fileType.toUpperCase()} · {(f.sizeBytes / 1048576).toFixed(1)} MB{" "}
                    {f.description}
                  </span>
                </span>
                <span className="flex gap-2">
                  {f.viewed && <Badge value="viewed" />}
                  <Button onClick={() => open.mutate(f.id)}>Open</Button>
                  {can("training.manage") && (
                    <Button
                      onClick={() => window.confirm("Remove this file?") && remove.mutate(f.id)}
                    >
                      Remove
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {files.data?.length === 0 && <Card>No training material yet.</Card>}
      {session && (
        <TrainingViewer
          session={session}
          onDownload={download}
          onClose={() => setSession(null)}
          onPlay={() => {
            void api<void>(`/training/${session.id}/play`, { method: "POST" }).catch((e) =>
              setMessage(messageOf(e)),
            );
          }}
        />
      )}
    </div>
  );
}
