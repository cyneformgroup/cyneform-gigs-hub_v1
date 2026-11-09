import { CreateLeaveSchema, DecideLeaveSchema, LeaveQuerySchema } from "@cyneform/validators";
import { createZodDto } from "nestjs-zod";

export class CreateLeaveDto extends createZodDto(CreateLeaveSchema) {}
export class DecideLeaveDto extends createZodDto(DecideLeaveSchema) {}
export class LeaveQueryDto extends createZodDto(LeaveQuerySchema) {}
