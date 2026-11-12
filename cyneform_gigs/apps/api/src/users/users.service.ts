import {
  and,
  authSessions,
  count,
  desc,
  eq,
  inArray,
  isNull,
  like,
  newId,
  permissions,
  roles,
  userPermissionOverrides,
  userProfiles,
  userStatusHistory,
  users,
} from "@cyneform/db";
import type {
  ChangeStatusInput,
  CreateUserInput,
  DeleteUserInput,
  PageQuery,
  RoleCode,
  SetOverridesInput,
  StatusHistoryItem,
  UpdateMeInput,
  UpdateUserInput,
  UserDetail,
  UserSummary,
} from "@cyneform/types";
import { PERMISSIONS } from "@cyneform/validators";
import { Inject, Injectable } from "@nestjs/common";
import { AccessService } from "../access/access.service";
import type { AuthUser } from "../access/auth-user";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import type { ClientInfo } from "../common/client-info";
import { blindIndex, currentKeyId, decrypt, encrypt, storedEmail } from "../common/crypto";
import { badRequest, conflict, forbidden, notFound } from "../common/errors";
import { AUTH, env } from "../config/env";
import { DB, type Db } from "../database/database.module";
import { MailService } from "../mail/mail.service";

type Actor = Pick<AuthUser, "id" | "role" | "permissions"> | null; // null = system (seed)

