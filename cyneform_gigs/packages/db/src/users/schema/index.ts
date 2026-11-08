// Role codes defined per the validators/permissions catalogue
export const ROLE_CODES = ["super_admin", "admin", "bdp"] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

// User statuses from validators/permissions
export const USER_STATUSES = ["active", "frozen", "on_leave", "deactivated", "deleted"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

import {
  type AnyMySqlColumn,
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { bytes, createdAt, pk, ts, updatedAt, uuidCol } from "../../columns";
import { files } from "../../platform/schema";

export const roles = mysqlTable("roles", {
  id: pk(),
  code: varchar("code", { length: 30 }).$type<RoleCode>().notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  createdAt: createdAt(),
});

export const permissions = mysqlTable("permissions", {
  id: pk(),
  code: varchar("code", { length: 80 }).notNull().unique(),
  module: varchar("module", { length: 40 }).notNull(),
  description: text("description"),
  superAdminOnly: boolean("super_admin_only").notNull().default(false),
});

export const rolePermissions = mysqlTable(
  "role_permissions",
  {
    roleId: uuidCol("role_id")
      .notNull()
      .references(() => roles.id),
    permissionId: uuidCol("permission_id")
      .notNull()
      .references(() => permissions.id),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const users = mysqlTable(
  "users",
  {
    id: pk(),
    roleId: uuidCol("role_id")
      .notNull()
      .references(() => roles.id),
    businessEmail: varchar("business_email", { length: 254 }),
    /** @deprecated Legacy ciphertext retained for the one-time plaintext backfill. */
    businessEmailCt: bytes("business_email_ct", { length: 512 }),
    businessEmailBidx: bytes("business_email_bidx", { length: 32 }).notNull(),
    passwordHash: text("password_hash"),
    passwordChangedAt: ts("password_changed_at"),
    status: mysqlEnum("status", USER_STATUSES).notNull().default("active"),
    statusReason: text("status_reason"),
    statusChangedAt: ts("status_changed_at"),
    statusChangedBy: uuidCol("status_changed_by").references((): AnyMySqlColumn => users.id),
    freezeStartedAt: ts("freeze_started_at"),
    failedLoginCount: int("failed_login_count").notNull().default(0),
    lockedUntil: ts("locked_until"),
    lastLoginAt: ts("last_login_at"),
    lastLoginIp: varchar("last_login_ip", { length: 45 }),
    loginCount: int("login_count").notNull().default(0),
    createdBy: uuidCol("created_by").references((): AnyMySqlColumn => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    uniqueIndex("uq_users_business_email").on(t.businessEmailBidx),
    index("ix_users_status").on(t.status),
  ],
);

export const userProfiles = mysqlTable(
  "user_profiles",
  {
    userId: uuidCol("user_id")
      .primaryKey()
      .references(() => users.id),
    contractorNumber: varchar("contractor_number", { length: 20 }).notNull(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    /** @deprecated Legacy duplicate ciphertext retained for the one-time backfill. */
    businessEmailCt: bytes("business_email_ct", { length: 512 }),
    personalEmail: varchar("personal_email", { length: 254 }),
    /** @deprecated Legacy ciphertext retained for the one-time plaintext backfill. */
    personalEmailCt: bytes("personal_email_ct", { length: 512 }),
    personalEmailBidx: bytes("personal_email_bidx", { length: 32 }).notNull(),
    phoneCt: bytes("phone_ct", { length: 512 }),
    idNumberCt: bytes("id_number_ct", { length: 512 }),
    location: varchar("location", { length: 255 }),
    profilePictureFileId: uuidCol("profile_picture_file_id").references(() => files.id),
    encKeyId: smallint("enc_key_id").notNull(),
    capPhaseHint: varchar("cap_phase_hint", { length: 30 }),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_profiles_contractor").on(t.contractorNumber),
    uniqueIndex("uq_profiles_personal_email").on(t.personalEmailBidx),
  ],
);

export const userPermissionOverrides = mysqlTable(
  "user_permission_overrides",
  {
    id: pk(),
    userId: uuidCol("user_id")
      .notNull()
      .references(() => users.id),
    permissionId: uuidCol("permission_id")
      .notNull()
      .references(() => permissions.id),
    effect: mysqlEnum("effect", ["grant", "deny"]).notNull(),
    reason: text("reason").notNull(),
    grantedBy: uuidCol("granted_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    expiresAt: ts("expires_at"),
  },
  (t) => [uniqueIndex("uq_override_user_permission").on(t.userId, t.permissionId)],
);

export type User = typeof users.$inferSelect;
