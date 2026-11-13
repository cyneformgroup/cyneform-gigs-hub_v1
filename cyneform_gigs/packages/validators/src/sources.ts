import { z } from "zod";

export const SOURCE_STRATEGIES = ["jsonld", "ical", "selectors"] as const;
export const SCHEDULE_PRESETS = {
  hourly: "0 * * * *",
  daily: "0 8 * * *",
  weekly: "0 8 * * 1",
} as const;
export const SOURCE_HEALTH = ["unknown", "healthy", "degraded", "failed", "blocked"] as const;
export const RUN_STATUSES = ["running", "success", "partial", "failed"] as const;
/** Spec statuses (new, claimed, outreach_sent, archived) plus the review step before publishing. */
export const LEAD_STATUSES = [
  "pending_review",
  "rejected",
  "new",
  "claimed",
  "outreach_sent",
  "archived",
] as const;
export type SourceStrategy = (typeof SOURCE_STRATEGIES)[number];
export type SourceHealth = (typeof SOURCE_HEALTH)[number];
export type RunStatus = (typeof RUN_STATUSES)[number];
export type LeadStatus = (typeof LEAD_STATUSES)[number];

const HttpsUrl = z
  .url()
  .max(500)
  .refine((u) => u.startsWith("https://"), "Use an https:// link");
/** "css selector" or "css selector@attribute", e.g. "a.title@href" or "time@datetime". */
const Sel = z.string().trim().min(1).max(300);
const Cron = z
  .string()
  .trim()
  .regex(/^\S+(\s+\S+){4}$/, "Use 5 fields, e.g. 0 8 * * *");
const Keywords = z.array(z.string().trim().min(2).max(40)).max(30);

export const SourceConfigSchema = z.discriminatedUnion("strategy", [
  z.object({ strategy: z.literal("jsonld"), linkSelector: Sel.optional() }),
  z.object({ strategy: z.literal("ical") }),
  z.object({
    strategy: z.literal("selectors"),
    itemSelector: Sel,
    nextSelector: Sel.optional(),
    fields: z.object({
      title: Sel,
      link: Sel.optional(),
      date: Sel.optional(),
      venue: Sel.optional(),
      description: Sel.optional(),
      organizer: Sel.optional(),
      price: Sel.optional(),
      contact: Sel.optional(),
    }),
  }),
]);
export type SourceConfig = z.infer<typeof SourceConfigSchema>;

export const SourceInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    startUrls: z.array(HttpsUrl).min(1, "Add at least one link").max(10),
    category: z.string().trim().max(60).optional(),
    schedule: Cron.nullable(),
    includeKeywords: Keywords,
    excludeKeywords: Keywords,
    maxPages: z.number().int().min(1).max(500).optional(),
    enabled: z.boolean(),
    autoPublish: z.boolean(),
    tosChecked: z.boolean(),
    tosNote: z.string().trim().max(500).optional(),
    config: SourceConfigSchema,
  })
  .refine((v) => !v.enabled || v.tosChecked, {
    path: ["tosChecked"],
    message: "Confirm you checked the site’s terms and robots.txt before enabling",
  });

export const SourceItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  startUrls: z.array(z.string()),
  category: z.string().nullable(),
  schedule: z.string().nullable(),
  nextRunAt: z.string().nullable(),
  includeKeywords: z.array(z.string()),
  excludeKeywords: z.array(z.string()),
  maxPages: z.number().nullable(),
  enabled: z.boolean(),
  autoPublish: z.boolean(),
  health: z.enum(SOURCE_HEALTH),
  lastRunAt: z.string().nullable(),
  tosCheckedAt: z.string().nullable(),
  tosNote: z.string().nullable(),
  config: SourceConfigSchema,
});

export const RunItemSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  sourceName: z.string().nullable(),
  trigger: z.enum(["schedule", "manual"]),
  status: z.enum(RUN_STATUSES),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  pages: z.number(),
  found: z.number(),
  added: z.number(),
  duplicates: z.number(),
  rejected: z.number(),
  errorCount: z.number(),
});
export const RunDetailSchema = RunItemSchema.extend({
  errors: z.array(
    z.object({
      url: z.string().nullable(),
      stage: z.string(),
      message: z.string(),
    }),
  ),
});
export const RunQuerySchema = z.object({
  sourceId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const PreviewResultSchema = z.object({
  pages: z.number(),
  blocked: z.boolean(),
  acceptedTotal: z.number(),
  accepted: z.array(
    z.object({
      title: z.string(),
      startsAt: z.string(),
      venue: z.string().nullable(),
      url: z.string(),
    }),
  ),
  rejectedTotal: z.number(),
  rejected: z.array(z.object({ title: z.string(), reason: z.string() })),
  errors: z.array(z.object({ url: z.string(), stage: z.string(), message: z.string() })),
});

export const ContactsSchema = z.object({
  emails: z.array(z.string()),
  phones: z.array(z.string()),
  handles: z.array(z.string()),
  websites: z.array(z.string()),
});

/** One extracted gig after normalisation. Anything that fails this is rejected, never stored. */
export const GigDraftSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().max(5000).nullable(),
  clientName: z.string().max(255).nullable(),
  venue: z.string().max(255).nullable(),
  location: z.string().max(255).nullable(),
  category: z.string().max(60).nullable(),
  budget: z.number().nonnegative().nullable(),
  currency: z.string().length(3).nullable(),
  startsAt: z.date(),
  endsAt: z.date().nullable(),
  eventUrl: z.url().max(500),
  contacts: ContactsSchema,
});
export type GigDraft = z.infer<typeof GigDraftSchema>;
