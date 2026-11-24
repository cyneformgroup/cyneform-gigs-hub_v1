import { z } from "zod";

export const NOTIFICATION_TYPES = [
  "account.status_changed",
  "leave.requested",
  "leave.decided",
  "system",
  "gigs.published",
  "gigs.claimed",
  "gigs.released",
  "gigs.claim_expired",
  "points.awarded",
  "points.expired",
  "points.milestone",
  "points.verification",
  "crm.entry_created",
  "crm.followup_due",
  "crm.completed",
  "crm.call_booked",
  "crm.call_changed",
  "crm.flagged",
  "compensation.deal_closed",
  "compensation.approved",
  "compensation.paid",
  "compensation.rollover_expired",
  "bonus.candidate",
  "bonus.decided",
  "equity.granted",
  "equity.vesting",
  "equity.milestone",
  "equity.payout",
  "training.new",
  "calendar.invite",
  "calendar.reminder",
  "calendar.cancelled",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NotificationSchema = z.object({
  id: z.string(),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string(),
  body: z.string().nullable(),
  link: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export const NotificationPageSchema = z.object({
  items: z.array(NotificationSchema),
  unread: z.number().int(),
});

export const NotificationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
