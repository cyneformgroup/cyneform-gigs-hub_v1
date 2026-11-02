import { z } from "zod";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  database: z.enum(["up", "down"]),
  time: z.string(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
