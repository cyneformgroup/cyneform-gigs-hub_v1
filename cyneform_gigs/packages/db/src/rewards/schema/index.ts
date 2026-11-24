import { sql } from "drizzle-orm";
import {
  char,
  datetime,
  decimal,
  index,
  int,
  mysqlTable,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { newId } from "../../columns";

const pk = () => char("id", { length: 36 }).primaryKey().$defaultFn(newId);
const ref = (name: string) => char(name, { length: 36 });
const opt = (name: string) => datetime(name, { fsp: 3 });
const stamp = (name: string) =>
  datetime(name, { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`);
const money = (name: string) => decimal(name, { precision: 14, scale: 2, mode: "number" });
const pct = (name: string) => decimal(name, { precision: 5, scale: 2, mode: "number" });

export const performanceBonuses = mysqlTable(
  "performance_bonus_records",
  {
    id: pk(),
    userId: ref("user_id").notNull(),
    contractsClosed: int("contracts_closed").notNull(),
    windowStart: datetime("window_start", { fsp: 3 }).notNull(),
    windowEnd: datetime("window_end", { fsp: 3 }).notNull(),
    rolloverSnapshot: money("rollover_snapshot").notNull(),
    maxPayout: money("max_payout").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending_review"),
    amount: money("amount"),
    decidedBy: ref("decided_by"),
    decidedAt: opt("decided_at"),
    decisionNotes: varchar("decision_notes", { length: 500 }),
    liquidatedAt: opt("liquidated_at"),
    liquidatedAmount: money("liquidated_amount"),
    paidBy: ref("paid_by"),
    paidAt: opt("paid_at"),
    paymentReference: varchar("payment_reference", { length: 100 }),
    createdAt: stamp("created_at"),
  },
  (t) => [index("bonus_user_status_idx").on(t.userId, t.status)],
);

export const equityGrants = mysqlTable(
  "phantom_equity_records",
  {
    id: pk(),
    userId: ref("user_id").notNull(),
    percentage: pct("percentage").notNull(),
    grantDate: datetime("grant_date", { fsp: 3 }).notNull(),
    cliffDate: datetime("cliff_date", { fsp: 3 }).notNull(),
    baselineValuation: money("baseline_valuation").notNull(),
    vestedNotifiedPct: pct("vested_notified_pct").notNull().default(0),
    grantedBy: ref("granted_by").notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    overridden: int("overridden").notNull().default(0),
    createdAt: stamp("created_at"),
  },
  (t) => [uniqueIndex("equity_user_uq").on(t.userId)],
);

export const equityMilestones = mysqlTable(
  "equity_milestones",
  {
    id: pk(),
    name: varchar("name", { length: 100 }).notNull(),
    valuation: money("valuation").notNull(),
    reachedAt: stamp("reached_at"),
    recordedBy: ref("recorded_by").notNull(),
    notes: varchar("notes", { length: 500 }),
  },
  (t) => [uniqueIndex("equity_milestone_name_uq").on(t.name)],
);

export const equityPayouts = mysqlTable(
  "equity_payouts",
  {
    id: pk(),
    grantId: ref("grant_id").notNull(),
    userId: ref("user_id").notNull(),
    milestoneId: ref("milestone_id").notNull(),
    vestedPercent: pct("vested_percent").notNull(),
    amount: money("amount").notNull(),
    status: varchar("status", { length: 12 }).notNull().default("pending"),
    paidBy: ref("paid_by"),
    paidAt: opt("paid_at"),
    paymentReference: varchar("payment_reference", { length: 100 }),
    createdAt: stamp("created_at"),
  },
  (t) => [
    uniqueIndex("equity_payout_uq").on(t.grantId, t.milestoneId),
    index("equity_payout_user_idx").on(t.userId),
  ],
);
