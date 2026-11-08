import "@cyneform/db/env"; // loads the root .env before anything below reads process.env
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  TRUST_PROXY: z.stringbool().default(false),
  CORS_ORIGIN: z.url(),
  APP_URL: z.url(),
  JWT_SECRET: z.string().min(32),
  /** "1:<base64 32 bytes>,2:<...>": the highest id encrypts, all ids decrypt (annual rotation). */
  ENCRYPTION_KEYS: z.string().min(1),
  BLIND_INDEX_KEY: z.string().min(32),
  SEED_ADMIN_NAME: z.string().default("Managing Partner"),
  SEED_ADMIN_BUSINESS_EMAIL: z.email().default("admin@cyneform.test"),
  SEED_ADMIN_PERSONAL_EMAIL: z.email().default("admin.personal@cyneform.test"),
  SEED_STAFF_ADMIN_NAME: z.string().default("Office Administrator"),
  SEED_STAFF_ADMIN_BUSINESS_EMAIL: z.email().default("office.admin@cyneform.test"),
  SEED_STAFF_ADMIN_PERSONAL_EMAIL: z.email().default("office.admin.personal@cyneform.test"),
  SEED_BDP_NAME: z.string().default("Jane Wanjiku"),
  SEED_BDP_BUSINESS_EMAIL: z.email().default("jane@cyneform.test"),
  SEED_BDP_PERSONAL_EMAIL: z.email().default("jane.personal@cyneform.test"),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
export const env = parsed.data;

/** Business rules fixed by the specification. */
export const AUTH = {
  accessTokenSeconds: 15 * 60,
  refreshTokenDays: 7,
  idleMinutes: 60,
  maxSessions: 3,
  otpMinutes: 5,
  otpMaxAttempts: 5,
  lockAfterFailures: 5,
  failureWindowMinutes: 15,
  lockMinutes: 30,
  setPasswordHours: 72,
  resetPasswordHours: 1,
  passwordHistory: 5,
} as const;
