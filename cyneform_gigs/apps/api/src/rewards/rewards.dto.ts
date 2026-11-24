import {
  BonusDecisionSchema,
  BonusQuerySchema,
  GrantEquitySchema,
  MilestoneSchema,
  PayBonusSchema,
  PayPayoutSchema,
} from "@cyneform/validators";
import { createZodDto } from "nestjs-zod";

export class BonusDecisionDto extends createZodDto(BonusDecisionSchema) {}
export class PayBonusDto extends createZodDto(PayBonusSchema) {}
export class BonusQueryDto extends createZodDto(BonusQuerySchema) {}
export class GrantEquityDto extends createZodDto(GrantEquitySchema) {}
export class MilestoneDto extends createZodDto(MilestoneSchema) {}
export class PayPayoutDto extends createZodDto(PayPayoutSchema) {}
