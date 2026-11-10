import {
  ChangeStatusSchema,
  CreateUserSchema,
  DeleteUserSchema,
  PageQuerySchema,
  SetOverridesSchema,
  UpdateMeSchema,
  UpdateUserSchema,
} from "@cyneform/validators";
import { createZodDto } from "nestjs-zod";

export class CreateUserDto extends createZodDto(CreateUserSchema) {}
export class SetOverridesDto extends createZodDto(SetOverridesSchema) {}
export class PageQueryDto extends createZodDto(PageQuerySchema) {}
export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
export class UpdateMeDto extends createZodDto(UpdateMeSchema) {}
export class ChangeStatusDto extends createZodDto(ChangeStatusSchema) {}
export class DeleteUserDto extends createZodDto(DeleteUserSchema) {}
