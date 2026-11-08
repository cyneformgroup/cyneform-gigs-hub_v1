import type { PermissionCode, RoleCode } from "@cyneform/types";
import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Request } from "express";

export interface AuthUser {
  id: string;
  role: RoleCode;
  sessionId: string;
  permissions: ReadonlySet<string>;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const IS_PUBLIC = "isPublic";
export const PERMISSIONS_KEY = "permissions";

/** Skip authentication for this route. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Require every listed permission. Routes without this still require a signed-in user. */
export const RequirePermissions = (...codes: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, codes);
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<Request>();
  const user = request.user;
  if (!user) throw new Error("User not found");
  return user as AuthUser;
});
