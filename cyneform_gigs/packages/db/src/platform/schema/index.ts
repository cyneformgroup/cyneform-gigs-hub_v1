import { bigint, char, json, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { bytes, createdAt, pk, ts, uuidCol } from "../../columns";
import { users } from "../../users/schema";

export const files = mysqlTable(
  "files",
  {
    id: pk(),
    bucket: varchar("bucket", { length: 60 }).notNull(),
    objectKey: varchar("object_key", { length: 512 }).notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    checksumSha256: bytes("checksum_sha256", { length: 32 }),
    purpose: varchar("purpose", { length: 20 }).notNull(),
    scanStatus: varchar("scan_status", { length: 12 }).notNull().default("pending"),
    uploadedBy: uuidCol("uploaded_by").references(() => users.id),
    createdAt: createdAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [uniqueIndex("uq_files_object").on(t.bucket, t.objectKey)],
);
/**
 * Append-only: update and delete are blocked by triggers (see the audit_append_only migration).
 */
export const auditLogs = mysqlTable("audit_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  occurredAt: ts("occurred_at").notNull(),
  actorUserId: uuidCol("actor_user_id").references(() => users.id),
  actorRole: varchar("actor_role", { length: 30 }),
  action: varchar("action", { length: 100 }).notNull(),
  targetType: varchar("target_type", { length: 50 }),
  targetId: char("target_id", { length: 36 }),
  details: json("details"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 255 }),
  requestId: char("request_id", { length: 36 }),
  prevHash: bytes("prev_hash", { length: 32 }),
  rowHash: bytes("row_hash", { length: 32 }).notNull(),
});
