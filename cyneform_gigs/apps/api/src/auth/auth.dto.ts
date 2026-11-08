import {
  ForgotPasswordSchema,
  LoginSchema,
  SetPasswordSchema,
  VerifyOtpSchema,
} from "@cyneform/validators";
import { createZodDto } from "nestjs-zod";

export class LoginDto extends createZodDto(LoginSchema) {}
export class VerifyOtpDto extends createZodDto(VerifyOtpSchema) {}
export class SetPasswordDto extends createZodDto(SetPasswordSchema) {}
export class ForgotPasswordDto extends createZodDto(ForgotPasswordSchema) {}
