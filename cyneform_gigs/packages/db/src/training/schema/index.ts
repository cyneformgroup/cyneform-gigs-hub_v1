import { sql } from "drizzle-orm";
import { boolean, index, int, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { pk, ts, uuidCol } from "../../columns";

export const trainingFiles = mysqlTable(
  "training_files",
  {
    id: pk(),
    title: varchar("title", { length: 150 }).notNull(),
    description: varchar("description", { length: 1000 }),
    folder: varchar("folder", { length: 60 }).notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    storedName: varchar("stored_name", { length: 80 }).notNull(),
    fileType: varchar("file_type", { length: 8 }).notNull(),
    sizeBytes: int("size_bytes").notNull(),
    watermark: varchar("watermark", { length: 200 }).notNull(),
    uploadedBy: uuidCol("uploaded_by").notNull(),
    createdAt: ts("created_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("training_folder_idx").on(t.folder)],
);

export const trainingViews = mysqlTable(
  "training_views",
  {
    id: pk(),
    fileId: uuidCol("file_id").notNull(),
    userId: uuidCol("user_id").notNull(),
    viewedAt: ts("viewed_at").notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    played: boolean("played").notNull().default(false),
    ip: varchar("ip", { length: 64 }),
    userAgent: varchar("user_agent", { length: 255 }),
    downloaded: int("downloaded").notNull().default(0),
  },
  (t) => [index("training_view_user_idx").on(t.userId, t.fileId)],
);
