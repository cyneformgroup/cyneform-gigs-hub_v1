import { sql } from "drizzle-orm";
import { char, customType, datetime } from "drizzle-orm/mysql-core";

/** UUIDv7: time-ordered, so primary keys stay index friendly. */
export const newId = (): string => {
  const d = Date.now();
  const time = (d & 0xfff0000000000) >>> 4;
  const x = Math.floor((d & 0x000fffffffffff) * Math.random()) % 0x10000;
  const uuid = `${time}-${x}-4-xxx-${x & 0x3fff}-${x >>> 16}`;
  return uuid.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

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
