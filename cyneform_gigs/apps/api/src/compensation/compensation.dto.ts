import {
  ApproveDealSchema,
  CloseDealSchema,
  DealQuerySchema,
  EliteSchema,
  PayDealSchema,
} from "@cyneform/validators";
import { createZodDto } from "nestjs-zod";

export class CloseDealDto extends createZodDto(CloseDealSchema) {}
export class ApproveDealDto extends createZodDto(ApproveDealSchema) {}
export class PayDealDto extends createZodDto(PayDealSchema) {}
export class EliteDto extends createZodDto(EliteSchema) {}
export class DealQueryDto extends createZodDto(DealQuerySchema) {}
