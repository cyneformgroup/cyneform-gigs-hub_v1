import {
  ChangeEntryStatusSchema,
  EntryQuerySchema,
  FlagEntrySchema,
  OutreachSchema,
  UpdateEntrySchema,
} from "@cyneform/validators";
import { createZodDto } from "nestjs-zod";

export class OutreachDto extends createZodDto(OutreachSchema) {}
export class UpdateEntryDto extends createZodDto(UpdateEntrySchema) {}
export class ChangeEntryStatusDto extends createZodDto(ChangeEntryStatusSchema) {}
export class EntryQueryDto extends createZodDto(EntryQuerySchema) {}
export class FlagEntryDto extends createZodDto(FlagEntrySchema) {}
