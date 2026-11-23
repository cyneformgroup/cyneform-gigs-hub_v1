import type {
  ChangeEntryStatusSchema,
  EntryDetailSchema,
  EntryItemSchema,
  EntryPageSchema,
  EntryQuerySchema,
  EvidenceFileSchema,
  FlagEntrySchema,
  OutreachResultSchema,
  OutreachSchema,
  UpdateEntrySchema,
} from "@cyneform/validators";
import type { z } from "zod";

export type { CrmContacts, CrmStatus } from "@cyneform/validators";
export type OutreachInput = z.infer<typeof OutreachSchema>;
export type OutreachResult = z.infer<typeof OutreachResultSchema>;
export type UpdateEntryInput = z.infer<typeof UpdateEntrySchema>;
export type ChangeEntryStatusInput = z.infer<typeof ChangeEntryStatusSchema>;
export type EntryQuery = z.infer<typeof EntryQuerySchema>;
export type EntryItem = z.infer<typeof EntryItemSchema>;
export type EntryPage = z.infer<typeof EntryPageSchema>;
export type EntryDetail = z.infer<typeof EntryDetailSchema>;
export type EvidenceFile = z.infer<typeof EvidenceFileSchema>;
export type FlagEntryInput = z.infer<typeof FlagEntrySchema>;
