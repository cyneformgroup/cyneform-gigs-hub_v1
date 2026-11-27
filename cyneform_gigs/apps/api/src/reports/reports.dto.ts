import {
  AdminReportQuerySchema,
  SubmissionQuerySchema,
  SubmitReportSchema,
} from "@cyneform/validators";
import { createZodDto } from "nestjs-zod";

export class SubmitReportDto extends createZodDto(SubmitReportSchema) {}
export class AdminReportQueryDto extends createZodDto(AdminReportQuerySchema) {}
export class SubmissionQueryDto extends createZodDto(SubmissionQuerySchema) {}
