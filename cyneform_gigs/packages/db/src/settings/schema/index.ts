import { sql } from "drizzle-orm";
import { char, datetime, index, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";
import { newId } from "../../columns";

/** One row per setting that differs from its default. Values are JSON text. */
export const systemSettings = mysqlTable("system_settings", {
  key: varchar("setting_key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedBy: char("updated_by", { length: 36 }),
  updatedAt: datetime("updated_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
});

export const settingsHistory = mysqlTable(
  "settings_history",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(newId),
    key: varchar("setting_key", { length: 100 }).notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value").notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    changedBy: char("changed_by", { length: 36 }),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [index("settings_history_key_idx").on(t.key, t.createdAt)],
);
