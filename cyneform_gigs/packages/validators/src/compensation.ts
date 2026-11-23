import { z } from "zod";

export const CLIENT_PAYMENT_STATUSES = ["fully_paid", "not_paid"] as const;
export const PAYMENT_STATUSES = ["pending", "approved", "paid"] as const;
export const ROLLOVER_STATUSES = ["active", "applied", "expired"] as const;

const Money = z
  .number()
  .positive("Project value must be a positive number")
  .max(1_000_000_000, "That value is too large")
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "At most 2 decimal places");

export const CloseDealSchema = z.object({
  projectValue: Money,
  clientPaymentStatus: z.enum(CLIENT_PAYMENT_STATUSES, { error: "Select a payment status" }),
});
export const ApproveDealSchema = z.object({ note: z.string().trim().max(500).optional() });
export const PayDealSchema = z.object({
  reference: z.string().trim().min(3, "Enter the payment reference").max(100),
  note: z.string().trim().max(500).optional(),
});
export const EliteSchema = z.object({
  userId: z.uuid(),
  elite: z.boolean(),
  reason: z.string().trim().min(3, "Give a short reason").max(500),
});
export const DealQuerySchema = z.object({
  userId: z.uuid().optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const DealItemSchema = z.object({
  id: z.string(),
  crmEntryId: z.string(),
  userId: z.string(),
  ownerName: z.string().nullable(),
  dealName: z.string(),
  dealValue: z.number(),
  closedAt: z.string(),
  month: z.string(),
  cumulativeAfter: z.number(),
  tier: z.number(),
  commissionRate: z.number(),
  commissionAmount: z.number(),
  kesPerPoint: z.number(),
  pointsUsed: z.number(),
  pointsValue: z.number(),
  rolloverApplied: z.number(),
  totalBeforeCap: z.number(),
  capPhase: z.number(),
  capRate: z.number(),
  capAmount: z.number(),
  finalPayout: z.number(),
  rolloverCreated: z.number(),
  clientPaymentStatus: z.enum(CLIENT_PAYMENT_STATUSES),
  paymentStatus: z.enum(PAYMENT_STATUSES),
  paymentReference: z.string().nullable(),
  approvedAt: z.string().nullable(),
  paidAt: z.string().nullable(),
});
export const DealPageSchema = z.object({
  items: z.array(DealItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export const RolloverItemSchema = z.object({
  id: z.string(),
  sourceDealId: z.string(),
  rolloverAmount: z.number(),
  remainingBalance: z.number(),
  expiresAt: z.string(),
  status: z.enum(ROLLOVER_STATUSES),
  createdAt: z.string(),
});
export const SummarySchema = z.object({
  lifetimePaid: z.number(),
  pendingPayout: z.number(),
  rolloverBalance: z.number(),
  rolloverExpiringSoon: z.number(),
  activePoints: z.number(),
  month: z.string(),
  monthRevenue: z.number(),
  tier: z.number(),
  rate: z.number(),
  nextTierAt: z.number().nullable(),
  capPhase: z.number(),
  capRate: z.number(),
});
export const StructureSchema = z.object({
  tiers: z.array(
    z.object({ tier: z.number(), from: z.number(), to: z.number().nullable(), rate: z.number() }),
  ),
  caps: z.array(z.object({ phase: z.number(), rate: z.number(), note: z.string() })),
  kesPerPoint: z.number(),
  rolloverDays: z.number(),
});
export const CloseResultSchema = z.object({ deal: DealItemSchema });

/** COMP-005: tier from the NEW cumulative monthly revenue. limits are ascending upper bounds, rates has one more entry. */
export function tierFor(
  cumulative: number,
  limits: readonly number[],
  rates: readonly number[],
): { tier: number; rate: number } {
  if (rates.length !== limits.length + 1) throw new Error("Compensation tiers are misconfigured");
  const idx = limits.filter((l) => cumulative > l).length;
  return { tier: idx + 1, rate: rates[idx] as number };
}

export function calculateDealCompensation(input: {
  cumulativeBefore: number;
  dealValue: number;
  tierLimits: readonly number[];
  tierRates: readonly number[];
  pointsUsed: number;
  kesPerPoint: number;
  rolloverApplied: number;
  capPhase: number;
  capRate: number;
}) {
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const cumulativeBefore = r2(input.cumulativeBefore);
  const dealValue = r2(input.dealValue);
  const cumulativeAfter = r2(cumulativeBefore + dealValue);
  const { tier, rate } = tierFor(cumulativeAfter, input.tierLimits, input.tierRates);
  const commissionAmount = r2((dealValue * rate) / 100);
  const pointsUsed = r2(input.pointsUsed);
  const kesPerPoint = r2(input.kesPerPoint);
  const pointsValue = r2(pointsUsed * kesPerPoint);
  const rolloverApplied = r2(input.rolloverApplied);
  const totalBeforeCap = r2(commissionAmount + pointsValue + rolloverApplied);
  const capAmount = r2((dealValue * input.capRate) / 100);
  const finalPayout = r2(Math.min(totalBeforeCap, capAmount));
  return {
    cumulativeBefore,
    cumulativeAfter,
    tier,
    commissionRate: rate,
    commissionAmount,
    pointsUsed,
    kesPerPoint,
    pointsValue,
    rolloverApplied,
    totalBeforeCap,
    capPhase: input.capPhase,
    capRate: input.capRate,
    capAmount,
    finalPayout,
    rolloverCreated: r2(totalBeforeCap - finalPayout),
  };
}
