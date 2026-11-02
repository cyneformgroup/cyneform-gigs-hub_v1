import { defineConfig } from "drizzle-kit";
import { env } from "./src/env/index";

export default defineConfig({
  dialect: "mysql",
  schema: "./src/*/schema/index.ts",
  out: "./src/migrations",
  dbCredentials: { url: env.DATABASE_URL },
});