const iso = (d: Date | null) => (d ? d.toISOString() : null);

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AccessService)
    private readonly access: AccessService,
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(AuditService)
    private readonly audit: AuditService,
    @Inject(MailService)
    private readonly mail: MailService,
  ) {}

  private readonly summaryColumns = {
    id: users.id,
    contractorNumber: userProfiles.contractorNumber,
    fullName: userProfiles.fullName,
    businessEmail: users.businessEmail,
    legacyBusinessEmailCt: users.businessEmailCt,
    deactivationType: users.deactivationType,
    role: roles.code,
    status: users.status,
    passwordHash: users.passwordHash,
    location: userProfiles.location,
    lastLoginAt: users.lastLoginAt,
    createdAt: users.createdAt,
  };

  private toSummary(r: {
    id: string;
    contractorNumber: string;
    fullName: string;
    businessEmail: string | null;
    legacyBusinessEmailCt: Buffer | null;
    deactivationType: UserSummary["deactivationType"];
    role: RoleCode;
    status: UserSummary["status"];
    passwordHash: string | null;
    location: string | null;
    lastLoginAt: Date | null;
    createdAt: Date;
  }): UserSummary {
    return {
      id: r.id,
      contractorNumber: r.contractorNumber,
      fullName: r.fullName,
      businessEmail: storedEmail(r.businessEmail, r.legacyBusinessEmailCt),
      role: r.role,
      status: r.status,
      deactivationType: r.deactivationType,
      passwordSet: !!r.passwordHash,
      location: r.location,
      lastLoginAt: iso(r.lastLoginAt),
      createdAt: r.createdAt.toISOString(),
    };
  }

  async list(q: PageQuery) {
    const where = and(
      isNull(users.deletedAt),
      q.search ? like(userProfiles.fullName, `%${q.search}%`) : undefined,
    );
    const base = this.db
      .select(this.summaryColumns)
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(where);
    const [rows, [{ total } = { total: 0 }]] = await Promise.all([
      base
        .orderBy(desc(users.createdAt))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db
        .select({ total: count() })
        .from(users)
        .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(where),
    ]);
    return {
      items: rows.map((r) => this.toSummary(r)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async detail(id: string, actor: Actor, client?: ClientInfo): Promise<UserDetail> {
    const [r] = await this.db
      .select({
        ...this.summaryColumns,
        roleId: users.roleId,
        personalEmail: userProfiles.personalEmail,
        personalEmailCt: userProfiles.personalEmailCt,
        phoneCt: userProfiles.phoneCt,
        deactivationType: users.deactivationType,
      })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);
    if (!r) throw notFound("User not found.");
    const overrides = await this.db
      .select({
        code: permissions.code,
        effect: userPermissionOverrides.effect,
        reason: userPermissionOverrides.reason,
        expiresAt: userPermissionOverrides.expiresAt,
      })
      .from(userPermissionOverrides)
      .innerJoin(permissions, eq(permissions.id, userPermissionOverrides.permissionId))
      .where(eq(userPermissionOverrides.userId, id));
    const effective = await this.access.effectivePermissions(id, r.roleId, r.role);
    if (actor)
      await this.audit.record({
        actor,
        action: "users.view_pii",
        targetType: "user",
        targetId: id,
        client,
      });
    return {
      ...this.toSummary(r),
      personalEmail: storedEmail(r.personalEmail, r.personalEmailCt),
      phone: r.phoneCt ? decrypt(r.phoneCt) : null,
      effectivePermissions: [...effective].sort(),
      overrides: overrides.map((o) => ({
        permissionCode: o.code,
        effect: o.effect,
        reason: o.reason,
        expiresAt: iso(o.expiresAt),
      })),
    };
  }

  /** Creates the account and emails a one-time set-password link. Nobody's password is ever chosen for them. */
  async provision(
    input: Omit<CreateUserInput, "role" | "phone" | "location" | "idNumber"> &
      Partial<Pick<CreateUserInput, "phone" | "location" | "idNumber">> & {
        role: RoleCode;
      },
    actor: Actor,
    client?: ClientInfo,
  ): Promise<UserSummary> {
    // Keep the service resilient if a caller does not materialize the schema default.
    const roleCode = input.role ?? "bdp";
    if (roleCode !== "bdp" && actor && !actor.permissions.has("users.manage_admins"))
      throw forbidden();

    const businessEmail = input.businessEmail.trim().toLowerCase();
    const personalEmail = input.personalEmail.trim().toLowerCase();
    const businessBidx = blindIndex(businessEmail);
    const personalBidx = blindIndex(personalEmail);
    const [role] = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.code, roleCode))
      .limit(1);
    if (!role) throw badRequest("ROLE_MISSING", "Roles are not seeded. Run the database seed.");

    const [dupe] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.businessEmailBidx, businessBidx))
      .limit(1);
    const [dupePersonal] = await this.db
      .select({ id: userProfiles.userId })
      .from(userProfiles)
      .where(eq(userProfiles.personalEmailBidx, personalBidx))
      .limit(1);
    if (dupe) throw conflict("EMAIL_TAKEN", "A user with this business email already exists.");
    if (dupePersonal)
      throw conflict("EMAIL_TAKEN", "A user with this personal email already exists.");

    const id = newId();
    await this.db.transaction(async (tx) => {
      const year = new Date().getFullYear();
      const [last] = await tx
        .select({ n: userProfiles.contractorNumber })
        .from(userProfiles)
        .where(like(userProfiles.contractorNumber, `CYN-${year}-%`))
        .orderBy(desc(userProfiles.contractorNumber))
        .limit(1)
        .for("update");
      const next = last ? Number(last.n.split("-")[2]) + 1 : 1;

      await tx.insert(users).values({
        id,
        roleId: role.id,
        businessEmail,
        businessEmailBidx: businessBidx,
        createdBy: actor?.id ?? null,
      });
      await tx.insert(userProfiles).values({
        userId: id,
        contractorNumber: `CYN-${year}-${String(next).padStart(3, "0")}`,
        fullName: input.fullName,
        personalEmail,
        personalEmailBidx: personalBidx,
        phoneCt: input.phone ? encrypt(input.phone) : null,
        location: input.location ?? null,
        encKeyId: currentKeyId,
        idNumberCt: input.idNumber ? encrypt(input.idNumber) : null,
      });
    });

    await this.sendInvite(id, input.fullName, personalEmail);
    await this.audit.record({
      actor,
      action: "users.created",
      targetType: "user",
      targetId: id,
      details: { role: roleCode },
      client,
    });
    return this.detail(id, null);
  }

  async resendInvite(id: string, actor: Actor, client?: ClientInfo): Promise<void> {
    const d = await this.detail(id, null);
    if (d.passwordSet)
      throw badRequest("ALREADY_ACTIVE", "This person has already set a password.");
    await this.sendInvite(id, d.fullName, d.personalEmail);
    await this.audit.record({
      actor,
      action: "users.invite_resent",
      targetType: "user",
      targetId: id,
      client,
    });
  }

  async setOverrides(
    id: string,
    input: SetOverridesInput,
    actor: NonNullable<Actor>,
    client?: ClientInfo,
  ): Promise<UserDetail> {
    if (id === actor.id) throw forbidden("SELF_GRANT", "You cannot change your own permissions.");
    const target = await this.detail(id, null);
    if (target.role === "super_admin")
      throw forbidden("PROTECTED_USER", "Super Admin permissions cannot be changed.");
    if (target.role === "admin" && !actor.permissions.has("users.manage_admins")) throw forbidden();

    const catalogue = new Map(PERMISSIONS.map((p) => [p.code as string, p]));
    for (const o of input.overrides) {
      if (catalogue.get(o.permissionCode)?.superAdminOnly) {
        throw badRequest(
          "SUPER_ADMIN_ONLY_PERMISSION",
          `${o.permissionCode} is reserved to the Super Admin.`,
        );
      }
    }
    const rows = await this.db
      .select({ id: permissions.id, code: permissions.code })
      .from(permissions);
    const idOf = new Map(rows.map((r) => [r.code, r.id]));

    await this.db.transaction(async (tx) => {
      await tx.delete(userPermissionOverrides).where(eq(userPermissionOverrides.userId, id));
      if (input.overrides.length) {
        await tx.insert(userPermissionOverrides).values(
          input.overrides.map((o) => {
            const permissionId = idOf.get(o.permissionCode);
            if (!permissionId) throw new Error(`Permission not found: ${o.permissionCode}`);
            return {
              userId: id,
              permissionId,
              effect: o.effect,
              reason: o.reason,
              grantedBy: actor.id,
              expiresAt: o.expiresAt ? new Date(o.expiresAt) : null,
            };
          }),
        );
      }
    });
    await this.audit.record({
      actor,
      action: "permissions.overrides_set",
      targetType: "user",
      targetId: id,
      details: { overrides: input.overrides },
      client,
    });
    return this.detail(id, null);
  }

  // ---- Phase 2: profiles and account status ---------------------------------------------

  /** Display names for a set of user ids. */
  async names(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((i): i is string => !!i))];
    if (!unique.length) return new Map();
    const rows = await this.db
      .select({ id: userProfiles.userId, name: userProfiles.fullName })
      .from(userProfiles)
      .where(inArray(userProfiles.userId, unique));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  private async loadTarget(id: string) {
    const [t] = await this.db
      .select({
        id: users.id,
        status: users.status,
        role: roles.code,
        deactivationType: users.deactivationType,
      })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);
    if (!t) throw notFound("User not found.");
    return t;
  }

  private applyProfile(id: string, input: UpdateUserInput) {
    const set: Partial<typeof userProfiles.$inferInsert> = {};
    if (input.fullName) set.fullName = input.fullName;
    if (input.phone) set.phoneCt = encrypt(input.phone);
    if (input.location !== undefined) set.location = input.location;
    return this.db.update(userProfiles).set(set).where(eq(userProfiles.userId, id));
  }

  /** Admin edit. Only the Super Admin (users.manage_admins) may edit Admin or Super Admin profiles. */
  async update(
    id: string,
    input: UpdateUserInput,
    actor: NonNullable<Actor>,
    client?: ClientInfo,
  ): Promise<UserDetail> {
    const t = await this.loadTarget(id);
    if (t.role !== "bdp" && t.id !== actor.id && !actor.permissions.has("users.manage_admins"))
      throw forbidden();
    await this.applyProfile(id, input);
    await this.audit.record({
      actor,
      action: "users.updated",
      targetType: "user",
      targetId: id,
      details: { fields: Object.keys(input) },
      client,
    });
    return this.detail(id, null);
  }

  /** Self edit: phone and location only. */
  async updateSelf(
    actor: NonNullable<Actor>,
    input: UpdateMeInput,
    client?: ClientInfo,
  ): Promise<UserDetail> {
    await this.applyProfile(actor.id, input);
    await this.audit.record({
      actor,
      action: "users.profile_updated",
      targetType: "user",
      targetId: actor.id,
      details: { fields: Object.keys(input) },
      client,
    });
    return this.detail(actor.id, null);
  }

  /** Freeze, put on leave, deactivate or reactivate. Anything but "active" ends the person's sessions at once. */
  async changeStatus(
    id: string,
    input: ChangeStatusInput,
    actor: NonNullable<Actor>,
    client?: ClientInfo,
  ): Promise<UserDetail> {
    if (id === actor.id) throw forbidden("SELF_STATUS", "You cannot change your own status.");
    const t = await this.loadTarget(id);
    if (t.role === "super_admin")
      throw forbidden("PROTECTED_USER", "The Super Admin account cannot be changed.");
    if (t.role === "admin" && !actor.permissions.has("users.manage_admins")) throw forbidden();
    if (t.status === input.status)
      throw badRequest("NO_CHANGE", `This account is already ${input.status.replace("_", " ")}.`);
    if (t.status === "deactivated") {
      if (input.status !== "active")
        throw badRequest("INVALID_TRANSITION", "A deactivated account can only be reactivated.");
      if (t.deactivationType === "permanent")
        throw badRequest(
          "PERMANENT",
          "This account was deactivated permanently and cannot be reactivated.",
        );
    }

    const now = new Date();
    const deactivating = input.status === "deactivated";
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          status: input.status,
          statusReason: input.reason,
          statusChangedAt: now,
          statusChangedBy: actor.id,
          freezeStartedAt: input.status === "frozen" ? now : null,
          deactivationType: deactivating ? (input.deactivationType ?? "temporary") : null,
          deactivatedAt: deactivating ? now : null,
          ...(input.status === "active" ? { failedLoginCount: 0, lockedUntil: null } : {}),
        })
        .where(eq(users.id, id));
      await tx.insert(userStatusHistory).values({
        userId: id,
        fromStatus: t.status,
        toStatus: input.status,
        reason: input.reason,
        changedBy: actor.id,
      });
      if (input.status !== "active") {
        await tx
          .update(authSessions)
          .set({ revokedAt: now, revokeReason: `status_${input.status}` })
          .where(and(eq(authSessions.userId, id), isNull(authSessions.revokedAt)));
      }
    });
    await this.audit.record({
      actor,
      action: "users.status_changed",
      targetType: "user",
      targetId: id,
      details: {
        from: t.status,
        to: input.status,
        reason: input.reason,
        deactivationType: input.deactivationType,
      },
      client,
    });
    const updated = await this.detail(id, null);
    await this.mail.sendTemplate(updated.personalEmail, "status_changed", {
      name: updated.fullName,
      status: input.status,
      reason: input.reason,
      deactivationType: input.deactivationType,
      whatsapp: env.SUPPORT_WHATSAPP,
    });
    return updated;
  }

  /** Super Admin only. Soft delete: locked out and hidden now; personal data is anonymised after 30 days (daily job, Phase 12). */
  async remove(
    id: string,
    input: DeleteUserInput,
    actor: NonNullable<Actor>,
    client?: ClientInfo,
  ): Promise<void> {
    if (id === actor.id) throw forbidden("SELF_DELETE", "You cannot delete your own account.");
    const t = await this.loadTarget(id);
    if (t.role === "super_admin")
      throw forbidden("PROTECTED_USER", "The Super Admin account cannot be deleted.");
    const person = await this.detail(id, null);

    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          status: "deleted",
          statusReason: input.reason,
          statusChangedAt: now,
          statusChangedBy: actor.id,
          deletedAt: now,
        })
        .where(eq(users.id, id));
      await tx.insert(userStatusHistory).values({
        userId: id,
        fromStatus: t.status,
        toStatus: "deleted",
        reason: input.reason,
        changedBy: actor.id,
      });
      await tx
        .update(authSessions)
        .set({ revokedAt: now, revokeReason: "account_deleted" })
        .where(and(eq(authSessions.userId, id), isNull(authSessions.revokedAt)));
    });
    await this.mail.sendTemplate(person.personalEmail, "account_removed", {
      name: person.fullName,
    });
    await this.audit.record({
      actor,
      action: "users.deleted",
      targetType: "user",
      targetId: id,
      details: { reason: input.reason },
      client,
    });
  }

  async history(id: string): Promise<StatusHistoryItem[]> {
    const rows = await this.db
      .select()
      .from(userStatusHistory)
      .where(eq(userStatusHistory.userId, id))
      .orderBy(desc(userStatusHistory.createdAt));
    const names = await this.names(rows.map((r) => r.changedBy));
    return rows.map((r) => ({
      id: r.id,
      fromStatus: r.fromStatus,
      toStatus: r.toStatus,
      reason: r.reason,
      changedByName: r.changedBy ? (names.get(r.changedBy) ?? null) : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  private async sendInvite(userId: string, name: string, personalEmail: string) {
    const { url } = await this.auth.issueLink(userId, "set_password");
    await this.mail.send(
      personalEmail,
      "Welcome to CyneForm: set your password",
      `Hello ${name},\n\nYour CyneForm account is ready. Choose your password within ${AUTH.setPasswordHours} hours:\n${url}\n`,
    );
  }
}
