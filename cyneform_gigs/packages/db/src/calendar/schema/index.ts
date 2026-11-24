import { sql } from "drizzle-orm";
import { boolean, index, int, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { pk, ts, uuidCol } from "../../columns";

export const meetings = mysqlTable(
  "meetings",
  {
    id: pk(),
    seriesId: uuidCol("series_id"),
    title: varchar("title", { length: 150 }).notNull(),
    description: varchar("description", { length: 1000 }),
    startsAt: ts("starts_at").notNull(),
    durationMin: int("duration_min").notNull(),
    agenda: varchar("agenda", { length: 2000 }),
    link: varchar("link", { length: 500 }).notNull(),
    reminderMinutes: int("reminder_minutes").notNull().default(60),
    recurrence: varchar("recurrence", { length: 10 }).notNull().default("none"),
    createdBy: uuidCol("created_by").notNull(),
    cancelledAt: ts("cancelled_at"),
    createdAt: ts("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [index("meeting_start_idx").on(t.startsAt)],
);

export const meetingAttendees = mysqlTable(
  "meeting_attendees",
  {
    id: pk(),
    meetingId: uuidCol("meeting_id").notNull(),
    userId: uuidCol("user_id").notNull(),
    status: varchar("status", { length: 10 }).notNull().default("pending"),
    attendanceAwarded: boolean("attendance_awarded").notNull().default(false),
    markedBy: uuidCol("marked_by"),
    markedAt: ts("marked_at"),
  },
  (t) => [
    uniqueIndex("meeting_attendee_uq").on(t.meetingId, t.userId),
    index("meeting_attendee_user_idx").on(t.userId),
  ],
);
