import { LEAVE_STATUSES } from "@cyneform/validators";
import { date, index, mysqlEnum, mysqlTable, text, varchar } from "drizzle-orm/mysql-core";
import { createdAt, pk, ts, updatedAt, uuidCol } from "../../columns";
import { users } from "../../users/schema";

export const userStatusHistory = mysqlTable(
  "user_status_history",
  {
    id: pk(),
    userId: uuidCol("user_id")
      .notNull()
      .references(() => users.id),
    fromStatus: varchar("from_status", { length: 20 }),
    toStatus: varchar("to_status", { length: 20 }).notNull(),
    reason: text("reason").notNull(),
    changedBy: uuidCol("changed_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("ix_status_history_user").on(t.userId, t.createdAt)],
);

export const leaveRequests = mysqlTable(
  "leave_requests",
  {
    id: pk(),
    userId: uuidCol("user_id")
      .notNull()
      .references(() => users.id),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    reason: text("reason").notNull(),
    status: mysqlEnum("status", LEAVE_STATUSES).notNull().default("pending"),
    decidedBy: uuidCol("decided_by").references(() => users.id),
    decidedAt: ts("decided_at"),
    decisionNote: text("decision_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("ix_leave_user").on(t.userId, t.status),
    index("ix_leave_status").on(t.status, t.startDate),
  ],
);
