import { z } from "zod";
import { ContactsSchema, LEAD_STATUSES } from "./sources";

export const GigQuerySchema = z.object({
  status: z.enum(LEAD_STATUSES).default("pending_review"),
  search: z.string().trim().max(100).optional(),
  sourceId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(50),
});

export const GigItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  clientName: z.string().nullable(),
  venue: z.string().nullable(),
  location: z.string().nullable(),
  category: z.string().nullable(),
  budget: z.number().nullable(),
  currency: z.string().nullable(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  eventUrl: z.string(),
  contacts: ContactsSchema,
  status: z.enum(LEAD_STATUSES),
  sourceName: z.string().nullable(),
  createdAt: z.string(),
  publishedAt: z.string().nullable(),
  rejectReason: z.string().nullable(),
});

export const GigPageSchema = z.object({
  items: z.array(GigItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  counts: z.record(z.string(), z.number()),
});

export const ReviewGigsSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(200),
    action: z.enum(["approve", "reject"]),
    reason: z.string().trim().max(255).optional(),
  })
  .refine((v) => v.action !== "reject" || (v.reason?.length ?? 0) >= 3, {
    path: ["reason"],
    message: "Give a short reason",
  });

export const ReviewResultSchema = z.object({
  updated: z.number(),
  skipped: z.number(),
});
