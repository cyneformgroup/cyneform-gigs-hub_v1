import { GigQuerySchema, ReviewGigsSchema } from "@cyneform/validators";
import { createZodDto } from "nestjs-zod";

export class GigQueryDto extends createZodDto(GigQuerySchema) {}
export class ReviewGigsDto extends createZodDto(ReviewGigsSchema) {}
