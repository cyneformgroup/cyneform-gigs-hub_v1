import { z } from "zod";
import { pageOf } from "./common";
import { PERMISSIONS, ROLE_CODES, USER_STATUSES } from "./permissions";

export const KenyanPhoneSchema = z
  .string()
  .regex(/^\+254[17]\d{8}$/, "Use the format +254712345678");

export const CreateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(255),
  businessEmail: z.email(),
  personalEmail: z.email(),
  phone: KenyanPhoneSchema.optional(),
  location: z.string().trim().max(255).optional(),
  role: z.enum(["admin", "bdp"]).default("bdp"),
});

export const UserSummarySchema = z.object({
  id: z.uuid(),
  contractorNumber: z.string(),
  fullName: z.string(),
  businessEmail: z.string(),
  role: z.enum(ROLE_CODES),
  status: z.enum(USER_STATUSES),
  passwordSet: z.boolean(),
  location: z.string().nullable(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export const UserPageSchema = pageOf(UserSummarySchema);

export const PermissionOverrideSchema = z.object({
  permissionCode: z.enum(PERMISSIONS.map((p) => p.code) as [string, ...string[]]),
  effect: z.enum(["grant", "deny"]),
  reason: z.string().trim().min(3).max(500),
  expiresAt: z.iso.datetime().nullable().optional(),
});
export const SetOverridesSchema = z.object({
  overrides: z.array(PermissionOverrideSchema).max(50),
});

export const UserDetailSchema = UserSummarySchema.extend({
  personalEmail: z.string(),
  phone: z.string().nullable(),
  effectivePermissions: z.array(z.string()),
  overrides: z.array(PermissionOverrideSchema),
});
