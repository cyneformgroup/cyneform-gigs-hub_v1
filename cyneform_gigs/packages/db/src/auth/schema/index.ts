import {
  index,
  mysqlEnum,
  mysqlTable,
  smallint,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { bytes, createdAt, pk, ts, uuidCol } from "../../columns";
import { users } from "../../users/schema";

export const authSessions = mysqlTable(
  "auth_sessions",
  {
    id: pk(),
    userId: uuidCol("user_id")
      .notNull()
      .references(() => users.id),
    familyId: uuidCol("family_id").notNull(),
    refreshTokenHash: bytes("refresh_token_hash", { length: 32 }).notNull(),
    previousTokenHash: bytes("previous_token_hash", { length: 32 }),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: varchar("user_agent", { length: 255 }),
    deviceLabel: varchar("device_label", { length: 100 }),
    lastActiveAt: ts("last_active_at").notNull(),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
    revokeReason: varchar("revoke_reason", { length: 40 }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("uq_sessions_refresh").on(t.refreshTokenHash),
    index("ix_sessions_previous").on(t.previousTokenHash),
    index("ix_sessions_user").on(t.userId, t.revokedAt),
  ],
);

export const otpChallenges = mysqlTable("otp_challenges", {
  id: pk(),
  userId: uuidCol("user_id")
    .notNull()
    .references(() => users.id),
  otpHash: bytes("otp_hash", { length: 32 }).notNull(),
  attempts: smallint("attempts").notNull().default(0),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: createdAt(),
});

export const oneTimeLinks = mysqlTable(
  "one_time_links",
  {
    id: pk(),
    userId: uuidCol("user_id")
      .notNull()
      .references(() => users.id),
    purpose: mysqlEnum("purpose", ["set_password", "reset_password"]).notNull(),
    tokenHash: bytes("token_hash", { length: 32 }).notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("uq_links_token").on(t.tokenHash)],
);

export const passwordHistory = mysqlTable(
  "password_history",
  {
    id: pk(),
    userId: uuidCol("user_id")
      .notNull()
      .references(() => users.id),
    passwordHash: text("password_hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ix_password_history_user").on(t.userId, t.createdAt)],
);

export const loginAttempts = mysqlTable(
  "login_attempts",
  {
    id: pk(),
    userId: uuidCol("user_id").references(() => users.id),
    emailBidx: bytes("email_bidx", { length: 32 }).notNull(),
    outcome: varchar("outcome", { length: 30 }).notNull(),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: varchar("user_agent", { length: 255 }),
    createdAt: createdAt(),
  },
  (t) => [index("ix_login_attempts_user").on(t.userId, t.createdAt)],
);
