import type { SettingItem, SettingsHistoryItem, UpdateSettingsInput } from "@cyneform/types";
import { SETTINGS, settingSchema } from "@cyneform/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Alert, Button, Card, Field } from "../components/ui";
import { api, messageOf } from "../lib/api";
import { useAuth } from "../lib/auth";

const show = (i: Pick<SettingItem, "type" | "value">) =>
  i.type === "list" ? (i.value as readonly number[]).join(", ") : String(i.value);

function parse(item: SettingItem, form: FormData): unknown {
  const raw = form.get(item.key);
  switch (item.type) {
    case "boolean":
      return form.has(item.key);
    case "number":
      return raw === null || raw === "" ? Number.NaN : Number(raw);
    case "list":
      return String(raw ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number);
    default:
      return String(raw ?? "");
  }
}

export function Settings() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const editable = can("settings.manage");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<SettingItem[]>("/settings"),
  });
  const history = useQuery({
    queryKey: ["settings-history"],
    queryFn: () => api<SettingsHistoryItem[]>("/settings/history"),
  });
  const save = useMutation({
    mutationFn: (body: UpdateSettingsInput) =>
      api<SettingItem[]>("/settings", { method: "PUT", body }),
    onSuccess: (data) => {
      queryClient.setQueryData(["settings"], data);
      queryClient.invalidateQueries({ queryKey: ["settings-history"] });
    },
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!settings.data) return;
    const form = new FormData(e.currentTarget);
    const values: UpdateSettingsInput["values"] = {};
    const found: Record<string, string> = {};

    for (const item of settings.data) {
      const value = parse(item, form);
      const def = SETTINGS.find((d) => d.key === item.key);
      const result = def ? settingSchema(def).safeParse(value) : null;
      if (result && !result.success) {
        found[item.key] = result.error.issues[0]?.message ?? "Invalid value";
      } else if (result && JSON.stringify(result.data) !== JSON.stringify(item.value)) {
        values[item.key] = result.data;
      }
    }
    setErrors(found);
    if (Object.keys(found).length) return setFormError("Fix the highlighted fields.");
    if (Object.keys(values).length === 0) return setFormError("You have not changed anything.");
    const reason = String(form.get("__reason") ?? "").trim();
    if (reason.length < 3) return setFormError("Give a short reason for the change.");
    setFormError(null);
    save.mutate({ values, reason });
  }

  const groups = [...new Set(settings.data?.map((i) => i.group))];

  return (
    <div>
      <h1 className="text-xl font-semibold">System settings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Business rules used across the system. Changes apply to new activity going forward.
      </p>

      {settings.data && (
        <form
          key={settings.data.map((i) => i.updatedAt).join()}
          onSubmit={onSubmit}
          noValidate
          className="mt-6 space-y-6"
        >
          {groups.map((group) => (
            <Card key={group}>
              <h2 className="font-semibold">{group}</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {settings.data
                  .filter((i) => i.group === group)
                  .map((i) =>
                    i.type === "boolean" ? (
                      <label key={i.key} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name={i.key}
                          defaultChecked={i.value === true}
                          disabled={!editable}
                        />
                        {i.label}
                      </label>
                    ) : (
                      <Field
                        key={i.key}
                        label={i.unit ? `${i.label} (${i.unit})` : i.label}
                        name={i.key}
                        defaultValue={show(i)}
                        disabled={!editable}
                        error={errors[i.key]}
                        hint={i.hint ?? (i.isDefault ? "Default value" : "Customised")}
                      />
                    ),
                  )}
              </div>
            </Card>
          ))}

          {editable && (
            <Card>
              <Field
                label="Reason for change"
                name="__reason"
                hint="Recorded in the history and audit log"
              />
              <div className="mt-4 space-y-2 empty:hidden">
                {(formError || save.error) && (
                  <Alert tone="error">{formError ?? messageOf(save.error)}</Alert>
                )}
                {save.isSuccess && !formError && <Alert tone="success">Settings saved.</Alert>}
              </div>
              <div className="mt-4">
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </Card>
          )}
        </form>
      )}

      <Card className="mt-6">
        <h2 className="font-semibold">Recent changes</h2>
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {history.data?.map((h) => (
            <li key={h.id} className="py-2">
              <span className="font-medium">{h.label}</span>:{" "}
              {h.from === null ? "default" : String(h.from)} → {String(h.to)}
              <span className="block text-xs text-slate-500">
                {h.reason} · {new Date(h.createdAt).toLocaleString("en-KE")}
              </span>
            </li>
          ))}
          {history.data?.length === 0 && <li className="py-2 text-slate-500">No changes yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
