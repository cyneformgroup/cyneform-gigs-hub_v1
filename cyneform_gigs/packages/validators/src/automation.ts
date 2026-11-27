import { z } from "zod";

export const DATA_REQUEST_TYPES = [
  "access",
  "correction",
  "erasure",
  "objection",
  "portability",
] as const;
export const DATA_REQUEST_STATUSES = ["open", "in_progress", "completed", "rejected"] as const;

export const DeleteAccountSchema = z.object({
  confirm: z.literal("DELETE", { error: "Type DELETE to confirm" }),
  reason: z.string().trim().min(5, "Give a reason").max(500),
});
export const DeletePreviewSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  openCrmEntries: z.number(),
  claimedLeads: z.number(),
  pendingCommissions: z.number(),
  pendingCommissionAmount: z.number(),
  activePoints: z.number(),
  openBonuses: z.number(),
  hasEquity: z.boolean(),
  warnings: z.array(z.string()),
});
export const CreateDataRequestSchema = z.object({
  type: z.enum(DATA_REQUEST_TYPES),
  details: z.string().trim().min(5, "Please describe your request").max(2000),
});
export const ResolveDataRequestSchema = z.object({
  status: z.enum(["in_progress", "completed", "rejected"]),
  response: z.string().trim().min(3, "Write a response").max(2000),
});
export const DataRequestQuerySchema = z.object({
  status: z.enum(DATA_REQUEST_STATUSES).optional(),
});
export const DataRequestItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  ownerName: z.string().nullable(),
  type: z.enum(DATA_REQUEST_TYPES),
  details: z.string(),
  status: z.enum(DATA_REQUEST_STATUSES),
  dueAt: z.string(),
  overdue: z.boolean(),
  response: z.string().nullable(),
  createdAt: z.string(),
});

/** Weekdays elapsed after the EAT date of `from`, through the EAT date of `to`. */
export function businessDaysSince(from: Date, to: Date): number {
  const day = (d: Date) => Math.floor((d.getTime() + 3 * 3_600_000) / 86_400_000);
  let count = 0;
  for (let i = day(from) + 1; i <= day(to); i++) {
    const weekday = new Date(i * 86_400_000).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}
