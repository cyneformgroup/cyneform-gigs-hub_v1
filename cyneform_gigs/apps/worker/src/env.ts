import "@cyneform/db/env";
import { z } from "zod";

const blank = (v: string | undefined) => (v ? v : undefined);

export const env = z
  .object({
    REDIS_URL: z.string().default("redis://localhost:6379"),
    SMTP_HOST: z.string().optional().transform(blank),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_SECURE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    SMTP_USER: z.string().optional().transform(blank),
    SMTP_PASS: z.string().optional().transform(blank),
    MAIL_FROM: z.string().default("CyneForm Group <no-reply@localhost>"),
  })
  .parse(process.env);
