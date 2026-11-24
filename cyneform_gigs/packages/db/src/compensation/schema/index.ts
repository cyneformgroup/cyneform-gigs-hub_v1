import { sql } from "drizzle-orm";
import {
  boolean,
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

/** One row per closed deal. Every input of the calculation is stored, so later rule changes never alter it. */
export const dealCompensation = mysqlTable(
  "deal_compensation",
  {
    id: pk(),
    userId: ref("user_id").notNull(),
    crmEntryId: ref("crm_entry_id").notNull(),
    leadId: ref("lead_id").notNull(),
    dealName: varchar("deal_name", { length: 255 }).notNull(),
    dealValue: money("deal_value").notNull(),
    closedAt: datetime("closed_at", { fsp: 3 }).notNull(),
    month: char("month", { length: 7 }).notNull(), // YYYY-MM in EAT
    cumulativeBefore: money("cumulative_before").notNull(),
    cumulativeAfter: money("cumulative_after").notNull(),
    tier: int("tier").notNull(),
    commissionRate: pct("commission_rate").notNull(),
    commissionAmount: money("commission_amount").notNull(),
    kesPerPoint: money("kes_per_point").notNull(),
    pointsUsed: decimal("points_used", { precision: 10, scale: 2, mode: "number" }).notNull(),
    pointsValue: money("points_value").notNull(),
    rolloverApplied: money("rollover_applied").notNull(),
    totalBeforeCap: money("total_before_cap").notNull(),
    capPhase: int("cap_phase").notNull(),
    capRate: pct("cap_rate").notNull(),
    capAmount: money("cap_amount").notNull(),
    finalPayout: money("final_payout").notNull(),
    rolloverCreated: money("rollover_created").notNull(),
    clientPaymentStatus: varchar("client_payment_status", { length: 12 }).notNull(),
    clientPaidAt: opt("client_paid_at"),
    paymentStatus: varchar("payment_status", { length: 12 }).notNull().default("pending"),
    approvedBy: ref("approved_by"),
    approvedAt: opt("approved_at"),
    paidBy: ref("paid_by"),
    paidAt: opt("paid_at"),
    paymentReference: varchar("payment_reference", { length: 100 }),
    paymentNote: varchar("payment_note", { length: 500 }),
    createdAt: stamp("created_at"),
  },
  (t) => [
    uniqueIndex("deal_comp_entry_uq").on(t.crmEntryId),
    index("deal_comp_user_idx").on(t.userId, t.paymentStatus),
  ],
);

export const rolloverTracking = mysqlTable(
  "rollover_tracking",
  {
    id: pk(),
    userId: ref("user_id").notNull(),
    sourceDealId: ref("source_deal_id").notNull(),
    rolloverAmount: money("rollover_amount").notNull(),
    remainingBalance: money("remaining_balance").notNull(),
    expiresAt: datetime("expires_at", { fsp: 3 }).notNull(),
    status: varchar("status", { length: 12 }).notNull().default("active"), // active | applied | expired
    appliedInDealId: ref("applied_in_deal_id"),
    createdAt: stamp("created_at"),
  },
  (t) => [index("rollover_user_idx").on(t.userId, t.status, t.expiresAt)],
);

export const monthlyRevenue = mysqlTable(
  "monthly_revenue_tracking",
  {
    id: pk(),
    userId: ref("user_id").notNull(),
    month: char("month", { length: 7 }).notNull(),
    cumulativeRevenue: money("cumulative_revenue").notNull(),
    dealsClosed: int("deals_closed").notNull().default(0),
    tierApplied: int("tier_applied").notNull(),
    effectiveRate: pct("effective_rate").notNull(),
    updatedAt: datetime("updated_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("monthly_rev_user_month_uq").on(t.userId, t.month)],
);

export const compensationProfiles = mysqlTable("compensation_profiles", {
  userId: ref("user_id").primaryKey(),
  elite: boolean("elite").notNull().default(false),
  updatedBy: ref("updated_by"),
  updatedAt: datetime("updated_at", { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$onUpdate(() => new Date()),
});
