import type { LeadStatus, RunStatus, SourceHealth, SourceStrategy } from "@cyneform/types";
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
  varchar,
} from "drizzle-orm/mysql-core";
import { newId } from "../../columns";

const pk = () => char("id", { length: 36 }).primaryKey().$defaultFn(newId);
const ref = (name: string) => char(name, { length: 36 });
const opt = (name: string) => datetime(name, { fsp: 3 });
const created = () =>
  datetime("created_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`);
const updated = () =>
  datetime("updated_at", { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$onUpdate(() => new Date());

export const leadSources = mysqlTable("lead_sources", {
  id: pk(),
  name: varchar("name", { length: 120 }).notNull(),
  startUrls: text("start_urls").notNull(), // JSON array
  strategy: varchar("strategy", { length: 12 }).$type<SourceStrategy>().notNull(),
  config: text("config").notNull(), // JSON, validated by SourceConfigSchema
  filters: text("filters").notNull(), // JSON {include, exclude}
  category: varchar("category", { length: 60 }),
  maxPages: int("max_pages"),
  schedule: varchar("schedule", { length: 60 }), // cron, null = manual only
  enabled: boolean("enabled").notNull().default(true),
  autoPublish: boolean("auto_publish").notNull().default(false),
  health: varchar("health", { length: 12 }).$type<SourceHealth>().notNull().default("unknown"),
  lastRunAt: opt("last_run_at"),
  tosCheckedAt: opt("tos_checked_at"),
  tosNote: varchar("tos_note", { length: 500 }),
  createdBy: ref("created_by"),
  createdAt: created(),
  updatedAt: updated(),
  deletedAt: opt("deleted_at"),
});

export const harvestRuns = mysqlTable(
  "harvest_runs",
  {
    id: pk(),
    sourceId: ref("source_id").notNull(),
    trigger: varchar("trigger_type", { length: 10 }).$type<"schedule" | "manual">().notNull(),
    status: varchar("status", { length: 10 }).$type<RunStatus>().notNull(),
    startedBy: ref("started_by"),
    startedAt: datetime("started_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    finishedAt: opt("finished_at"),
    pages: int("pages").notNull().default(0),
    found: int("found").notNull().default(0),
    added: int("added").notNull().default(0),
    duplicates: int("duplicates").notNull().default(0),
    rejected: int("rejected").notNull().default(0),
    errorCount: int("error_count").notNull().default(0),
  },
  (t) => [index("harvest_runs_source_idx").on(t.sourceId, t.startedAt)],
);

export const harvestRunErrors = mysqlTable(
  "harvest_run_errors",
  {
    id: pk(),
    runId: ref("run_id").notNull(),
    url: varchar("url", { length: 500 }),
    stage: varchar("stage", { length: 20 }).notNull(),
    message: varchar("message", { length: 500 }).notNull(),
    createdAt: created(),
  },
  (t) => [index("harvest_errors_run_idx").on(t.runId)],
);

export const leads = mysqlTable(
  "leads",
  {
    id: pk(),
    sourceId: ref("source_id"),
    runId: ref("run_id"),
    title: varchar("title", { length: 255 }).notNull(), // spec: event_name
    description: text("description"),
    clientName: varchar("client_name", { length: 255 }),
    venue: varchar("venue", { length: 255 }),
    location: varchar("location", { length: 255 }),
    category: varchar("category", { length: 60 }),
    budget: decimal("budget", { precision: 12, scale: 2, mode: "number" }),
    currency: char("currency", { length: 3 }),
    startsAt: datetime("starts_at", { fsp: 3 }).notNull(), // spec: event_date
    endsAt: opt("ends_at"),
    eventUrl: varchar("event_url", { length: 500 }).notNull(),
    fingerprint: char("fingerprint", { length: 64 }).notNull().unique(),
    contacts: text("contacts").notNull(), // JSON
    status: varchar("status", { length: 20 })
      .$type<LeadStatus>()
      .notNull()
      .default("pending_review"),
    publishedAt: opt("published_at"),
    reviewedBy: ref("reviewed_by"),
    reviewedAt: opt("reviewed_at"),
    rejectReason: varchar("reject_reason", { length: 255 }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("leads_status_idx").on(t.status, t.startsAt),
    index("leads_event_url_idx").on(t.eventUrl),
    index("leads_source_idx").on(t.sourceId),
  ],
);
