import { sql } from "drizzle-orm";
import {
  char,
  datetime,
  int,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { newId } from "../../columns";

export const weeklyReports = mysqlTable(
  "weekly_reports",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(newId),
    userId: char("user_id", { length: 36 }).notNull(),
    weekStart: varchar("week_start", { length: 10 }).notNull(),
    challenges: text("challenges").notNull(),
    recommendations: text("recommendations").notNull(),
    feedback: text("feedback").notNull(),
    setbacks: text("setbacks").notNull(),
    nextWeekCalls: text("next_week_calls").notNull(),
    snapshot: text("snapshot").notNull(),
    onTime: int("on_time").notNull().default(0),
    submittedAt: datetime("submitted_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [uniqueIndex("weekly_report_uq").on(t.userId, t.weekStart)],
);
