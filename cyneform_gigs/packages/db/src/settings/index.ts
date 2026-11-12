import { SETTINGS, type SettingKey, type SettingValue } from "@cyneform/validators";
import { db } from "../client";
import { systemSettings } from "./schema";

const TTL_MS = 15_000;
let cache: { at: number; map: Map<SettingKey, SettingValue> } | null = null;

export async function loadSettings(): Promise<Map<SettingKey, SettingValue>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  const map = new Map<SettingKey, SettingValue>(SETTINGS.map((d) => [d.key, d.default] as const));
  for (const row of await db.select().from(systemSettings)) {
    if (map.has(row.key as SettingKey)) map.set(row.key as SettingKey, JSON.parse(row.value));
  }
  cache = { at: Date.now(), map };
  return map;
}

/** Call after a write so this process sees it at once (other processes catch up within 15s). */
export const invalidateSettings = () => {
  cache = null;
};

export async function getSetting(key: SettingKey): Promise<SettingValue> {
  return (await loadSettings()).get(key) as SettingValue;
}
export async function getNumber(key: SettingKey): Promise<number> {
  return Number(await getSetting(key));
}
export async function getNumberList(key: SettingKey): Promise<number[]> {
  return [...((await getSetting(key)) as readonly number[])];
}
