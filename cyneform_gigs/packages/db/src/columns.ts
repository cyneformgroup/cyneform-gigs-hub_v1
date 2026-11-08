import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { char, customType, datetime } from "drizzle-orm/mysql-core";

/** Creates a cryptographically random UUID accepted by the API UUID schemas. */
export const newId = (): string => randomUUID();

export const pk = (name = "id") => char(name, { length: 36 }).primaryKey().$defaultFn(newId);
export const uuidCol = (name: string) => char(name, { length: 36 });

/** Binary column (ciphertext, hashes), read and written as Buffer. */
export const bytes = customType<{
  data: Buffer;
  config: { length: number };
  configRequired: true;
}>({
  dataType: (config) => `varbinary(${config.length})`,
});

export const ts = (name: string) => datetime(name, { mode: "date", fsp: 3 });
export const createdAt = () => ts("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`);
export const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$onUpdate(() => new Date());
