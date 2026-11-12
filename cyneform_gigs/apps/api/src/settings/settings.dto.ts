import { UpdateSettingsSchema } from "@cyneform/validators";
import { createZodDto } from "nestjs-zod";

export class UpdateSettingsDto extends createZodDto(UpdateSettingsSchema) {}
