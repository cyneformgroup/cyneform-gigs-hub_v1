import type {
  BonusDecisionSchema,
  BonusItemSchema,
  BonusPageSchema,
  BonusQuerySchema,
  EligibilitySchema,
  GrantEquitySchema,
  GrantItemSchema,
  MilestoneItemSchema,
  MilestoneSchema,
  MyEquitySchema,
  PayBonusSchema,
  PayoutItemSchema,
  PayPayoutSchema,
} from "@cyneform/validators";
import type { z } from "zod";

export type BonusDecisionInput = z.infer<typeof BonusDecisionSchema>;
export type PayBonusInput = z.infer<typeof PayBonusSchema>;
export type BonusQuery = z.infer<typeof BonusQuerySchema>;
export type BonusItem = z.infer<typeof BonusItemSchema>;
export type BonusPage = z.infer<typeof BonusPageSchema>;
export type GrantEquityInput = z.infer<typeof GrantEquitySchema>;
export type MilestoneInput = z.infer<typeof MilestoneSchema>;
export type PayPayoutInput = z.infer<typeof PayPayoutSchema>;
export type Eligibility = z.infer<typeof EligibilitySchema>;
export type GrantItem = z.infer<typeof GrantItemSchema>;
export type MilestoneItem = z.infer<typeof MilestoneItemSchema>;
export type PayoutItem = z.infer<typeof PayoutItemSchema>;
export type MyEquity = z.infer<typeof MyEquitySchema>;
