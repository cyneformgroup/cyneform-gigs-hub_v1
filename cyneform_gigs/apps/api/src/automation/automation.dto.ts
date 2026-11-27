import {
  CreateDataRequestSchema,
  DataRequestQuerySchema,
  DeleteAccountSchema,
  ResolveDataRequestSchema,
} from "@cyneform/validators";
import { createZodDto } from "nestjs-zod";

export class DeleteAccountDto extends createZodDto(DeleteAccountSchema) {}
export class CreateDataRequestDto extends createZodDto(CreateDataRequestSchema) {}
export class ResolveDataRequestDto extends createZodDto(ResolveDataRequestSchema) {}
export class DataRequestQueryDto extends createZodDto(DataRequestQuerySchema) {}
