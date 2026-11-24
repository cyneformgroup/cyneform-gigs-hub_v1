import type {
  CreateMeetingSchema,
  MarkAttendanceSchema,
  MeetingItemSchema,
  MeetingQuerySchema,
  TrainingItemSchema,
  UploadTrainingSchema,
  ViewSessionSchema,
} from "@cyneform/validators";
import type { z } from "zod";
export type UploadTrainingInput = z.infer<typeof UploadTrainingSchema>;
export type TrainingItem = z.infer<typeof TrainingItemSchema>;
export type ViewSession = z.infer<typeof ViewSessionSchema>;
export type CreateMeetingInput = z.infer<typeof CreateMeetingSchema>;
export type MarkAttendanceInput = z.infer<typeof MarkAttendanceSchema>;
export type MeetingQuery = z.infer<typeof MeetingQuerySchema>;
export type MeetingItem = z.infer<typeof MeetingItemSchema>;
