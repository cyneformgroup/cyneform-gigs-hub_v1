import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  datetime,
  decimal,
  index,
  int,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { newId } from "../../columns";

const pk = () => char("id", { length: 36 }).primaryKey().$defaultFn(newId);
const ref = (name: string) => char(name, { length: 36 });
const opt = (name: string) => datetime(name, { fsp: 3 });
const stamp = (name: string) =>
  datetime(name, { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`);
const pts = (name: string) => decimal(name, { precision: 10, scale: 2, mode: "number" });

export const pointsSchemes = mysqlTable("points_schemes", {
  key: varchar("key", { length: 20 }).primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: stamp("updated_at"),
});

export const pointsRules = mysqlTable("points_rules", {
  key: varchar("key", { length: 50 }).primaryKey(),
  scheme: varchar("scheme", { length: 20 }).notNull(),
  points: pts("points").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  verificationRequired: boolean("verification_required").notNull().default(false),
  updatedAt: stamp("updated_at"),
});

export const pointsRuleVersions = mysqlTable(
  "points_rule_versions",
  {
    id: pk(),
    versionNo: int("version_no").notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    changedBy: ref("changed_by"),
    snapshot: text("snapshot").notNull(),
    createdAt: stamp("created_at"),
  },
  (t) => [uniqueIndex("points_rule_versions_no_uq").on(t.versionNo)],
);

export const pointsVault = mysqlTable(
  "points_vault",
  {
    id: pk(),
    userId: ref("user_id").notNull(),
    ruleKey: varchar("rule_key", { length: 50 }).notNull(),
    points: pts("points").notNull(),
    cashEquivalent: decimal("cash_equivalent", {
      precision: 12,
      scale: 2,
      mode: "number",
    }).notNull(),
    status: varchar("status", { length: 24 }).notNull(),
    leadId: ref("lead_id"),
    crmEntryId: ref("crm_entry_id"),
    ruleVersionNo: int("rule_version_no"),
    verificationRequired: boolean("verification_required").notNull().default(false),
    earnedAt: datetime("earned_at", { fsp: 3 }).notNull(),
    expiresAt: opt("expires_at"),
    expiredAt: opt("expired_at"),
    createdBy: ref("created_by"),
    note: varchar("note", { length: 500 }),
    createdAt: stamp("created_at"),
  },
  (t) => [
    index("points_vault_user_status_idx").on(t.userId, t.status),
    index("points_vault_dup_idx").on(t.userId, t.ruleKey, t.leadId, t.earnedAt),
    index("points_vault_expiry_idx").on(t.expiresAt),
  ],
);
