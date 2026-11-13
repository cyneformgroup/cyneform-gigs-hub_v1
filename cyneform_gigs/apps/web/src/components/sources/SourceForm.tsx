import type { PreviewResult, SourceItem } from "@cyneform/types";
import { SCHEDULE_PRESETS, SOURCE_STRATEGIES, SourceInputSchema } from "@cyneform/validators";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api, messageOf } from "../../lib/api";
import { Alert, Button, Card, Field, SelectField } from "../ui";

const area = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm";
const presetOf = (cron: string | null) =>
  !cron
    ? "manual"
    : (Object.entries(SCHEDULE_PRESETS).find(([, v]) => v === cron)?.[0] ?? "custom");

function buildInput(f: FormData, strategy: string, schedule: string): Record<string, unknown> {
  const s = (k: string) => String(f.get(k) ?? "").trim() || undefined;
  const list = (k: string, sep: RegExp) =>
    String(f.get(k) ?? "")
      .split(sep)
      .map((x) => x.trim())
      .filter(Boolean);
  const config =
    strategy === "jsonld"
      ? { strategy, linkSelector: s("linkSelector") }
      : strategy === "ical"
        ? { strategy }
        : {
            strategy,
            itemSelector: s("itemSelector"),
            nextSelector: s("nextSelector"),
            fields: {
              title: s("f.title"),
              link: s("f.link"),
              date: s("f.date"),
              venue: s("f.venue"),
              description: s("f.description"),
              organizer: s("f.organizer"),
              price: s("f.price"),
              contact: s("f.contact"),
            },
          };
  return {
    name: s("name") ?? "",
    startUrls: list("startUrls", /\s+/),
    category: s("category"),
    schedule:
      schedule === "manual"
        ? null
        : schedule === "custom"
          ? (s("cron") ?? "")
          : SCHEDULE_PRESETS[schedule as keyof typeof SCHEDULE_PRESETS],
    includeKeywords: list("include", /,/),
    excludeKeywords: list("exclude", /,/),
    maxPages: s("maxPages") ? Number(s("maxPages")) : undefined,
    enabled: f.has("enabled"),
    autoPublish: f.has("autoPublish"),
    tosChecked: f.has("tosChecked"),
    tosNote: s("tosNote"),
    config,
  };
}

