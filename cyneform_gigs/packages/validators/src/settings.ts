import { z } from "zod";

export type SettingValue = number | string | boolean | readonly number[];
export type SettingType = "number" | "text" | "boolean" | "list";

export type SettingDef = {
  key: string;
  group: string;
  label: string;
  hint?: string;
  unit?: string;
  type: SettingType;
  default: SettingValue;
  min?: number;
  max?: number;
  /** Numbers are whole by default. Set false to allow decimals (e.g. 0.5 points). */
  int?: boolean;
};

export const SETTINGS = [
  // Lead harvester (spec: harvest 8:00 AM EAT, Nairobi, next 30 days, Thunderbit limits)
  {
    key: "harvest.location",
    group: "Lead harvester",
    label: "Event location",
    type: "text",
    default: "Nairobi",
  },
  {
    key: "harvest.window_days",
    group: "Lead harvester",
    label: "Look-ahead window",
    type: "number",
    unit: "days",
    min: 1,
    max: 90,
    default: 30,
  },
  {
    key: "harvest.concurrency",
    group: "Lead harvester",
    label: "Concurrent requests",
    type: "number",
    min: 1,
    max: 5,
    default: 2,
  },
  {
    key: "harvest.delay_ms",
    group: "Lead harvester",
    label: "Delay between requests",
    type: "number",
    unit: "ms",
    min: 0,
    max: 10000,
    default: 1000,
  },
  {
    key: "harvest.timeout_s",
    group: "Lead harvester",
    label: "Request timeout",
    type: "number",
    unit: "seconds",
    min: 5,
    max: 120,
    default: 30,
  },
  {
    key: "harvest.retries",
    group: "Lead harvester",
    label: "Retries per request",
    type: "number",
    min: 0,
    max: 5,
    default: 3,
  },
  {
    key: "harvest.error_alert_pct",
    group: "Lead harvester",
    label: "Alert above error rate",
    type: "number",
    unit: "%",
    min: 1,
    max: 100,
    default: 20,
  },
  {
    key: "harvest.max_pages",
    group: "Lead harvester",
    label: "Page cap per run",
    hint: "Safety limit per source for each run",
    type: "number",
    min: 1,
    max: 500,
    default: 50,
  },
  // Lead pool
  {
    key: "leads.page_size",
    group: "Lead pool",
    label: "Leads per page",
    type: "number",
    min: 10,
    max: 200,
    default: 50,
  },
  {
    key: "leads.claim_minutes",
    group: "Lead pool",
    label: "Claim timer",
    type: "number",
    unit: "minutes",
    min: 5,
    max: 240,
    default: 30,
  },
  {
    key: "leads.max_active_claims",
    group: "Lead pool",
    label: "Active claims per BDP",
    hint: "How many unsent claims one BDP can hold at once",
    type: "number",
    min: 1,
    max: 10,
    default: 1,
  },
  {
    key: "leads.archive_after_days",
    group: "Lead pool",
    label: "Archive new leads after",
    type: "number",
    unit: "days",
    min: 1,
    max: 365,
    default: 30,
  },
  {
    key: "leads.delete_archived_after_days",
    group: "Lead pool",
    label: "Delete archived leads after",
    type: "number",
    unit: "days",
    min: 1,
    max: 730,
    default: 90,
  },
  // Follow-ups
  {
    key: "followups.days",
    group: "Follow-ups",
    label: "Follow-up schedule",
    hint: "Days after the first pitch, comma separated. Weekends move to Monday.",
    type: "list",
    unit: "days",
    min: 1,
    max: 60,
    default: [4, 5, 7],
  },
  // Points
  {
    key: "points.kes_per_point",
    group: "Points",
    label: "Value of one point",
    type: "number",
    unit: "KES",
    min: 1,
    max: 100000,
    default: 500,
  },
  {
    key: "points.expiry_days",
    group: "Points",
    label: "Points expire after",
    type: "number",
    unit: "days",
    min: 1,
    max: 730,
    default: 75,
  },
  {
    key: "points.rollover_days",
    group: "Points",
    label: "Rollover window",
    type: "number",
    unit: "days",
    min: 0,
    max: 365,
    default: 30,
  },
  // Compensation
  {
    key: "compensation.tier_limits",
    group: "Compensation",
    label: "Commission tier upper limits",
    hint: "Monthly cumulative revenue where tiers 1, 2 and 3 end, ascending.",
    type: "list",
    unit: "KES",
    min: 1,
    max: 1_000_000_000,
    default: [500_000, 1_000_000, 2_000_000],
  },
  {
    key: "compensation.tier_rates",
    group: "Compensation",
    label: "Commission rates for tiers 1 to 4",
    hint: "Four percentages, one per tier.",
    type: "list",
    unit: "%",
    min: 0,
    max: 100,
    default: [25, 30, 35, 40],
  },
  {
    key: "compensation.cap_phase1",
    group: "Compensation",
    label: "Revenue cap, phase 1",
    type: "number",
    unit: "%",
    min: 1,
    max: 100,
    default: 30,
  },
  {
    key: "compensation.cap_phase2",
    group: "Compensation",
    label: "Revenue cap, phase 2",
    type: "number",
    unit: "%",
    min: 1,
    max: 100,
    default: 35,
  },
  {
    key: "compensation.cap_phase3",
    group: "Compensation",
    label: "Revenue cap, phase 3 (elite)",
    type: "number",
    unit: "%",
    min: 1,
    max: 100,
    default: 40,
  },
  {
    key: "compensation.phase2_revenue",
    group: "Compensation",
    label: "Annual revenue that unlocks phase 2",
    type: "number",
    unit: "KES",
    min: 1,
    max: 1_000_000_000,
    default: 5_000_000,
  },
  // Activity
  {
    key: "inactivity.business_days",
    group: "Activity",
    label: "Freeze after inactivity",
    hint: "Warnings go out two days and one day before",
    type: "number",
    unit: "business days",
    min: 3,
    max: 30,
    default: 7,
  },
] as const satisfies readonly SettingDef[];

export type SettingKey = (typeof SETTINGS)[number]["key"];

/** Validates one setting's value against its definition. */
export function settingSchema(def: SettingDef): z.ZodType<SettingValue> {
  if (def.type === "boolean") return z.boolean();
  if (def.type === "text") return z.string().trim().min(1, "Required").max(200);
  const base = z
    .number({ error: "Enter a number" })
    .min(def.min ?? 0)
    .max(def.max ?? 1_000_000);
  const num = def.int === false ? base : base.int("Whole numbers only");
  return def.type === "list" ? z.array(num).min(1, "Enter at least one value").max(10) : num;
}

const SettingValueSchema = z.union([
  z.number(),
  z.string(),
  z.boolean(),
  z.array(z.number()).readonly(),
]);

export const SettingItemSchema = z.object({
  key: z.string(),
  group: z.string(),
  label: z.string(),
  hint: z.string().nullable(),
  unit: z.string().nullable(),
  type: z.enum(["number", "text", "boolean", "list"]),
  min: z.number().nullable(),
  max: z.number().nullable(),
  value: SettingValueSchema,
  isDefault: z.boolean(),
  updatedAt: z.string().nullable(),
});

export const UpdateSettingsSchema = z.object({
  values: z.record(z.string(), SettingValueSchema),
  reason: z.string().trim().min(3, "Give a short reason").max(500),
});

export const SettingsHistoryItemSchema = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
  from: SettingValueSchema.nullable(),
  to: SettingValueSchema,
  reason: z.string(),
  createdAt: z.string(),
});
