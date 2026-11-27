import type {
  CreateDataRequestSchema,
  DataRequestItemSchema,
  DataRequestQuerySchema,
  DeleteAccountSchema,
  DeletePreviewSchema,
  ResolveDataRequestSchema,
} from "@cyneform/validators";
import type { z } from "zod";

export type DeleteAccountInput = z.infer<typeof DeleteAccountSchema>;
export type DeletePreview = z.infer<typeof DeletePreviewSchema>;
export type CreateDataRequestInput = z.infer<typeof CreateDataRequestSchema>;
export type ResolveDataRequestInput = z.infer<typeof ResolveDataRequestSchema>;
export type DataRequestQuery = z.infer<typeof DataRequestQuerySchema>;
export type DataRequestItem = z.infer<typeof DataRequestItemSchema>;
