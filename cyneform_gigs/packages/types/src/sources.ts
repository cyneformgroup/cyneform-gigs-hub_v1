import type {
  PreviewResultSchema,
  RunDetailSchema,
  RunItemSchema,
  SourceInputSchema,
  SourceItemSchema,
} from "@cyneform/validators";
import type { z } from "zod";

export type {
  GigDraft,
  LeadStatus,
  RunStatus,
  SourceConfig,
  SourceHealth,
  SourceStrategy,
} from "@cyneform/validators";
export type SourceInput = z.infer<typeof SourceInputSchema>;
export type SourceItem = z.infer<typeof SourceItemSchema>;
export type RunItem = z.infer<typeof RunItemSchema>;
export type RunDetail = z.infer<typeof RunDetailSchema>;
export type PreviewResult = z.infer<typeof PreviewResultSchema>;
