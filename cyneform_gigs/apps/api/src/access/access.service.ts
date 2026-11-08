import {
  and,
  eq,
  gt,
  isNull,
  or,
  permissions,
  rolePermissions,
  userPermissionOverrides,
} from "@cyneform/db";
import type { RoleCode } from "@cyneform/types";
import { Inject, Injectable } from "@nestjs/common";
import { DB, type Db } from "../database/database.module";

@Injectable()
export class AccessService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Role defaults, plus per-user grants, minus per-user denies. Super Admin is never restricted. */
  async effectivePermissions(userId: string, roleId: string, role: RoleCode): Promise<Set<string>> {
    const base = await this.db
      .select({ code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(rolePermissions.roleId, roleId));
    const result = new Set<string>(base.map((r: { code: string }) => r.code));
    if (role === "super_admin") return result;

    const overrides = await this.db
      .select({
        code: permissions.code,
        effect: userPermissionOverrides.effect,
      })
      .from(userPermissionOverrides)
      .innerJoin(permissions, eq(permissions.id, userPermissionOverrides.permissionId))
      .where(
        and(
          eq(userPermissionOverrides.userId, userId),
          or(
            isNull(userPermissionOverrides.expiresAt),
            gt(userPermissionOverrides.expiresAt, new Date()),
          ),
        ),
      );
    for (const o of overrides) if (o.effect === "grant") result.add(o.code);
    for (const o of overrides) if (o.effect === "deny") result.delete(o.code);
    return result;
  }
}
