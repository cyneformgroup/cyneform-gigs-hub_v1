import type {
  AdjustSchema,
  AwardSchema,
  BdpOptionSchema,
  LedgerEntrySchema,
  LedgerPageSchema,
  LedgerQuerySchema,
  MyPointsSchema,
  PointRuleItemSchema,
  RestoreVersionSchema,
  RulesViewSchema,
  RuleVersionItemSchema,
  UpdateRulesSchema,
  VerifySchema,
} from "@cyneform/validators";
import type { z } from "zod";

export type { LedgerStatus, PointScheme } from "@cyneform/validators";
export type PointRuleItem = z.infer<typeof PointRuleItemSchema>;
export type RulesView = z.infer<typeof RulesViewSchema>;
export type UpdateRulesInput = z.infer<typeof UpdateRulesSchema>;
export type RestoreVersionInput = z.infer<typeof RestoreVersionSchema>;
export type RuleVersionItem = z.infer<typeof RuleVersionItemSchema>;
export type LedgerQuery = z.infer<typeof LedgerQuerySchema>;
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;
export type LedgerPage = z.infer<typeof LedgerPageSchema>;
export type MyPoints = z.infer<typeof MyPointsSchema>;
export type AwardInput = z.infer<typeof AwardSchema>;
export type AdjustInput = z.infer<typeof AdjustSchema>;
export type VerifyInput = z.infer<typeof VerifySchema>;
export type BdpOption = z.infer<typeof BdpOptionSchema>;
