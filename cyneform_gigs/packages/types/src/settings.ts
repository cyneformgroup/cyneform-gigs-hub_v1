import type {
  SettingItemSchema,
  SettingsHistoryItemSchema,
  UpdateSettingsSchema,
} from "@cyneform/validators";
import type { z } from "zod";

export type { SettingKey, SettingValue } from "@cyneform/validators";
export type SettingItem = z.infer<typeof SettingItemSchema>;
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;
export type SettingsHistoryItem = z.infer<typeof SettingsHistoryItemSchema>;
