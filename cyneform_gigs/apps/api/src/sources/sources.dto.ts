import { RunQuerySchema, SourceInputSchema } from "@cyneform/validators";
import { createZodDto } from "nestjs-zod";

export class SourceInputDto extends createZodDto(SourceInputSchema) {}
export class RunQueryDto extends createZodDto(RunQuerySchema) {}
