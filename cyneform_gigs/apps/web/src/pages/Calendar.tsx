import type { BdpOption, MeetingItem } from "@cyneform/types";
import { MEETING_DURATIONS, RECURRENCES } from "@cyneform/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Alert, Badge, Button, Card } from "../components/ui";
import { api, messageOf } from "../lib/api";
import { useAuth } from "../lib/auth";

const field = "w-full rounded border border-slate-300 px-3 py-2 text-sm";
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    dateStyle: "medium",
    timeStyle: "short",
  });
export function Calendar() {
  const { can, user } = useAuth();
  const manage = can("calendar.manage");
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [repeat, setRepeat] = useState("none");
  const meetings = useQuery({
    queryKey: ["calendar"],
    queryFn: () => api<MeetingItem[]>("/calendar"),
  });
  const bdps = useQuery({
    queryKey: ["points-bdps"],
    queryFn: () => api<BdpOption[]>("/points/bdps"),
    enabled: manage,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["calendar"] });
  const create = useMutation({
    mutationFn: (body: unknown) => api<{ count: number }>("/calendar", { method: "POST", body }),
    onSuccess: (r) => {
      setMessage(`Scheduled ${r.count} meeting(s). Invitations sent.`);
      refresh();
    },
    onError: (e) => setMessage(messageOf(e)),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api<void>(`/calendar/${id}/cancel`, { method: "POST" }),
    onSuccess: () => {
      setMessage("Meeting cancelled.");
      refresh();
    },
    onError: (e) => setMessage(messageOf(e)),
  });
  const mark = useMutation({
    mutationFn: (v: { id: string; userId: string; attended: boolean }) =>
      api<void>(`/calendar/${v.id}/attendance`, {
        method: "POST",
        body: { userId: v.userId, attended: v.attended },
      }),
    onSuccess: () => {
      setMessage("Attendance saved.");
      refresh();
    },
    onError: (e) => setMessage(messageOf(e)),
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const local = String(f.get("startsAt"));
    const recurrence = String(f.get("recurrence"));
    create.mutate({
      title: String(f.get("title")),
      description: String(f.get("description") || "") || undefined,
      agenda: String(f.get("agenda") || "") || undefined,
      startsAt: new Date(`${local}:00+03:00`).toISOString(),
      durationMin: Number(f.get("durationMin")),
      link: String(f.get("link") || "") || undefined,
      allBdps: f.get("audience") === "all",
      attendeeIds: f.getAll("attendeeIds").map(String),
      reminderMinutes: Number(f.get("reminderMinutes")),
      recurrence,
      occurrences: recurrence === "none" ? undefined : Number(f.get("occurrences")),
    });
  }
  const now = Date.now();
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">Calendar</h1>
      {message && <Alert tone="success">{message}</Alert>}
      {manage && (
        <Card>
          <h2 className="font-semibold">Schedule a meeting</h2>
          <form onSubmit={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              name="title"
              minLength={3}
              required
              placeholder="Title"
              className={`${field} sm:col-span-2`}
            />
            <label className="text-sm">
              Start (EAT)
              <input name="startsAt" type="datetime-local" required className={field} />
            </label>
            <label className="text-sm">
              Duration
              <select name="durationMin" defaultValue={30} className={field}>
                {MEETING_DURATIONS.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <textarea name="agenda" placeholder="Agenda" className={`${field} sm:col-span-2`} />
            <input
              name="description"
              placeholder="Description"
              className={`${field} sm:col-span-2`}
            />
            <input
              name="link"
              type="url"
              placeholder="Link (auto-generated if empty)"
              className={`${field} sm:col-span-2`}
            />
            <label className="text-sm">
              Reminder minutes
              <input
                name="reminderMinutes"
                type="number"
                defaultValue={60}
                min={0}
                max={1440}
                className={field}
              />
            </label>
            <label className="text-sm">
              Repeat
              <select
                name="recurrence"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                className={field}
              >
                {RECURRENCES.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            {repeat !== "none" && (
              <label className="text-sm">
                Occurrences
                <input
                  name="occurrences"
                  type="number"
                  min={2}
                  max={26}
                  defaultValue={4}
                  className={field}
                />
              </label>
            )}
            <fieldset className="sm:col-span-2 text-sm">
              <label className="mr-4">
                <input type="radio" name="audience" value="all" defaultChecked /> All active BDPs
              </label>
              <label>
                <input type="radio" name="audience" value="selected" /> Selected BDPs
              </label>
              <div className="mt-2 grid max-h-36 gap-1 overflow-auto sm:grid-cols-2">
                {bdps.data?.map((b) => (
                  <label key={b.id}>
                    <input type="checkbox" name="attendeeIds" value={b.id} /> {b.fullName}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="sm:col-span-2">
              <Button disabled={create.isPending}>Schedule and notify</Button>
            </div>
          </form>
        </Card>
      )}
      <Card>
        <h2 className="font-semibold">Upcoming meetings</h2>
        <ul className="divide-y">
          {meetings.data?.map((m) => {
            const start = new Date(m.startsAt).getTime();
            const active =
              !m.cancelled && now >= start && now <= start + (m.durationMin + 30) * 60_000;
            return (
              <li key={m.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <b>{m.title}</b> {m.cancelled && <Badge value="cancelled" />}
                    <span className="block text-xs text-slate-500">
                      {when(m.startsAt)} EAT · {m.durationMin} min
                      {m.recurrence !== "none" ? ` · repeats ${m.recurrence}` : ""}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    {!m.cancelled && (
                      <a
                        href={m.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 underline"
                      >
                        Join
                      </a>
                    )}
                    {m.myStatus && <Badge value={m.myStatus} />}
                    {active && m.myStatus === "pending" && user && (
                      <Button
                        onClick={() => mark.mutate({ id: m.id, userId: user.id, attended: true })}
                      >
                        I attended
                      </Button>
                    )}
                    {manage && !m.cancelled && (
                      <Button
                        onClick={() =>
                          window.confirm("Cancel this meeting?") && cancel.mutate(m.id)
                        }
                      >
                        Cancel
                      </Button>
                    )}
                  </span>
                </div>
                {m.agenda && <p className="mt-1 whitespace-pre-line text-xs">{m.agenda}</p>}
                {manage && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {m.attendees.map((a) => (
                      <li
                        key={a.userId}
                        className="flex items-center gap-1 rounded bg-slate-50 px-2 py-1 text-xs"
                      >
                        {a.name} <Badge value={a.status} />
                        <button
                          type="button"
                          className="text-blue-700 underline"
                          onClick={() =>
                            mark.mutate({ id: m.id, userId: a.userId, attended: true })
                          }
                        >
                          attended
                        </button>
                        <button
                          type="button"
                          className="text-blue-700 underline"
                          onClick={() =>
                            mark.mutate({ id: m.id, userId: a.userId, attended: false })
                          }
                        >
                          absent
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
          {meetings.data?.length === 0 && (
            <li className="py-5 text-center text-slate-500">No meetings in the next 60 days.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
