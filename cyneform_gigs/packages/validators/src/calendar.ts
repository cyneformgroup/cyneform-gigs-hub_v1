import { z } from "zod";

export const MEETING_DURATIONS = [15, 30, 45, 60, 120] as const;
export const RECURRENCES = ["none", "daily", "weekly", "monthly"] as const;
export const ATTENDANCE = ["pending", "attended", "absent"] as const;
export const CreateMeetingSchema = z
  .object({
    title: z.string().trim().min(3).max(150),
    description: z.string().trim().max(1000).optional(),
    startsAt: z.iso.datetime(),
    durationMin: z.union([
      z.literal(15),
      z.literal(30),
      z.literal(45),
      z.literal(60),
      z.literal(120),
    ]),
    agenda: z.string().trim().max(2000).optional(),
    link: z.url().max(500).optional(),
    allBdps: z.boolean().default(false),
    attendeeIds: z.array(z.uuid()).max(500).default([]),
    reminderMinutes: z.number().int().min(0).max(1440).default(60),
    recurrence: z.enum(RECURRENCES).default("none"),
    occurrences: z.number().int().min(2).max(26).optional(),
  })
  .refine((v) => v.allBdps || v.attendeeIds.length > 0, {
    path: ["attendeeIds"],
    message: "Choose at least one attendee",
  })
  .refine((v) => v.recurrence === "none" || v.occurrences !== undefined, {
    path: ["occurrences"],
    message: "Enter how many times it repeats",
  });
export const MarkAttendanceSchema = z.object({ userId: z.uuid(), attended: z.boolean() });
export const MeetingQuerySchema = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});
export const MeetingItemSchema = z.object({
  id: z.string(),
  seriesId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  startsAt: z.string(),
  durationMin: z.number(),
  agenda: z.string().nullable(),
  link: z.string(),
  recurrence: z.enum(RECURRENCES),
  cancelled: z.boolean(),
  myStatus: z.enum(ATTENDANCE).nullable(),
  attendees: z.array(
    z.object({ userId: z.string(), name: z.string().nullable(), status: z.enum(ATTENDANCE) }),
  ),
});
