import {
  CreateMeetingSchema,
  MarkAttendanceSchema,
  MeetingQuerySchema,
} from "@cyneform/validators";
import { createZodDto } from "nestjs-zod";
export class CreateMeetingDto extends createZodDto(CreateMeetingSchema) {}
export class MarkAttendanceDto extends createZodDto(MarkAttendanceSchema) {}
export class MeetingQueryDto extends createZodDto(MeetingQuerySchema) {}
