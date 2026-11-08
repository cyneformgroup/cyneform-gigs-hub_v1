import type {
  AuthSessionSchema,
  LoginResponseSchema,
  LoginSchema,
  SessionUserSchema,
  SetPasswordSchema,
  VerifyOtpSchema,
} from "@cyneform/validators";
import type { z } from "zod";

export type LoginInput = z.infer<typeof LoginSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
export type SetPasswordInput = z.infer<typeof SetPasswordSchema>;
export type SessionUser = z.infer<typeof SessionUserSchema>;
export type AuthSession = z.infer<typeof AuthSessionSchema>;
