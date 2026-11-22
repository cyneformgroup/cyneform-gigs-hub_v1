import type { RulesView, RuleVersionItem, SettingItem, UpdateRulesInput } from "@cyneform/types";
import { UpdateRulesSchema } from "@cyneform/validators";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { Alert, Button, Card } from "../components/ui";
import { api, messageOf } from "../lib/api";
import { useAuth } from "../lib/auth";

type Edit = { points?: number; enabled?: boolean; verificationRequired?: boolean };

export function PointsRules() {
  const { can } = useAuth();
  const editable = can("rules.manage");
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [schemeEdits, setSchemeEdits] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const view = useQuery({
    queryKey: ["points-rules"],
    queryFn: () => api<RulesView>("/points/rules"),
  });
  const versions = useQuery({
    queryKey: ["points-versions"],
    queryFn: () => api<RuleVersionItem[]>("/points/rules/versions"),
  });
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<SettingItem[]>("/settings"),
    retry: false,
  });
  const kes = Number(
    settings.data?.find((setting) => setting.key === "points.kes_per_point")?.value ?? 500,
  );

  const refresh = (data: RulesView) => {
    queryClient.setQueryData(["points-rules"], data);
    queryClient.invalidateQueries({ queryKey: ["points-versions"] });
    setEdits({});
    setSchemeEdits({});
    setReason("");
    setFormError(null);
  };
  const save = useMutation({
    mutationFn: (body: UpdateRulesInput) =>
      api<RulesView>("/points/rules", { method: "PUT", body }),
    onSuccess: refresh,
    onError: (error) => {
      if ((error as { code?: string }).code === "RULES_CHANGED") {
        queryClient.invalidateQueries({ queryKey: ["points-rules"] });
      }
    },
  });
  const restore = useMutation({
    mutationFn: (input: { id: string; reason: string; baseVersion: number }) =>
      api<RulesView>(`/points/rules/versions/${input.id}/restore`, {
        method: "POST",
        body: { reason: input.reason, baseVersion: input.baseVersion },
      }),
    onSuccess: refresh,
  });

  if (!view.data)
    return (
      <p className="text-sm text-slate-500">
        {view.isError ? messageOf(view.error) : "Loading..."}
      </p>
    );
  const data = view.data;
  const setRule = (key: string, patch: Edit) =>
    setEdits((current) => ({ ...current, [key]: { ...current[key], ...patch } }));

  function onSave() {
    const rules: UpdateRulesInput["rules"] = {};
    for (const rule of data.rules) {
      const edit = edits[rule.key];
      if (!edit) continue;
      const change: Edit = {};
      if (edit.points !== undefined && edit.points !== rule.points) change.points = edit.points;
      if (edit.enabled !== undefined && edit.enabled !== rule.enabled)
        change.enabled = edit.enabled;
      if (
        edit.verificationRequired !== undefined &&
        edit.verificationRequired !== rule.verificationRequired
      ) {
        change.verificationRequired = edit.verificationRequired;
      }
      if (Object.keys(change).length > 0) rules[rule.key] = change;
    }
    const schemes: Record<string, boolean> = {};
    for (const scheme of data.schemes) {
      if (schemeEdits[scheme.key] !== undefined && schemeEdits[scheme.key] !== scheme.enabled) {
        schemes[scheme.key] = schemeEdits[scheme.key];
      }
    }
    if (Object.keys(rules).length === 0 && Object.keys(schemes).length === 0) {
      setFormError("You have not changed anything.");
      return;
    }
    const parsed = UpdateRulesSchema.safeParse({
      baseVersion: data.version,
      reason: reason.trim(),
      rules,
      schemes,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check the rule values and reason.");
      return;
    }
    setFormError(null);
    save.mutate(parsed.data);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Points rules</h1>
        <p className="mt-1 text-sm text-slate-500">
          Version {data.version}. Changes apply to future awards. One point is worth{" "}
          {kes.toLocaleString("en-KE")} KES; change the value and expiry in{" "}
          <Link to="/settings" className="underline">
            Settings
          </Link>
          .
        </p>
      </div>

      {data.schemes.map((scheme) => {
        const enabled = schemeEdits[scheme.key] ?? scheme.enabled;
        const groups = [
          ...new Set(
            data.rules.filter((rule) => rule.scheme === scheme.key).map((rule) => rule.group),
          ),
        ];
        return (
          <Card key={scheme.key}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">{scheme.label}</h2>
                <p className="text-sm text-slate-500">
                  {scheme.note} Default: {scheme.key === "workflow" ? "On" : "Off"}.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={!editable}
                  onChange={(event) =>
                    setSchemeEdits((current) => ({
                      ...current,
                      [scheme.key]: event.target.checked,
                    }))
                  }
                />
                {enabled ? "On" : "Off"}
              </label>
            </div>
            {groups.map((group) => (
              <div key={group} className="mt-4">
                <h3 className="text-sm font-medium text-slate-700">{group}</h3>
                <div className="mt-2 divide-y divide-slate-100">
                  {data.rules
                    .filter((rule) => rule.scheme === scheme.key && rule.group === group)
                    .map((rule) => {
                      const edit = edits[rule.key] ?? {};
                      const points = edit.points ?? rule.points;
                      return (
                        <div
                          key={rule.key}
                          className="grid items-center gap-3 py-2 sm:grid-cols-[1fr_90px_80px_110px_110px]"
                        >
                          <span className="text-sm">{rule.label}</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="1000"
                            value={Number.isNaN(points) ? "" : points}
                            disabled={!editable}
                            onChange={(event) =>
                              setRule(rule.key, {
                                points:
                                  event.target.value === ""
                                    ? Number.NaN
                                    : Number(event.target.value),
                              })
                            }
                            className="rounded border border-slate-300 px-2 py-1 text-sm"
                            aria-label={`${rule.label} points`}
                          />
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={edit.enabled ?? rule.enabled}
                              disabled={!editable}
                              onChange={(event) =>
                                setRule(rule.key, { enabled: event.target.checked })
                              }
                            />
                            On
                          </label>
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={edit.verificationRequired ?? rule.verificationRequired}
                              disabled={!editable}
                              onChange={(event) =>
                                setRule(rule.key, {
                                  verificationRequired: event.target.checked,
                                })
                              }
                            />
                            Verify
                          </label>
                          <span className="text-xs text-slate-500">
                            {(Number.isNaN(points) ? 0 : points * kes).toLocaleString("en-KE")} KES
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </Card>
        );
      })}

      {editable && (
        <Card>
          <label className="block text-sm font-medium" htmlFor="points-reason">
            Reason for change
          </label>
          <input
            id="points-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="Recorded in rule history and the audit log"
          />
          <div className="mt-3 space-y-2 empty:hidden">
            {(formError || save.error) && (
              <Alert tone="error">{formError ?? messageOf(save.error)}</Alert>
            )}
            {save.isSuccess && !formError && (
              <Alert tone="success">Rules saved as a new version.</Alert>
            )}
          </div>
          <Button className="mt-3" onClick={onSave} disabled={save.isPending}>
            {save.isPending ? "Saving..." : "Save new version"}
          </Button>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold">Version history</h2>
        {restore.error && <Alert tone="error">{messageOf(restore.error)}</Alert>}
        <ul className="mt-3 divide-y divide-slate-100 text-sm">
          {versions.data?.map((version) => (
            <li key={version.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <b>v{version.versionNo}</b> · {version.reason}
                <span className="block text-xs text-slate-500">
                  {version.changedByName ?? "System"} ·{" "}
                  {new Date(version.createdAt).toLocaleString("en-KE")}
                </span>
              </span>
              {editable && version.versionNo !== data.version && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (
                      !window.confirm(`Restore points rules from version ${version.versionNo}?`)
                    ) {
                      return;
                    }
                    const why = window.prompt(
                      `Why restore v${version.versionNo}? This creates a new version.`,
                    );
                    if (why?.trim() && why.trim().length >= 3) {
                      restore.mutate({
                        id: version.id,
                        reason: why.trim(),
                        baseVersion: data.version,
                      });
                    }
                  }}
                >
                  Restore
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
