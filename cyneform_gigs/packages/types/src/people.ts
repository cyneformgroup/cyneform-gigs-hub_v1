import type {
  ChangeStatusSchema,
  CreateLeaveSchema,
  DecideLeaveSchema,
  LeavePageSchema,
  LeaveQuerySchema,
  LeaveRequestSchema,
  StatusHistoryItemSchema,
  UpdateMeSchema,
  UpdateUserSchema,
} from "@cyneform/validators";
import type { z } from "zod";

export type UpdateMeInput = z.infer<typeof UpdateMeSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type ChangeStatusInput = z.infer<typeof ChangeStatusSchema>;
export type StatusHistoryItem = z.infer<typeof StatusHistoryItemSchema>;
export type CreateLeaveInput = z.infer<typeof CreateLeaveSchema>;
export type DecideLeaveInput = z.infer<typeof DecideLeaveSchema>;
export type LeaveQuery = z.infer<typeof LeaveQuerySchema>;
export type LeaveRequest = z.infer<typeof LeaveRequestSchema>;
export type LeavePage = z.infer<typeof LeavePageSchema>;