export function SourceForm({ initial, onDone }: { initial?: SourceItem; onDone: () => void }) {
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);
  const [strategy, setStrategy] = useState<string>(initial?.config.strategy ?? "jsonld");
  const [schedule, setSchedule] = useState(presetOf(initial?.schedule ?? null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const sel = initial?.config.strategy === "selectors" ? initial.config : undefined;
  const jl = initial?.config.strategy === "jsonld" ? initial.config : undefined;
  const err = (k: string) =>
    Object.entries(errors).find(([p]) => p === k || p.startsWith(`${k}.`))?.[1];

  const test = useMutation({
    mutationFn: (body: unknown) => api<PreviewResult>("/sources/test", { method: "POST", body }),
    onSuccess: setPreview,
  });
  const save = useMutation({
    mutationFn: (body: unknown) =>
      api<SourceItem>(initial ? `/sources/${initial.id}` : "/sources", {
        method: initial ? "PUT" : "POST",
        body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sources"] });
      onDone();
    },
  });

  function validate(forTest: boolean) {
    if (!formRef.current) return null;
    const raw = buildInput(new FormData(formRef.current), strategy, schedule);
    const parsed = SourceInputSchema.safeParse(forTest ? { ...raw, enabled: false } : raw);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
      return null;
    }
    setErrors({});
    return parsed.data;
  }

  const fieldRow = (key: string, label: string, hint?: string) => (
    <Field
      key={key}
      label={label}
      name={`f.${key}`}
      defaultValue={sel?.fields[key as "title"]}
      error={err(`config.fields.${key}`)}
      hint={hint}
    />
  );

  return (
    <Card className="mb-6">
      <h2 className="font-semibold">{initial ? "Edit source" : "Add source"}</h2>
      <form
        ref={formRef}
        noValidate
        className="mt-4 grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = validate(false);
          if (v) save.mutate(v);
        }}
      >
        <Field label="Name" name="name" defaultValue={initial?.name} error={err("name")} />
        <Field
          label="Category"
          name="category"
          defaultValue={initial?.category ?? ""}
          hint="Label applied to gigs from this source"
        />
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium" htmlFor="startUrls">
            Links to scrape (one per line, https only)
          </label>
          <textarea
            id="startUrls"
            name="startUrls"
            rows={3}
            className={area}
            defaultValue={initial?.startUrls.join("\n")}
          />
          {err("startUrls") && <p className="mt-1 text-xs text-red-600">{err("startUrls")}</p>}
        </div>

        <SelectField
          label="Extraction method"
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
          hint="jsonld = structured data, ical = calendar feed, selectors = CSS"
        >
          {SOURCE_STRATEGIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectField>
        {strategy === "jsonld" && (
          <Field
            label="Event link selector (optional)"
            name="linkSelector"
            defaultValue={jl?.linkSelector ?? ""}
            hint="For listing pages: CSS for links to event pages, e.g. a.event-card"
            error={err("config.linkSelector")}
          />
        )}
        {strategy === "selectors" && (
          <>
            <Field
              label="Item selector"
              name="itemSelector"
              defaultValue={sel?.itemSelector}
              error={err("config.itemSelector")}
              hint="One match per event card"
            />
            <Field
              label="Next page selector (optional)"
              name="nextSelector"
              defaultValue={sel?.nextSelector ?? ""}
              hint="e.g. a.next@href"
            />
            {fieldRow("title", "Title selector")}
            {fieldRow("date", "Date selector", "Prefer time@datetime")}
            {fieldRow("link", "Link selector", "e.g. a@href")}
            {fieldRow("venue", "Venue selector")}
            {fieldRow("description", "Description selector")}
            {fieldRow("organizer", "Organizer selector")}
            {fieldRow("price", "Price selector")}
            {fieldRow("contact", "Contact selector")}
          </>
        )}

        <Field
          label="Include keywords"
          name="include"
          defaultValue={initial?.includeKeywords.join(", ")}
          hint="Comma separated. Empty = keep all. Add Nairobi for mixed-city sites."
        />
        <Field
          label="Exclude keywords"
          name="exclude"
          defaultValue={initial?.excludeKeywords.join(", ")}
          hint="Comma separated"
        />
        <SelectField
          label="Schedule (Nairobi time)"
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
        >
          <option value="manual">Manual only</option>
          <option value="hourly">Hourly</option>
          <option value="daily">Daily 8:00 AM</option>
          <option value="weekly">Weekly Monday 8:00 AM</option>
          <option value="custom">Custom cron</option>
        </SelectField>
        {schedule === "custom" ? (
          <Field
            label="Cron"
            name="cron"
            defaultValue={initial?.schedule ?? ""}
            error={err("schedule")}
            hint="e.g. 0 8,17 * * 1-5 (min 15 min apart)"
          />
        ) : (
          <Field
            label="Max pages per run (optional)"
            name="maxPages"
            defaultValue={initial?.maxPages ?? ""}
          />
        )}

        <div className="space-y-2 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={initial?.enabled ?? true} />{" "}
            Enabled
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="autoPublish"
              defaultChecked={initial?.autoPublish ?? false}
            />{" "}
            Auto-publish (skip review and make gigs claimable immediately)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="tosChecked" defaultChecked={!!initial?.tosCheckedAt} /> I
            checked this site’s terms and robots.txt allow this
          </label>
          {err("tosChecked") && <p className="text-xs text-red-600">{err("tosChecked")}</p>}
        </div>
        <Field
          label="Terms note (optional)"
          name="tosNote"
          defaultValue={initial?.tosNote ?? ""}
          hint="e.g. permission email, date checked"
        />

        <div className="space-y-2 sm:col-span-2 empty:hidden">
          {(test.error || save.error) && (
            <Alert tone="error">{messageOf(test.error ?? save.error)}</Alert>
          )}
        </div>
        <div className="flex gap-3 sm:col-span-2">
          <Button
            type="button"
            variant="secondary"
            disabled={test.isPending}
            onClick={() => {
              const v = validate(true);
              if (v) test.mutate(v);
            }}
          >
            {test.isPending ? "Testing…" : "Test"}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>

      {preview && (
        <div className="mt-6 border-t border-slate-100 pt-4 text-sm">
          <p className="font-medium">
            {preview.pages} page(s) read · {preview.acceptedTotal} gig(s) would be added ·{" "}
            {preview.rejectedTotal} rejected
            {preview.blocked && <span className="text-red-600"> · site blocked access</span>}
          </p>
          <ul className="mt-2 divide-y divide-slate-100">
            {preview.accepted.map((g) => (
              <li key={g.url + g.title} className="py-1.5">
                <span className="font-medium">{g.title}</span>
                <span className="text-slate-500">
                  {" "}
                  · {new Date(g.startsAt).toLocaleString("en-KE")}
                  {g.venue ? ` · ${g.venue}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {preview.rejected.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-slate-600">
                Rejected ({preview.rejectedTotal})
              </summary>
              <ul className="mt-1 text-xs text-slate-500">
                {preview.rejected.map((r) => (
                  <li key={r.title + r.reason}>
                    {r.title}: {r.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {preview.errors.length > 0 && (
            <ul className="mt-3 text-xs text-red-600">
              {preview.errors.map((e) => (
                <li key={e.url + e.message}>
                  {e.stage}: {e.message} ({e.url})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
