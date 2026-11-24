import { UploadTrainingSchema } from "@cyneform/validators";
import { createZodDto } from "nestjs-zod";
export class UploadTrainingDto extends createZodDto(UploadTrainingSchema) {}
