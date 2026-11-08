import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: "../../.env" }); // drizzle-kit runs with packages/db as the working directory

export default defineConfig({
  dialect: "mysql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL as string },
});
