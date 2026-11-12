import type { NotificationType } from "@cyneform/types";
import { sql } from "drizzle-orm";
import { char, datetime, index, int, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { newId } from "../../columns";

export const notifications = mysqlTable(
  "notifications",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(newId),
    userId: char("user_id", { length: 36 }).notNull(),
    type: varchar("type", { length: 40 }).$type<NotificationType>().notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: varchar("body", { length: 1000 }),
    link: varchar("link", { length: 255 }),
    readAt: datetime("read_at", { fsp: 3 }),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt, t.createdAt)],
);

/** One row per delivery attempt. */
export const emailLogs = mysqlTable(
  "email_logs",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(newId),
    recipient: varchar("recipient", { length: 255 }).notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    template: varchar("template", { length: 50 }),
    status: varchar("status", { length: 10 }).$type<"sent" | "logged" | "failed">().notNull(),
    attempt: int("attempt").notNull(),
    error: varchar("error", { length: 500 }),
    createdAt: datetime("created_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [index("email_logs_created_idx").on(t.createdAt)],
);
