import { CreateUserSchema, PageQuerySchema, SetOverridesSchema } from "@cyneform/validators";
import { createZodDto } from "nestjs-zod";

export class CreateUserDto extends createZodDto(CreateUserSchema) {}
export class SetOverridesDto extends createZodDto(SetOverridesSchema) {}
export class PageQueryDto extends createZodDto(PageQuerySchema) {}
