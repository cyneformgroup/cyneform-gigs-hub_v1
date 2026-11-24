import { z } from "zod";

export const BONUS_STATUSES = [
  "pending_review",
  "deferred",
  "declined",
  "authorized",
  "liquidated",
  "paid",
] as const;
const Notes = z.string().trim().min(3, "Give a short note").max(500);

export const BonusDecisionSchema = z
  .object({
    decision: z.enum(["authorize", "decline", "defer"]),
    amount: z.number().positive().max(1_000_000_000).optional(),
    notes: Notes,
  })
  .refine((v) => v.decision !== "authorize" || v.amount !== undefined, {
    path: ["amount"],
    message: "Enter the bonus amount",
  });
export const PayBonusSchema = z.object({
  reference: z.string().trim().min(3, "Enter the payment reference").max(100),
});
export const BonusQuerySchema = z.object({
  status: z.enum(BONUS_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export const BonusItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  ownerName: z.string().nullable(),
  contractsClosed: z.number(),
  windowStart: z.string(),
  windowEnd: z.string(),
  rolloverSnapshot: z.number(),
  maxPayout: z.number(),
  status: z.enum(BONUS_STATUSES),
  amount: z.number().nullable(),
  liquidatedAmount: z.number().nullable(),
  decisionNotes: z.string().nullable(),
  paymentReference: z.string().nullable(),
  createdAt: z.string(),
});
export const BonusPageSchema = z.object({
  items: z.array(BonusItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
