import {
  accountDeletions,
  and,
  authSessions,
  count,
  crmEntries,
  dealCompensation,
  eq,
  equityGrants,
  getNumber,
  inArray,
  isNull,
  leadClaims,
  leads,
  performanceBonuses,
  pointsVault,
  roles,
  rolloverTracking,
  sql,
  userProfiles,
  users,
} from "@cyneform/db";
import type { DeleteAccountInput, DeletePreview } from "@cyneform/types";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { AuthUser } from "../access/auth-user";
import { AuditService } from "../audit/audit.service";
import type { ClientInfo } from "../common/client-info";
import { blindIndex, encrypt, storedEmail } from "../common/crypto";
import { conflict, forbidden, notFound } from "../common/errors";
import { DB, type Db } from "../database/database.module";
import { MailService } from "../mail/mail.service";
import { NotificationsService } from "../notifications/notifications.service";
import { LifecycleService, type Tx } from "./lifecycle.service";

const DAY = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class AccountsService {
  private readonly log = new Logger(AccountsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(LifecycleService) private readonly lifecycle: LifecycleService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  async preview(userId: string): Promise<DeletePreview> {
    const [u] = await this.db
      .select({ name: userProfiles.fullName })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    if (!u) throw notFound("User not found.");

    const [crm] = await this.db
      .select({ n: count() })
      .from(crmEntries)
      .where(
        and(eq(crmEntries.userId, userId), isNull(crmEntries.wonAt), isNull(crmEntries.lostAt)),
      );
    const [claimed] = await this.db
      .select({ n: count() })
      .from(leadClaims)
      .innerJoin(leads, eq(leads.id, leadClaims.leadId))
      .where(
        and(
          eq(leadClaims.userId, userId),
          eq(leads.status, "claimed"),
          isNull(leads.outreachSentAt),
        ),
      );
    const [comp] = await this.db
      .select({ n: count(), sum: sql<string>`coalesce(sum(${dealCompensation.finalPayout}), 0)` })
      .from(dealCompensation)
      .where(
        and(
          eq(dealCompensation.userId, userId),
          inArray(dealCompensation.paymentStatus, ["pending", "approved"]),
        ),
      );
    const [pts] = await this.db
      .select({ sum: sql<string>`coalesce(sum(${pointsVault.points}), 0)` })
      .from(pointsVault)
      .where(
        and(
          eq(pointsVault.userId, userId),
          inArray(pointsVault.status, ["active", "pending_verification"]),
        ),
      );
    const [bonuses] = await this.db
      .select({ n: count() })
      .from(performanceBonuses)
      .where(
        and(
          eq(performanceBonuses.userId, userId),
          inArray(performanceBonuses.status, [
            "pending_review",
            "deferred",
            "authorized",
            "liquidated",
          ]),
        ),
      );
    const [equity] = await this.db
      .select({ n: count() })
      .from(equityGrants)
      .where(eq(equityGrants.userId, userId));

    const result: DeletePreview = {
      userId,
      name: u.name,
      openCrmEntries: Number(crm?.n ?? 0),
      claimedLeads: Number(claimed?.n ?? 0),
      pendingCommissions: Number(comp?.n ?? 0),
      pendingCommissionAmount: round2(Number(comp?.sum ?? 0)),
      activePoints: round2(Number(pts?.sum ?? 0)),
      openBonuses: Number(bonuses?.n ?? 0),
      hasEquity: Number(equity?.n ?? 0) > 0,
      warnings: [],
    };
    if (result.openCrmEntries)
      result.warnings.push(
        `${result.openCrmEntries} open CRM entries remain under an anonymized owner.`,
      );
    if (result.claimedLeads)
      result.warnings.push(
        `${result.claimedLeads} claimed lead(s) without outreach will return to the pool.`,
      );
    if (result.pendingCommissions)
      result.warnings.push(
        `${result.pendingCommissions} pending commission(s), worth ${result.pendingCommissionAmount} KES, will be cancelled.`,
      );
    if (result.activePoints)
      result.warnings.push(`${result.activePoints} active points will be forfeited.`);
    if (result.openBonuses)
      result.warnings.push(
        `${result.openBonuses} bonus record(s) need review. A liquidated, unpaid bonus must be settled by hand.`,
      );
    if (result.hasEquity)
      result.warnings.push(
        "This BDP has a phantom equity grant. It is not changed automatically and needs manual settlement.",
      );
    return result;
  }

  async remove(userId: string, input: DeleteAccountInput, actor: AuthUser, client?: ClientInfo) {
    if (userId === actor.id) throw forbidden("You cannot delete your own account.");
    const [target] = await this.db
      .select({
        name: userProfiles.fullName,
        role: roles.code,
        deletedAt: users.deletedAt,
        personalEmail: userProfiles.personalEmail,
        personalEmailCt: userProfiles.personalEmailCt,
      })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    if (!target) throw notFound("User not found.");
    if (target.deletedAt) throw conflict("ALREADY_DELETED", "This account is already deleted.");
    if (target.role === "super_admin")
      throw forbidden("Super Admin accounts cannot be deleted here.");

    const preview = await this.preview(userId);
    const now = new Date();
    const retentionDays = await getNumber("delete.retention_days");
    await this.db.transaction(async (tx: Tx) => {
      await tx
        .update(users)
        .set({ status: "deactivated", statusChangedAt: now, deletedAt: now })
        .where(and(eq(users.id, userId), isNull(users.deletedAt)));
      await tx
        .update(authSessions)
        .set({ revokedAt: now, revokeReason: "account_deleted" })
        .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
      await tx
        .update(pointsVault)
        .set({ status: "forfeited" })
        .where(
          and(
            eq(pointsVault.userId, userId),
            inArray(pointsVault.status, ["active", "pending_verification"]),
          ),
        );
      await tx
        .update(dealCompensation)
        .set({ paymentStatus: "cancelled" })
        .where(
          and(
            eq(dealCompensation.userId, userId),
            inArray(dealCompensation.paymentStatus, ["pending", "approved"]),
          ),
        );
      await tx
        .update(rolloverTracking)
        .set({ status: "expired" })
        .where(and(eq(rolloverTracking.userId, userId), eq(rolloverTracking.status, "active")));
      await tx
        .update(performanceBonuses)
        .set({ status: "declined", decisionNotes: "Account deleted", decidedAt: now })
        .where(
          and(
            eq(performanceBonuses.userId, userId),
            inArray(performanceBonuses.status, ["pending_review", "deferred", "authorized"]),
          ),
        );
      await this.lifecycle.releaseClaims(tx, userId);
      await tx.insert(accountDeletions).values({
        userId,
        requestedBy: actor.id,
        reason: input.reason,
        summary: JSON.stringify(preview),
        anonymizeAfter: new Date(now.getTime() + retentionDays * DAY),
      });
    });

    try {
      const personalEmail = storedEmail(target.personalEmail, target.personalEmailCt);
      await this.mail.send(
        personalEmail,
        "Your CyneForm account has been closed",
        `Hello ${target.name ?? ""},\n\nYour account has been closed. Personal details will be anonymized after ${retentionDays} days. Outstanding points were forfeited and pending compensation was cancelled. Contact an administrator if you believe this is a mistake.`,
      );
    } catch {
      this.log.warn(`Could not send account closure email for user ${userId}`);
    }
    await this.notifications.notifyRoles(
      ["super_admin"],
      {
        type: "account.deleted",
        title: `${target.name ?? "A user"} was deleted`,
        body: `Reason: ${input.reason}`,
        link: "/users",
      },
      actor.id,
    );
    await this.audit.record({
      actor,
      action: "account.deleted",
      targetType: "user",
      targetId: userId,
      details: { reason: input.reason, summary: preview },
      client,
    });
  }

  async anonymizeDue() {
    const due = await this.db
      .select({ userId: accountDeletions.userId })
      .from(accountDeletions)
      .where(
        and(
          isNull(accountDeletions.anonymizedAt),
          sql`${accountDeletions.anonymizeAfter} <= now(3)`,
        ),
      );

    for (const { userId } of due) {
      const suffix = userId.replaceAll("-", "").slice(0, 16);
      const placeholder = `deleted-${suffix}@deleted.invalid`;
      const name = `DELETED_USER_${Date.now()}_${suffix}`;
      await this.db.transaction(async (tx: Tx) => {
        await tx
          .update(users)
          .set({
            businessEmail: placeholder,
            businessEmailCt: encrypt(placeholder),
            businessEmailBidx: blindIndex(placeholder),
          })
          .where(eq(users.id, userId));
        await tx
          .update(userProfiles)
          .set({
            fullName: name,
            contractorNumber: `D-${suffix}`,
            personalEmail: placeholder,
            personalEmailCt: encrypt(placeholder),
            personalEmailBidx: blindIndex(placeholder),
            phoneCt: null,
            idNumberCt: null,
            location: null,
          })
          .where(eq(userProfiles.userId, userId));
        await tx
          .update(accountDeletions)
          .set({ anonymizedAt: new Date() })
          .where(eq(accountDeletions.userId, userId));
      });
      await this.audit.record({
        actor: null,
        action: "account.anonymized",
        targetType: "user",
        targetId: userId,
        details: {},
      });
    }
    if (due.length) this.log.log(`Anonymized ${due.length} account(s)`);
  }
}
