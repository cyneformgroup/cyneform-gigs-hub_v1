import { sql } from "drizzle-orm";
import {
  char,
  datetime,
  index,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { newId } from "../../columns";

const pk = () => char("id", { length: 36 }).primaryKey().$defaultFn(newId);
const ref = (name: string) => char(name, { length: 36 });
const stamp = (name: string) =>
  datetime(name, { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`);

export const lifecycleNotices = mysqlTable(
  "lifecycle_notices",
  {
    id: pk(),
    userId: ref("user_id").notNull(),
    kind: varchar("kind", { length: 60 }).notNull(),
    anchor: varchar("anchor", { length: 40 }).notNull(),
    createdAt: stamp("created_at"),
  },
  (t) => [
    uniqueIndex("lifecycle_notice_uq").on(t.userId, t.kind, t.anchor),
    index("lifecycle_kind_idx").on(t.kind, t.createdAt),
  ],
);

export const accountDeletions = mysqlTable("account_deletions", {
  userId: ref("user_id").primaryKey(),
  requestedBy: ref("requested_by").notNull(),
  reason: varchar("reason", { length: 500 }).notNull(),
  summary: text("summary").notNull(),
  deletedAt: stamp("deleted_at"),
  anonymizeAfter: datetime("anonymize_after", { fsp: 3 }).notNull(),
  anonymizedAt: datetime("anonymized_at", { fsp: 3 }),
});

export const dataRequests = mysqlTable(
  "data_requests",
  {
    id: pk(),
    userId: ref("user_id").notNull(),
    type: varchar("type", { length: 12 }).notNull(),
    details: varchar("details", { length: 2000 }).notNull(),
    status: varchar("status", { length: 12 }).notNull().default("open"),
    dueAt: datetime("due_at", { fsp: 3 }).notNull(),
    handledBy: ref("handled_by"),
    handledAt: datetime("handled_at", { fsp: 3 }),
    response: varchar("response", { length: 2000 }),
    createdAt: stamp("created_at"),
  },
  (t) => [
    index("data_request_status_idx").on(t.status, t.dueAt),
    index("data_request_user_idx").on(t.userId),
  ],
);
