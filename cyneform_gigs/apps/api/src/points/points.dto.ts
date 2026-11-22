import {
  AdjustSchema,
  AwardSchema,
  LedgerQuerySchema,
  RestoreVersionSchema,
  UpdateRulesSchema,
  VerifySchema,
} from "@cyneform/validators";
import { createZodDto } from "nestjs-zod";

export class UpdateRulesDto extends createZodDto(UpdateRulesSchema) {}
export class RestoreVersionDto extends createZodDto(RestoreVersionSchema) {}
export class LedgerQueryDto extends createZodDto(LedgerQuerySchema) {}
export class AwardDto extends createZodDto(AwardSchema) {}
export class AdjustDto extends createZodDto(AdjustSchema) {}
export class VerifyDto extends createZodDto(VerifySchema) {}
