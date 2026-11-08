import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import { dbEnv } from "./env";
import * as schema from "./schema";

export const pool = createPool({
  host: dbEnv.DB_HOST,
  port: dbEnv.DB_PORT,
  user: dbEnv.DB_USER,
  password: dbEnv.DB_PASSWORD,
  database: dbEnv.DB_NAME,
  timezone: "Z",
  connectionLimit: 10,
  decimalNumbers: false, // keep money as exact strings
});
export const db = drizzle(pool, { schema, mode: "default" });
export type Db = typeof db;
export { schema };
