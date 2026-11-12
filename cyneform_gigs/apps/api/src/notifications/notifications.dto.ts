import { NotificationQuerySchema } from "@cyneform/validators";
import { createZodDto } from "nestjs-zod";

export class NotificationQueryDto extends createZodDto(NotificationQuerySchema) {}
