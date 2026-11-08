import type {
  CreateUserSchema,
  PermissionOverrideSchema,
  SetOverridesSchema,
  UserDetailSchema,
  UserPageSchema,
  UserSummarySchema,
} from "@cyneform/validators";
import type { z } from "zod";

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UserSummary = z.infer<typeof UserSummarySchema>;
export type UserPage = z.infer<typeof UserPageSchema>;
export type UserDetail = z.infer<typeof UserDetailSchema>;
export type PermissionOverride = z.infer<typeof PermissionOverrideSchema>;
export type SetOverridesInput = z.infer<typeof SetOverridesSchema>;
