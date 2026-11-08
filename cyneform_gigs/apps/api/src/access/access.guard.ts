import { and, authSessions, eq, isNull, roles, users } from "@cyneform/db";
import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AppError, forbidden, unauthorized } from "../common/errors";
import { AUTH } from "../config/env";
import { DB, type Db } from "../database/database.module";
import { AccessService } from "./access.service";
import { IS_PUBLIC, PERMISSIONS_KEY } from "./auth-user";
import { verifyAccessToken } from "./jwt";

/**
 * Runs on every route: checks the access token, that its session is alive (not revoked, not idle),
 * that the account is active, then that the user holds the permissions the route asks for.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(AccessService)
    private readonly access: AccessService,
    @Inject(DB) private readonly db: Db,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.get("authorization");
    if (!header?.startsWith("Bearer ")) throw unauthorized();

    let claims: Awaited<ReturnType<typeof verifyAccessToken>>;
    try {
      claims = await verifyAccessToken(header.slice(7));
    } catch {
      throw unauthorized("TOKEN_EXPIRED", "Your session has expired.");
    }

    const [row] = await this.db
      .select({
        session: authSessions,
        status: users.status,
        deletedAt: users.deletedAt,
        roleId: users.roleId,
        role: roles.code,
      })
      .from(authSessions)
      .innerJoin(users, eq(users.id, authSessions.userId))
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(
        and(
          eq(authSessions.id, claims.sid),
          eq(authSessions.userId, claims.sub),
          isNull(authSessions.revokedAt),
        ),
      )
      .limit(1);

    const now = new Date();
    if (!row || row.session.expiresAt <= now)
      throw unauthorized("SESSION_ENDED", "Your session has ended.");
    if (row.session.lastActiveAt.getTime() < now.getTime() - AUTH.idleMinutes * 60_000) {
      await this.db
        .update(authSessions)
        .set({ revokedAt: now, revokeReason: "idle" })
        .where(eq(authSessions.id, claims.sid));
      throw unauthorized("SESSION_IDLE", "You were signed out after a period of inactivity.");
    }
    if (row.status !== "active" || row.deletedAt)
      throw new AppError("ACCOUNT_INACTIVE", "This account is not active.", 403);

    if (now.getTime() - row.session.lastActiveAt.getTime() > 60_000) {
      await this.db
        .update(authSessions)
        .set({ lastActiveAt: now })
        .where(eq(authSessions.id, claims.sid));
    }

    const granted = await this.access.effectivePermissions(claims.sub, row.roleId, row.role);
    req.user = {
      id: claims.sub,
      role: row.role,
      sessionId: claims.sid,
      permissions: granted,
    };

    const required =
      this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, targets) ?? [];
    if (!required.every((code) => granted.has(code))) throw forbidden();
    return true;
  }
}
