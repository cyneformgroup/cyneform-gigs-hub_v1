import type { ApiErrorSchema, PageQuerySchema } from "@cyneform/validators";
import type { z } from "zod";

export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;
export type PageQuery = z.infer<typeof PageQuerySchema>;
