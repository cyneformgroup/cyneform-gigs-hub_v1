import { db, desc, eq, invalidateSettings, settingsHistory, systemSettings } from "@cyneform/db";
import type { SettingItem, SettingsHistoryItem, UpdateSettingsInput } from "@cyneform/types";
import { SETTINGS, type SettingDef, type SettingValue, settingSchema } from "@cyneform/validators";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthUser } from "../access/auth-user";
import { AuditService } from "../audit/audit.service";
import type { ClientInfo } from "../common/client-info";
import { badRequest } from "../common/errors";

const DEFS = new Map<string, SettingDef>(SETTINGS.map((d) => [d.key, d] as const));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

@Injectable()
export class SettingsService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  async list(): Promise<SettingItem[]> {
    const rows = new Map((await db.select().from(systemSettings)).map((r) => [r.key, r] as const));
    return SETTINGS.map((d) => {
      const row = rows.get(d.key);
      return {
        key: d.key,
        group: d.group,
        label: d.label,
        hint: "hint" in d ? d.hint : null,
        unit: "unit" in d ? d.unit : null,
        type: d.type,
        min: "min" in d ? d.min : null,
        max: "max" in d ? d.max : null,
        value: row ? JSON.parse(row.value) : d.default,
        isDefault: !row,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    });
  }

  async update(
    input: UpdateSettingsInput,
    actor: AuthUser,
    client?: ClientInfo,
  ): Promise<SettingItem[]> {
    const current = new Map((await this.list()).map((i) => [i.key, i.value] as const));
    const changes: {
      key: string;
      from: SettingValue | undefined;
      to: SettingValue;
    }[] = [];

    for (const [key, raw] of Object.entries(input.values)) {
      const def = DEFS.get(key);
      if (!def) throw badRequest("UNKNOWN_SETTING", `Unknown setting: ${key}`);
      const parsed = settingSchema(def).safeParse(raw);
      if (!parsed.success)
        throw badRequest(
          "INVALID_SETTING",
          `${def.label}: ${parsed.error.issues[0]?.message ?? "invalid value"}`,
        );
      if (!same(parsed.data, current.get(key)))
        changes.push({ key, from: current.get(key), to: parsed.data });
    }
    if (changes.length === 0) throw badRequest("NO_CHANGE", "Nothing to update.");

    await db.transaction(async (tx) => {
      for (const c of changes) {
        const value = JSON.stringify(c.to);
        await tx
          .insert(systemSettings)
          .values({ key: c.key, value, updatedBy: actor.id })
          .onDuplicateKeyUpdate({
            set: { value, updatedBy: actor.id, updatedAt: new Date() },
          });
        await tx.insert(settingsHistory).values({
          key: c.key,
          oldValue: c.from === undefined ? null : JSON.stringify(c.from),
          newValue: value,
          reason: input.reason,
          changedBy: actor.id,
        });
      }
    });
    invalidateSettings();
    await this.audit.record({
      actor,
      action: "settings.updated",
      targetType: "settings",
      targetId: "system_settings",
      details: { reason: input.reason, changes },
      client,
    });
    return this.list();
  }

  async history(key?: string): Promise<SettingsHistoryItem[]> {
    const rows = await db
      .select()
      .from(settingsHistory)
      .where(key ? eq(settingsHistory.key, key) : undefined)
      .orderBy(desc(settingsHistory.createdAt))
      .limit(30);
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      label: DEFS.get(r.key)?.label ?? r.key,
      from: r.oldValue === null ? null : JSON.parse(r.oldValue),
      to: JSON.parse(r.newValue),
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
