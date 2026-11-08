import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

// Loads the repo-root .env no matter which folder the process starts from.
config({
  path: fileURLToPath(new URL("../../../../.env", import.meta.url)),
  quiet: true,
});

const DbEnvSchema = z.object({
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().default(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
});

const parsed = DbEnvSchema.safeParse(process.env);
if (!parsed.success)
  throw new Error(`Invalid database environment:\n${z.prettifyError(parsed.error)}`);
export const dbEnv = parsed.data;
