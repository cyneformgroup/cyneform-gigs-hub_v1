import type {
  GigItemSchema,
  GigPageSchema,
  GigQuerySchema,
  ReviewGigsSchema,
  ReviewResultSchema,
} from "@cyneform/validators";
import type { z } from "zod";

export type GigItem = z.infer<typeof GigItemSchema>;
export type GigPage = z.infer<typeof GigPageSchema>;
export type GigQuery = z.infer<typeof GigQuerySchema>;
export type ReviewGigsInput = z.infer<typeof ReviewGigsSchema>;
export type ReviewResult = z.infer<typeof ReviewResultSchema>;
