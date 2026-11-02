import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import { env } from "./env/index";
import * as users from "./users/schema/index";

export type { Pool } from "mysql2/promise";

export const pool = createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  timezone: "Z",
  connectionLimit: 10,
  decimalNumbers: false,
});

export const schema = { ...users };

export const db = drizzle(pool, { schema, mode: "default" });

export type Db = typeof db;
