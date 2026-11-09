import { z } from "zod";
import { PageQuerySchema, pageOf } from "./common";
import { KenyanPhoneSchema } from "./users";

export const MANAGEABLE_STATUSES = ["active", "frozen", "on_leave", "deactivated"] as const;
export const LEAVE_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;

const atLeastOne = (v: object) => Object.keys(v).length > 0;

export const UpdateMeSchema = z
  .object({
    phone: KenyanPhoneSchema.optional(),
    location: z.string().trim().max(255).optional(),
  })
  .refine(atLeastOne, "Change at least one field");

export const UpdateUserSchema = z
  .object({
    fullName: z.string().trim().min(2).max(255).optional(),
    phone: KenyanPhoneSchema.optional(),
    location: z.string().trim().max(255).optional(),
  })
  .refine(atLeastOne, "Change at least one field");

export const ChangeStatusSchema = z.object({
  status: z.enum(MANAGEABLE_STATUSES),
  reason: z.string().trim().min(3, "Give a short reason").max(500),
});

export const StatusHistoryItemSchema = z.object({
  id: z.uuid(),
  fromStatus: z.string().nullable(),
  toStatus: z.string(),
  reason: z.string(),
  changedByName: z.string().nullable(),
  createdAt: z.string(),
});

export const CreateLeaveSchema = z
  .object({
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    reason: z.string().trim().min(3, "Give a short reason").max(500),
  })
  .refine((v) => v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "End date must be on or after the start date",
  });

export const DecideLeaveSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.decision === "approved" || !!v.note, {
    path: ["note"],
    message: "Give a reason when rejecting",
  });

export const LeaveQuerySchema = PageQuerySchema.extend({
  status: z.enum(LEAVE_STATUSES).optional(),
});

export const LeaveRequestSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  userName: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  days: z.number(),
  reason: z.string(),
  status: z.enum(LEAVE_STATUSES),
  decidedByName: z.string().nullable(),
  decisionNote: z.string().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
});
export const LeavePageSchema = pageOf(LeaveRequestSchema);
