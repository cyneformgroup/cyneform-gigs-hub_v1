import {
  and,
  dealCompensation,
  eq,
  getNumber,
  getNumberList,
  inArray,
  isNull,
  leadClaims,
  leads,
  leaveRequests,
  lifecycleNotices,
  pointsVault,
  roles,
  sql,
  userProfiles,
  users,
} from "@cyneform/db";
import type { NotificationType } from "@cyneform/types";
import { businessDaysSince } from "@cyneform/validators";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { storedEmail } from "../common/crypto";
import { DB, type Db } from "../database/database.module";
import { MailService } from "../mail/mail.service";
import { NotificationsService } from "../notifications/notifications.service";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const DAY = 86_400_000;
const eatDate = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

@Injectable()
export class LifecycleService {
  private readonly log = new Logger(LifecycleService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  /** True the first time (userId, kind, anchor) is recorded. */
  async noticeOnce(userId: string, kind: string, anchor: string): Promise<boolean> {
    const [res] = await this.db.insert(lifecycleNotices).ignore().values({ userId, kind, anchor });
    return Number((res as { affectedRows?: number }).affectedRows ?? 0) === 1;
  }

  private async tell(
    userId: string,
    email: string | null,
    subject: string,
    text: string,
    n: { type: NotificationType; link: string },
  ) {
    await this.notifications.notify(userId, {
      type: n.type,
      title: subject,
      body: text,
      link: n.link,
    });
    try {
      if (email) await this.mail.send(email, subject, text);
    } catch {
      /* an unreachable mailbox must not stop the run */
    }
  }

  private activeBdps() {
    return this.db
      .select({
        id: users.id,
        name: userProfiles.fullName,
        email: users.businessEmail,
        legacyEmail: users.businessEmailCt,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
        statusChangedAt: users.statusChangedAt,
      })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(roles.code, "bdp"), eq(users.status, "active"), isNull(users.deletedAt)));
  }

  /** Claimed leads without outreach go back to the pool. Used by freeze and by account deletion. */
  async releaseClaims(tx: Tx, userId: string) {
    const rows = await tx
      .select({ leadId: leadClaims.leadId })
      .from(leadClaims)
      .innerJoin(leads, eq(leads.id, leadClaims.leadId))
      .where(
        and(
          eq(leadClaims.userId, userId),
          eq(leads.status, "claimed"),
          isNull(leads.outreachSentAt),
        ),
      );
    if (rows.length === 0) return 0;
    const ids = rows.map((r) => r.leadId);
    await tx.delete(leadClaims).where(inArray(leadClaims.leadId, ids));
    await tx.update(leads).set({ status: "new" }).where(inArray(leads.id, ids));
    return ids.length;
  }

  // ---------- inactivity ----------
  async inactivity() {
    const warn = (await getNumberList("inactivity.warn_days")) as number[];
    const freezeAt = await getNumber("inactivity.freeze_days");
    const now = new Date();
    let warned = 0;
    let frozen = 0;
    for (const u of await this.activeBdps()) {
      const anchor = new Date(
        Math.max((u.lastLoginAt ?? u.createdAt).getTime(), u.statusChangedAt?.getTime() ?? 0),
      );
      const days = businessDaysSince(anchor, now);
      if (days >= freezeAt) {
        if (await this.freeze(u.id, u.name, storedEmail(u.email, u.legacyEmail), days)) frozen++;
        continue;
      }
      const w = Math.max(0, ...warn.filter((x) => x <= days));
      if (w > 0 && (await this.noticeOnce(u.id, `inactivity_${w}`, anchor.toISOString()))) {
        await this.tell(
          u.id,
          storedEmail(u.email, u.legacyEmail),
          "Your account has been inactive",
          `You have not logged in for ${w} business days. Your account will be frozen after ${freezeAt} business days without a login. Log in to keep it active.`,
          { type: "account.inactivity", link: "/" },
        );
        warned++;
      }
    }
    this.log.log(`Inactivity: ${warned} warned, ${frozen} frozen`);
  }

  private async freeze(userId: string, name: string | null, email: string | null, days: number) {
    const now = new Date();
    let released = 0;
    const done = await this.db.transaction(async (tx: Tx) => {
      const [res] = await tx
        .update(users)
        .set({ status: "frozen", freezeStartedAt: now, statusChangedAt: now })
        .where(and(eq(users.id, userId), eq(users.status, "active")));
      if ((res as { affectedRows: number }).affectedRows === 0) return false;
      released = await this.releaseClaims(tx, userId);
      return true;
    });
    if (!done) return false;
    await this.tell(
      userId,
      email,
      "Your account has been frozen",
      `Your account was frozen after ${days} business days without a login. Contact an administrator to reactivate it. Your points clock is paused while frozen.`,
      { type: "account.frozen", link: "/" },
    );
    await this.notifications.notifyRoles(["admin", "super_admin"], {
      type: "account.frozen",
      title: `${name ?? "A BDP"} was frozen for inactivity`,
      body: `${days} business days without a login. ${released} claimed lead(s) were released.`,
      link: "/users",
    });
    await this.audit.record({
      actor: null,
      action: "account.auto_frozen",
      targetType: "user",
      targetId: userId,
      details: { days, releasedClaims: released },
    });
    return true;
  }

  // ---------- vault reset (CRON: 75 days without a deal) ----------
  async vault() {
    const resetDays = await getNumber("vault.reset_days");
    const warn = (await getNumberList("vault.warn_days")) as number[];
    const now = new Date();
    const bdps = await this.activeBdps();
    if (bdps.length === 0) return;
    const ids = bdps.map((b) => b.id);
    const deals = await this.db
      .select({
        u: dealCompensation.userId,
        at: sql<Date | null>`max(${dealCompensation.closedAt})`,
      })
      .from(dealCompensation)
      .where(inArray(dealCompensation.userId, ids))
      .groupBy(dealCompensation.userId);
    const resets = await this.db
      .select({
        u: lifecycleNotices.userId,
        at: sql<Date | null>`max(${lifecycleNotices.createdAt})`,
      })
      .from(lifecycleNotices)
      .where(and(inArray(lifecycleNotices.userId, ids), eq(lifecycleNotices.kind, "vault_reset")))
      .groupBy(lifecycleNotices.userId);
    let warned = 0;
    let reset = 0;
    for (const u of bdps) {
      const lastDeal = deals.find((d) => d.u === u.id)?.at;
      const lastReset = resets.find((d) => d.u === u.id)?.at;
      const anchor = new Date(
        Math.max(
          u.createdAt.getTime(),
          lastDeal ? new Date(lastDeal).getTime() : 0,
          lastReset ? new Date(lastReset).getTime() : 0,
          u.statusChangedAt?.getTime() ?? 0,
        ),
      );
      const days = Math.floor((now.getTime() - anchor.getTime()) / DAY);
      if (days >= resetDays) {
        await this.resetVault(u.id, u.name, storedEmail(u.email, u.legacyEmail), days);
        reset++;
        continue;
      }
      const w = Math.max(0, ...warn.filter((x) => x <= days));
      if (w > 0 && (await this.noticeOnce(u.id, `vault_warn_${w}`, anchor.toISOString()))) {
        const left = resetDays - w;
        await this.tell(
          u.id,
          storedEmail(u.email, u.legacyEmail),
          left <= 1 ? "Your points will reset tomorrow" : `Your points will reset in ${left} days`,
          `You have not closed a deal in ${w} days. Your active points will reset ${left <= 1 ? "tomorrow" : `in ${left} days`} unless you close a deal.`,
          { type: "vault.warning", link: "/points" },
        );
        warned++;
      }
    }
    this.log.log(`Vault: ${warned} warned, ${reset} reset`);
  }

  private async resetVault(
    userId: string,
    name: string | null,
    email: string | null,
    days: number,
  ) {
    const [sum] = await this.db
      .select({ n: sql<string>`coalesce(sum(${pointsVault.points}),0)` })
      .from(pointsVault)
      .where(and(eq(pointsVault.userId, userId), eq(pointsVault.status, "active")));
    const lost = Number(sum?.n ?? 0);
    await this.db
      .update(pointsVault)
      .set({ status: "reset" })
      .where(and(eq(pointsVault.userId, userId), eq(pointsVault.status, "active")));
    await this.noticeOnce(userId, "vault_reset", new Date().toISOString()); // restarts the clock
    if (lost <= 0) return;
    await this.tell(
      userId,
      email,
      "Your points vault was reset",
      `You went ${days} days without closing a deal, so ${lost} active points were reset. Your clock starts again today.`,
      { type: "vault.reset", link: "/points" },
    );
    await this.notifications.notifyRoles(["admin", "super_admin"], {
      type: "vault.reset",
      title: `${name ?? "A BDP"}'s vault was reset`,
      body: `${lost} points after ${days} days without a deal.`,
      link: "/points/admin",
    });
    await this.audit.record({
      actor: null,
      action: "points.vault_reset",
      targetType: "user",
      targetId: userId,
      details: { lost, days },
    });
  }

  // ---------- leave ----------
  async leave() {
    const today = eatDate(new Date());
    const onLeave = await this.db
      .select({
        id: users.id,
        name: userProfiles.fullName,
        email: users.businessEmail,
        legacyEmail: users.businessEmailCt,
        since: users.freezeStartedAt,
        changed: users.statusChangedAt,
      })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(users.status, "on_leave"), isNull(users.deletedAt)));
    let back = 0;
    for (const u of onLeave) {
      const rows = await this.db
        .select({ end: leaveRequests.endDate }) // LEAVE COLUMNS: endDate
        .from(leaveRequests)
        .where(and(eq(leaveRequests.userId, u.id), eq(leaveRequests.status, "approved"))); // LEAVE COLUMNS: userId, status
      if (rows.length === 0) continue; // no approved leave on record: an admin must reactivate by hand
      const lastEnd = rows
        .map((r) => String(r.end).slice(0, 10))
        .sort()
        .at(-1) as string;
      if (lastEnd >= today) continue;
      const now = new Date();
      const since = u.changed ?? u.since ?? now;
      const away = Math.max(0, Math.ceil((now.getTime() - since.getTime()) / DAY));
      await this.db.transaction(async (tx: Tx) => {
        await tx
          .update(users)
          .set({ status: "active", statusChangedAt: now, freezeStartedAt: null })
          .where(and(eq(users.id, u.id), eq(users.status, "on_leave")));
        if (away > 0) {
          await tx
            .update(pointsVault)
            .set({ expiresAt: sql`${pointsVault.expiresAt} + interval ${away} day` })
            .where(
              and(
                eq(pointsVault.userId, u.id),
                inArray(pointsVault.status, ["active", "pending_verification"]),
                sql`${pointsVault.expiresAt} is not null`,
              ),
            );
        }
      });
      await this.tell(
        u.id,
        storedEmail(u.email, u.legacyEmail),
        "Welcome back",
        `Your leave has ended and your account is active again. Your points expiry dates were extended by ${away} day(s).`,
        { type: "account.returned", link: "/" },
      );
      await this.notifications.notifyRoles(["admin", "super_admin"], {
        type: "account.returned",
        title: `${u.name ?? "A BDP"} returned from leave`,
        link: "/users",
      });
      await this.audit.record({
        actor: null,
        action: "account.leave_ended",
        targetType: "user",
        targetId: u.id,
        details: { away },
      });
      back++;
    }
    this.log.log(`Leave: ${back} returned`);
  }
}
