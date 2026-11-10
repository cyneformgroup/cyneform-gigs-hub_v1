import { z } from "zod";
import { ROLE_CODES } from "./permissions";

export const PasswordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(128)
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/\d/, "Include a number")
  .regex(/[^A-Za-z0-9]/, "Include a special character");

export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
});
export const LoginResponseSchema = z.object({ challengeId: z.uuid() });
export const VerifyOtpSchema = z.object({
  challengeId: z.uuid(),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
export const SetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: PasswordSchema,
});
export const ForgotPasswordSchema = z.object({ email: z.email() });

export const SessionUserSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  role: z.enum(ROLE_CODES),
  permissions: z.array(z.string()),
});
export const AuthSessionSchema = z.object({
  accessToken: z.string(),
  user: SessionUserSchema,
});
