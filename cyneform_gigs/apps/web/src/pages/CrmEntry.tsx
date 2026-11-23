import type { EntryDetail, UpdateEntryInput } from "@cyneform/types";
import {
  CHANNEL_LABELS,
  CLIENT_TYPES,
  type CrmContacts,
  missingFields,
  OUTREACH_CHANNELS,
  SOCIAL_PLATFORMS,
  STATUS_LABELS,
  UpdateEntrySchema,
} from "@cyneform/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { CloseDealModal } from "../components/CloseDealModal";
import { Alert, Badge, Button, Card } from "../components/ui";
import { api, messageOf } from "../lib/api";
import { useAuth } from "../lib/auth";

const input = "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm";
const bad = "border-red-500";
const list = (s: string) =>
  s
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean);
const dt = (s: string | null) =>
  s ? new Date(s).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }) : "-";

export function CrmEntry() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [closing, setClosing] = useState(false);

  const q = useQuery({
    queryKey: ["crm-entry", id],
    queryFn: () => api<EntryDetail>(`/crm/${id}`),
  });
  const done = (d: EntryDetail, text: string) => {
    queryClient.setQueryData(["crm-entry", id], d);
    queryClient.invalidateQueries({ queryKey: ["crm"] });
    queryClient.invalidateQueries({ queryKey: ["my-points"] });
    setMsg({ tone: "success", text });
  };
  const fail = (e: unknown) => setMsg({ tone: "error", text: messageOf(e) });

  const save = useMutation({
    mutationFn: (b: UpdateEntryInput) =>
      api<EntryDetail>(`/crm/${id}`, { method: "PATCH", body: b }),
    onSuccess: (d) => done(d, "Saved."),
    onError: fail,
  });
  const move = useMutation({
    mutationFn: (status: string) =>
      api<EntryDetail>(`/crm/${id}/status`, { method: "POST", body: { status } }),
    onSuccess: (d) => done(d, "Status updated."),
    onError: fail,
  });
  const flag = useMutation({
    mutationFn: (reason: string) =>
      api<EntryDetail>(`/crm/${id}/flag`, { method: "POST", body: { reason } }),
    onSuccess: (d) => done(d, "Outreach flagged. Quality points voided."),
    onError: fail,
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const f = new FormData();
      f.append("file", file);
      return api<EntryDetail>(`/crm/${id}/evidence`, { method: "POST", body: f });
    },
    onSuccess: (d) => done(d, "Evidence uploaded."),
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (fileId: string) => api<void>(`/crm/files/${fileId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-entry", id] });
      setMsg({ tone: "success", text: "File removed." });
    },
    onError: fail,
  });

  async function download(fileId: string, name: string) {
    try {
      const blob = await api<Blob>(`/crm/files/${fileId}`, { blob: true });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      fail(e);
    }
  }

  if (!q.data)
    return (
      <p className="text-sm text-slate-500">{q.isError ? messageOf(q.error) : "Loading..."}</p>
    );
  const e = q.data;
  const closed = !!(e.wonAt || e.lostAt);
  const editable = e.mine && !closed;
  const shown = Object.keys(errors).length ? errors : {};
  const hint = (k: string) =>
    shown[k] ? <p className="mt-1 text-xs text-red-600">{shown[k]}</p> : null;

  function onSave(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const social = Object.fromEntries(
      list(String(f.get("social") ?? ""))
        .map((l) => {
          const [k, ...v] = l.split(":");
          return [(k ?? "").trim().toLowerCase(), v.join(":").trim()];
        })
        .filter(([k, v]) => k && v),
    );
    const contacts: CrmContacts = {
      emails: list(String(f.get("emails") ?? "")),
      phones: list(String(f.get("phones") ?? "")),
      social,
      website: String(f.get("website") ?? "").trim() || null,
    };
    const body = {
      clientType: String(f.get("clientType") ?? "") || undefined,
      decisionMakerName: String(f.get("decisionMakerName") ?? ""),
      jobTitle: String(f.get("jobTitle") ?? ""),
      contacts,
      channels: f.getAll("channels"),
      socialPlatforms: f.getAll("socialPlatforms"),
      outreachNotes: String(f.get("outreachNotes") ?? ""),
    };
    const parsed = UpdateEntrySchema.safeParse(body);
    if (!parsed.success) {
      const found: Record<string, string> = {};
      for (const i of parsed.error.issues) found[String(i.path[0])] = i.message;
      setErrors(found);
      return setMsg({ tone: "error", text: "Fix the highlighted fields." });
    }
    // Highlight what is still missing (spec CRM-004), but still allow saving partial progress.
    setErrors(
      missingFields({
        clientType: parsed.data.clientType ?? null,
        decisionMakerName: parsed.data.decisionMakerName ?? null,
        jobTitle: parsed.data.jobTitle ?? null,
        contacts: parsed.data.contacts ?? e.contacts,
        channels: parsed.data.channels ?? [],
        fileCount: e.files.length,
      }),
    );
    setMsg(null);
    save.mutate(parsed.data);
  }

  const missingNow = Object.keys(e.missing).length > 0;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/crm" className="text-sm text-blue-600 hover:underline">
          Back to CRM
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{e.clientName}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          {e.statuses.map((s) => (
            <Badge key={s} value={STATUS_LABELS[s as keyof typeof STATUS_LABELS] ?? s} />
          ))}
          {e.isCompleted ? <Badge value="Completed" /> : <Badge value="Incomplete" />}
          <span>{e.pointsEarned} points earned</span>
          {e.ownerName && !e.mine && <span>· {e.ownerName}</span>}
        </p>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {editable && missingNow && (
        <Alert tone="error">
          Still to complete (you can keep working, but the entry only counts as completed, and is
          only eligible for compensation, once these are done):
          <ul className="mt-1 list-disc pl-5">
            {Object.values(e.missing).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Alert>
      )}

      <Card>
        <h2 className="font-semibold">Details</h2>
        {e.description && <p className="mt-1 text-sm text-slate-600">{e.description}</p>}
        <form
          key={e.statuses.join() + e.files.length + (e.decisionMakerName ?? "")}
          onSubmit={onSave}
          className="mt-4 space-y-4"
          noValidate
        >
          <label className="block text-sm">
            Sector / client type
            <select
              name="clientType"
              defaultValue={e.clientType ?? ""}
              disabled={!editable}
              className={`${input} ${shown.clientType ? bad : ""}`}
            >
              <option value="">Select...</option>
              {CLIENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {hint("clientType")}
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              Decision maker name
              <input
                name="decisionMakerName"
                defaultValue={e.decisionMakerName ?? ""}
                disabled={!editable}
                maxLength={255}
                className={`${input} ${shown.decisionMakerName ? bad : ""}`}
              />
              {hint("decisionMakerName")}
            </label>
            <label className="block text-sm">
              Job title
              <input
                name="jobTitle"
                defaultValue={e.jobTitle ?? ""}
                disabled={!editable}
                maxLength={255}
                className={`${input} ${shown.jobTitle ? bad : ""}`}
              />
              {hint("jobTitle")}
            </label>
          </div>
          <fieldset className={`rounded border p-3 ${shown.contacts ? bad : "border-slate-200"}`}>
            <legend className="px-1 text-sm font-medium">Contacts</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                Emails (comma or new line)
                <textarea
                  name="emails"
                  rows={2}
                  defaultValue={e.contacts.emails.join("\n")}
                  disabled={!editable}
                  className={input}
                />
              </label>
              <label className="block text-sm">
                Phones (+254...)
                <textarea
                  name="phones"
                  rows={2}
                  defaultValue={e.contacts.phones.join("\n")}
                  disabled={!editable}
                  className={input}
                />
              </label>
              <label className="block text-sm">
                Social (one per line, "instagram: @handle")
                <textarea
                  name="social"
                  rows={2}
                  defaultValue={Object.entries(e.contacts.social)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join("\n")}
                  disabled={!editable}
                  className={input}
                />
              </label>
              <label className="block text-sm">
                Website
                <input
                  name="website"
                  defaultValue={e.contacts.website ?? ""}
                  disabled={!editable}
                  className={input}
                />
              </label>
            </div>
            {hint("contacts")}
          </fieldset>
          <fieldset className={`rounded border p-3 ${shown.channels ? bad : "border-slate-200"}`}>
            <legend className="px-1 text-sm font-medium">Outreach channels</legend>
            <div className="flex flex-wrap gap-4">
              {OUTREACH_CHANNELS.map((c) => (
                <label key={c} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    name="channels"
                    value={c}
                    defaultChecked={e.channels.includes(c)}
                    disabled={!editable}
                  />
                  {CHANNEL_LABELS[c]}
                </label>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-4">
              {SOCIAL_PLATFORMS.map((p) => (
                <label key={p} className="flex items-center gap-1 text-xs capitalize">
                  <input
                    type="checkbox"
                    name="socialPlatforms"
                    value={p}
                    defaultChecked={e.socialPlatforms.includes(p)}
                    disabled={!editable}
                  />
                  {p}
                </label>
              ))}
            </div>
            {hint("channels")}
          </fieldset>
          <label className="block text-sm">
            Notes
            <textarea
              name="outreachNotes"
              rows={2}
              maxLength={1000}
              defaultValue={e.outreachNotes ?? ""}
              disabled={!editable}
              className={input}
            />
          </label>
          {editable && (
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving..." : "Save"}
            </Button>
          )}
        </form>
      </Card>

      <Card>
        <h2 className="font-semibold">Evidence</h2>
        <p className="text-xs text-slate-500">JPG, PNG or PDF, up to 10 MB each.</p>
        {shown.evidence && <p className="mt-1 text-xs text-red-600">{shown.evidence}</p>}
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {e.files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                {f.name}{" "}
                <span className="text-xs text-slate-500">
                  ({Math.round(f.size / 1024)} KB, {dt(f.createdAt)})
                </span>
              </span>
              <span className="flex gap-3">
                <button
                  type="button"
                  className="text-blue-600 hover:underline"
                  onClick={() => download(f.id, f.name)}
                >
                  Download
                </button>
                {editable && (
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    onClick={() => window.confirm("Remove this file?") && remove.mutate(f.id)}
                  >
                    Remove
                  </button>
                )}
              </span>
            </li>
          ))}
          {e.files.length === 0 && (
            <li className="py-3 text-slate-500">No evidence uploaded yet.</li>
          )}
        </ul>
        {editable && (
          <div className="mt-3">
            <input
              ref={fileRef}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
              className="text-sm"
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                if (f) upload.mutate(f);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            {upload.isPending && <span className="ml-2 text-sm text-slate-500">Uploading...</span>}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold">Progress</h2>
        <ul className="mt-2 text-sm text-slate-600">
          <li>Follow-up 1: {dt(e.followup1Date)}</li>
          <li>Follow-up 2: {dt(e.followup2Date)}</li>
          <li>Follow-up 3: {dt(e.followup3Date)}</li>
          {e.callStatus && (
            <li>
              Alignment call: {e.callStatus}, {dt(e.callStartsAt)}
            </li>
          )}
        </ul>
        {editable && (
          <div className="mt-3 flex flex-wrap gap-2">
            {e.allowedNext.map((s) => (
              <Button
                key={s}
                disabled={move.isPending}
                onClick={() => {
                  if (s === "won")
                    return e.isCompleted
                      ? setClosing(true)
                      : setMsg({
                          tone: "error",
                          text: "Complete all required fields and upload evidence before closing the deal.",
                        });
                  if (
                    (s === "won" || s === "lost") &&
                    !window.confirm(`Mark this entry as ${s}? This ends the entry.`)
                  )
                    return;
                  move.mutate(s);
                }}
              >
                {STATUS_LABELS[s as keyof typeof STATUS_LABELS] ?? s}
              </Button>
            ))}
          </div>
        )}
        {closed && (
          <p className="mt-3 text-sm">
            Closed {e.wonAt ? `as won on ${dt(e.wonAt)}` : `as lost on ${dt(e.lostAt)}`}.
          </p>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Cal.com booking link: add <code>?metadata[crmEntryId]={e.id}</code> so the booking
          attaches to this entry.
        </p>
      </Card>
      {e.flaggedGenericAt && (
        <Alert tone="error">
          Outreach flagged as duplicate/generic on {dt(e.flaggedGenericAt)}. Quality points were
          voided. Reason: {e.flagReason}
        </Alert>
      )}
      {can("crm.flag") && !e.flaggedGenericAt && (
        <Card>
          <h2 className="font-semibold">Admin: quality check</h2>
          <p className="mt-1 text-sm text-slate-500">
            If this outreach was a duplicate, a generic template or copy-paste, flag it. The layered
            quality points for this gig are voided.
          </p>
          <Button
            className="mt-3"
            disabled={flag.isPending}
            onClick={() => {
              const why = window.prompt("Why is this outreach duplicate or generic?");
              if (why && why.trim().length >= 3) flag.mutate(why.trim());
            }}
          >
            Flag as generic
          </Button>
        </Card>
      )}
      {closing && <CloseDealModal entry={e} onClose={() => setClosing(false)} />}
    </div>
  );
}
