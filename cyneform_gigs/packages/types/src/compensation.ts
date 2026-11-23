import type {
  ApproveDealSchema,
  CloseDealSchema,
  CloseResultSchema,
  DealItemSchema,
  DealPageSchema,
  DealQuerySchema,
  EliteSchema,
  PayDealSchema,
  RolloverItemSchema,
  StructureSchema,
  SummarySchema,
} from "@cyneform/validators";
import type { z } from "zod";

export type CloseDealInput = z.infer<typeof CloseDealSchema>;
export type ApproveDealInput = z.infer<typeof ApproveDealSchema>;
export type PayDealInput = z.infer<typeof PayDealSchema>;
export type EliteInput = z.infer<typeof EliteSchema>;
export type DealQuery = z.infer<typeof DealQuerySchema>;
export type DealItem = z.infer<typeof DealItemSchema>;
export type DealPage = z.infer<typeof DealPageSchema>;
export type RolloverItem = z.infer<typeof RolloverItemSchema>;
export type CompensationSummary = z.infer<typeof SummarySchema>;
export type CompensationStructure = z.infer<typeof StructureSchema>;
export type CloseResult = z.infer<typeof CloseResultSchema>;
