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

export const crmEntries = mysqlTable(
  "crm_entries",
  {
    id: pk(),
    leadId: ref("lead_id").notNull(),
    userId: ref("user_id").notNull(),
    clientName: varchar("client_name", { length: 255 }).notNull(),
    eventDescription: text("event_description"),
    clientType: varchar("client_type", { length: 80 }),
    decisionMakerName: varchar("decision_maker_name", { length: 255 }),
    jobTitle: varchar("job_title", { length: 255 }),
    contacts: text("contacts").notNull(), // JSON
    outreachChannels: text("outreach_channels").notNull(), // JSON array
    socialPlatforms: text("social_platforms").notNull(), // JSON array
    outreachNotes: text("outreach_notes"),
    statuses: text("statuses").notNull(), // JSON array, the multi-select progress
    currentStatus: varchar("current_status", { length: 30 }).notNull(),
    followup1Date: opt("followup_1_date"),
    followup2Date: opt("followup_2_date"),
    followup3Date: opt("followup_3_date"),
    followup1NotifiedAt: opt("followup_1_notified_at"),
    followup2NotifiedAt: opt("followup_2_notified_at"),
    followup3NotifiedAt: opt("followup_3_notified_at"),
    isCompleted: boolean("is_completed").notNull().default(false),
    completedAt: opt("completed_at"),
    callStatus: varchar("call_status", { length: 20 }), // booked | rescheduled | cancelled
    callStartsAt: opt("call_starts_at"),
    calBookingUid: varchar("cal_booking_uid", { length: 100 }),
    wonAt: opt("won_at"),
    lostAt: opt("lost_at"),
    flaggedGenericAt: opt("flagged_generic_at"),
    flaggedBy: ref("flagged_by"),
    flagReason: varchar("flag_reason", { length: 500 }),
    closedProject: text("closed_project"),
    estimatedValue: decimal("estimated_value", { precision: 14, scale: 2, mode: "number" }),
    createdAt: stamp("created_at"),
    updatedAt: datetime("updated_at", { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("crm_entries_lead_uq").on(t.leadId), // one entry per lead
    index("crm_entries_user_idx").on(t.userId, t.currentStatus),
    index("crm_entries_cal_idx").on(t.calBookingUid),
  ],
);

export const crmFiles = mysqlTable(
  "crm_files",
  {
    id: pk(),
    entryId: ref("entry_id").notNull(),
    userId: ref("user_id").notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    mime: varchar("mime", { length: 100 }).notNull(),
    size: int("size").notNull(),
    storageKey: varchar("storage_key", { length: 255 }).notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    createdAt: stamp("created_at"),
  },
  (t) => [index("crm_files_entry_idx").on(t.entryId)],
);

/** Replay protection for webhooks: one row per distinct payload. */
export const calcomEvents = mysqlTable(
  "calcom_events",
  {
    id: pk(),
    payloadHash: char("payload_hash", { length: 64 }).notNull(),
    eventType: varchar("event_type", { length: 40 }).notNull(),
    bookingUid: varchar("booking_uid", { length: 100 }),
    receivedAt: stamp("received_at"),
  },
  (t) => [uniqueIndex("calcom_events_hash_uq").on(t.payloadHash)],
);
