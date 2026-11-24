import { z } from "zod";

export const EQUITY_PERCENTAGES = [10, 15] as const;
const Reason = z.string().trim().min(3, "Give a short reason").max(500);
export const GrantEquitySchema = z.object({
  userId: z.uuid(),
  percentage: z.union([z.literal(10), z.literal(15)]),
  reason: Reason,
  override: z.boolean().default(false),
});
export const MilestoneSchema = z.object({
  name: z.string().trim().min(2).max(100),
  valuation: z.number().positive().max(100_000_000_000),
  notes: z.string().trim().max(500).optional(),
});
export const PayPayoutSchema = z.object({
  reference: z.string().trim().min(3, "Enter the payment reference").max(100),
});
export const EligibilityItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  ok: z.boolean(),
  detail: z.string(),
});
export const EligibilitySchema = z.object({
  eligible: z.boolean(),
  checks: z.array(EligibilityItemSchema),
});
export const GrantItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  ownerName: z.string().nullable(),
  percentage: z.number(),
  grantDate: z.string(),
  cliffDate: z.string(),
  baselineValuation: z.number(),
  vestedPercent: z.number(),
  nextMilestone: z.number().nullable(),
});
export const MilestoneItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  valuation: z.number(),
  reachedAt: z.string(),
  notes: z.string().nullable(),
});
export const PayoutItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  ownerName: z.string().nullable(),
  milestoneName: z.string(),
  valuation: z.number(),
  vestedPercent: z.number(),
  amount: z.number(),
  status: z.enum(["pending", "paid"]),
  paymentReference: z.string().nullable(),
  createdAt: z.string(),
});
export const MyEquitySchema = z.object({
  grant: GrantItemSchema.nullable(),
  payouts: z.array(PayoutItemSchema),
});

export function fullYears(from: Date, to: Date): number {
  let years = to.getUTCFullYear() - from.getUTCFullYear();
  const anniversary = new Date(
    Date.UTC(
      to.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
  if (to < anniversary) years--;
  return Math.max(0, years);
}
export const vestedPercent = (grantDate: Date, at: Date) =>
  Math.min(100, fullYears(grantDate, at) * 25);
export const equityPayout = (pct: number, vested: number, valuation: number, baseline: number) =>
  Math.max(0, Math.round((pct / 100) * (vested / 100) * (valuation - baseline) * 100) / 100);
