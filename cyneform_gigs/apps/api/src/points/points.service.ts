import {
  and,
  count,
  desc,
  eq,
  getNumber,
  gte,
  inArray,
  isNull,
  leads,
  lt,
  lte,
  newId,
  not,
  pointsVault,
  roles,
  sql,
  userProfiles,
  users,
} from "@cyneform/db";
import type { AdjustInput, LedgerPage, LedgerQuery, MyPoints, VerifyInput } from "@cyneform/types";
import {
  type LedgerStatus,
  MANUAL_ADJUSTMENT,
  MILESTONES,
  RULE_BY_KEY,
  RULE_LABELS,
} from "@cyneform/validators";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { SQL } from "drizzle-orm";
import type { AuthUser } from "../access/auth-user";
import { AuditService } from "../audit/audit.service";
import type { ClientInfo } from "../common/client-info";
import { badRequest, notFound } from "../common/errors";
import { DB, type Db } from "../database/database.module";
import { NotificationsService } from "../notifications/notifications.service";
import { type Q, RulesService } from "./rules.service";

const DAY = 86_400_000;
const PAGE_SIZE = 25;
const round2 = (n: number) => Math.round(n * 100) / 100;
const pointsText = (n: number) => String(round2(n));

export type AwardParams = {
  userId: string;
  ruleKey: string;
  leadId?: string;
  note?: string;
  /** Admin-manual awards carry an actor; event-driven awards do not. */
  actor?: AuthUser;
  client?: ClientInfo;
};

@Injectable()
export class PointsService {
  private readonly log = new Logger(PointsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RulesService) private readonly rules: RulesService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  /** Use database SUMs for balances so decimal totals never accumulate in JS. */
  private async sum(q: Q, userId: string, status: LedgerStatus, extra?: SQL): Promise<number> {
    const [row] = await q
      .select({ n: sql<string>`coalesce(sum(${pointsVault.points}), 0)` })
      .from(pointsVault)
      .where(and(eq(pointsVault.userId, userId), eq(pointsVault.status, status), extra));
    return Number(row?.n ?? 0);
  }

  private async milestones(userId: string, before: number, after: number) {
    for (const milestone of MILESTONES) {
      if (before < milestone && after >= milestone) {
        await this.notifications.notify(userId, {
          type: "points.milestone",
          title: `You've reached ${milestone} points!`,
          link: "/points",
        });
      }
    }
  }

  /** Awards are serialized on the user's row and safe to retry from BullMQ. */
  async award(p: AwardParams): Promise<{ awarded: number; status: LedgerStatus | null }> {
    const definition = RULE_BY_KEY.get(p.ruleKey);
    if (!definition) throw badRequest("UNKNOWN_RULE", "Unknown rule.");
    const kesPerPoint = await getNumber("points.kes_per_point");
    const expiryDays = await getNumber("points.expiry_days");
    const now = new Date();
    const result = {
      skip: null as "USER_INACTIVE" | "RULE_DISABLED" | "DUPLICATE" | "NOTHING_NEW" | null,
      points: 0,
      status: null as LedgerStatus | null,
      before: 0,
      after: 0,
      upgrade: false,
      version: 0,
    };

    await this.db.transaction(async (tx) => {
      const [user] = await tx
        .select({ id: users.id, status: users.status })
        .from(users)
        .where(and(eq(users.id, p.userId), isNull(users.deletedAt)))
        .limit(1)
        .for("update");
      if (user?.status !== "active") {
        result.skip = "USER_INACTIVE";
        return;
      }

      const rule = await this.rules.live(tx, p.ruleKey);
      if (!rule?.enabled || !rule.schemeEnabled) {
        result.skip = "RULE_DISABLED";
        return;
      }

      if (p.leadId) {
        const [duplicate] = await tx
          .select({ n: count() })
          .from(pointsVault)
          .where(
            and(
              eq(pointsVault.userId, p.userId),
              eq(pointsVault.ruleKey, p.ruleKey),
              eq(pointsVault.leadId, p.leadId),
              gte(pointsVault.earnedAt, new Date(now.getTime() - DAY)),
              not(eq(pointsVault.status, "voided")),
            ),
          );
        if (Number(duplicate?.n ?? 0) > 0) {
          result.skip = "DUPLICATE";
          return;
        }
      }

      let points = Number(rule.points);
      if (definition.upgradeOf?.length && p.leadId) {
        const [previous] = await tx
          .select({
            n: sql<string>`coalesce(max(${pointsVault.points}), 0)`,
          })
          .from(pointsVault)
          .where(
            and(
              eq(pointsVault.userId, p.userId),
              eq(pointsVault.leadId, p.leadId),
              inArray(pointsVault.ruleKey, [...definition.upgradeOf]),
              not(eq(pointsVault.status, "voided")),
            ),
          );
        const paid = Number(previous?.n ?? 0);
        points = round2(points - paid);
        result.upgrade = paid > 0;
        if (points <= 0) {
          result.skip = "NOTHING_NEW";
          return;
        }
      }
      if (points <= 0) {
        result.skip = "NOTHING_NEW";
        return;
      }

      result.status = rule.verificationRequired ? "pending_verification" : "active";
      result.points = points;
      result.version = await this.rules.latestVersion(tx);
      result.before = await this.sum(tx, p.userId, "active");
      await tx.insert(pointsVault).values({
        id: newId(),
        userId: p.userId,
        ruleKey: p.ruleKey,
        points,
        cashEquivalent: round2(points * kesPerPoint),
        status: result.status,
        leadId: p.leadId ?? null,
        ruleVersionNo: result.version,
        verificationRequired: rule.verificationRequired,
        earnedAt: now,
        expiresAt: new Date(now.getTime() + expiryDays * DAY),
        createdBy: p.actor?.id ?? null,
        note: p.note ?? null,
      });
      result.after = await this.sum(tx, p.userId, "active");
    });

    if (result.skip) {
      if (result.skip === "DUPLICATE") {
        await this.audit.record({
          actor: p.actor ?? null,
          action: "points.duplicate_skipped",
          targetType: "user",
          targetId: p.userId,
          details: { ruleKey: p.ruleKey, leadId: p.leadId },
          client: p.client,
        });
      }
      if (p.actor) {
        const messages = {
          USER_INACTIVE: "This account is not active.",
          RULE_DISABLED: "This rule (or its scheme) is disabled.",
          DUPLICATE: "Already awarded for this gig in the last 24 hours.",
          NOTHING_NEW: "Nothing new to award.",
        };
        throw badRequest(result.skip, messages[result.skip]);
      }
      this.log.debug(`No award: ${result.skip} (${p.ruleKey})`);
      return { awarded: 0, status: null };
    }

    const label = RULE_LABELS[p.ruleKey] ?? p.ruleKey;
    await this.notifications.notify(p.userId, {
      type: result.status === "pending_verification" ? "points.verification" : "points.awarded",
      title: result.upgrade
        ? `Quality Multiplier applied! +${pointsText(result.points)} points: ${label}`
        : `+${pointsText(result.points)} points: ${label}`,
      body:
        result.status === "pending_verification"
          ? "These points count once an admin verifies them."
          : undefined,
      link: "/points",
    });
    await this.milestones(p.userId, result.before, result.after);
    await this.audit.record({
      actor: p.actor ?? null,
      action: "points.awarded",
      targetType: "user",
      targetId: p.userId,
      details: {
        ruleKey: p.ruleKey,
        points: result.points,
        leadId: p.leadId,
        status: result.status,
        version: result.version,
      },
      client: p.client,
    });
    return { awarded: result.points, status: result.status };
  }

  async verify(id: string, input: VerifyInput, actor: AuthUser, client?: ClientInfo) {
    const [entry] = await this.db
      .select({ userId: pointsVault.userId })
      .from(pointsVault)
      .where(eq(pointsVault.id, id))
      .limit(1);
    if (!entry) throw notFound("Entry not found.");

    const result = { userId: entry.userId, points: 0, before: 0, after: 0 };
    await this.db.transaction(async (tx) => {
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, entry.userId))
        .limit(1)
        .for("update");
      if (!user) throw notFound("User not found.");
      const [row] = await tx
        .select()
        .from(pointsVault)
        .where(eq(pointsVault.id, id))
        .limit(1)
        .for("update");
      if (!row) throw notFound("Entry not found.");
      if (row.status !== "pending_verification")
        throw badRequest("NOT_PENDING", "This entry is not awaiting verification.");
      result.points = Number(row.points);
      result.before = await this.sum(tx, row.userId, "active");
      const verified = input.decision === "verify";
      await tx
        .update(pointsVault)
        .set({ status: verified ? "active" : "voided", note: input.note ?? row.note })
        .where(eq(pointsVault.id, id));
      result.after = await this.sum(tx, row.userId, "active");
    });

    const verified = input.decision === "verify";
    await this.notifications.notify(result.userId, {
      type: "points.verification",
      title: verified
        ? `${pointsText(result.points)} points verified`
        : `${pointsText(result.points)} points were not verified`,
      body: input.note,
      link: "/points",
    });
    if (verified) await this.milestones(result.userId, result.before, result.after);
    await this.audit.record({
      actor,
      action: verified ? "points.verified" : "points.rejected",
      targetType: "points_entry",
      targetId: id,
      details: { points: result.points, note: input.note },
      client,
    });
  }

  async adjust(input: AdjustInput, actor: AuthUser, client?: ClientInfo) {
    const kesPerPoint = await getNumber("points.kes_per_point");
    const expiryDays = await getNumber("points.expiry_days");
    const now = new Date();
    const result = { before: 0, after: 0 };
    await this.db.transaction(async (tx) => {
      const [user] = await tx
        .select({ id: users.id, status: users.status, role: roles.code })
        .from(users)
        .innerJoin(roles, eq(roles.id, users.roleId))
        .where(and(eq(users.id, input.userId), isNull(users.deletedAt)))
        .limit(1)
        .for("update");
      if (user?.role !== "bdp")
        throw badRequest("NOT_BDP", "Points can only be adjusted for a BDP.");
      if (user.status !== "active") throw badRequest("NOT_ACTIVE", "This account is not active.");

      result.before = await this.sum(tx, input.userId, "active");
      if (round2(result.before + input.points) < 0)
        throw badRequest("BELOW_ZERO", "This would take the balance below zero.");
      await tx.insert(pointsVault).values({
        id: newId(),
        userId: input.userId,
        ruleKey: MANUAL_ADJUSTMENT,
        points: input.points,
        cashEquivalent: round2(input.points * kesPerPoint),
        status: "active",
        ruleVersionNo: await this.rules.latestVersion(tx),
        earnedAt: now,
        expiresAt: input.points > 0 ? new Date(now.getTime() + expiryDays * DAY) : null,
        createdBy: actor.id,
        note: input.reason,
      });
      result.after = await this.sum(tx, input.userId, "active");
    });

    await this.notifications.notify(input.userId, {
      type: "points.awarded",
      title: `${input.points > 0 ? "+" : ""}${pointsText(input.points)} points: manual adjustment`,
      body: input.reason,
      link: "/points",
    });
    await this.milestones(input.userId, result.before, result.after);
    await this.audit.record({
      actor,
      action: "points.adjusted",
      targetType: "user",
      targetId: input.userId,
      details: { points: input.points, reason: input.reason },
      client,
    });
  }

  /** Expire active points for active users; locking the user prevents duplicate expiry notices. */
  async expireDue() {
    const now = new Date();
    const candidates = await this.db
      .select({ userId: pointsVault.userId })
      .from(pointsVault)
      .innerJoin(users, eq(users.id, pointsVault.userId))
      .where(
        and(
          eq(pointsVault.status, "active"),
          lt(pointsVault.expiresAt, now),
          eq(users.status, "active"),
          isNull(users.deletedAt),
        ),
      )
      .groupBy(pointsVault.userId);

    let expiredUsers = 0;
    for (const candidate of candidates) {
      const expired = { total: 0, rows: 0 };
      await this.db.transaction(async (tx) => {
        const [user] = await tx
          .select({ id: users.id, status: users.status })
          .from(users)
          .where(and(eq(users.id, candidate.userId), isNull(users.deletedAt)))
          .limit(1)
          .for("update");
        if (user?.status !== "active") return;
        const where = and(
          eq(pointsVault.userId, candidate.userId),
          eq(pointsVault.status, "active"),
          lt(pointsVault.expiresAt, now),
        );
        const [sum] = await tx
          .select({
            n: sql<string>`coalesce(sum(${pointsVault.points}), 0)`,
            rows: count(),
          })
          .from(pointsVault)
          .where(where);
        expired.total = Number(sum?.n ?? 0);
        expired.rows = Number(sum?.rows ?? 0);
        if (expired.rows === 0) return;
        await tx.update(pointsVault).set({ status: "expired", expiredAt: now }).where(where);
      });
      if (expired.rows === 0) continue;
      expiredUsers += 1;
      await this.notifications.notify(candidate.userId, {
        type: "points.expired",
        title: `${pointsText(expired.total)} points have expired due to the 75-day rule.`,
        link: "/points",
      });
      await this.audit.record({
        actor: null,
        action: "points.expired",
        targetType: "user",
        targetId: candidate.userId,
        details: { points: expired.total },
      });
    }
    this.log.log(`Points expiry: ${expiredUsers} user(s)`);
  }

  async extendExpiry(
    userId: string,
    pausedMs: number,
    actor: Pick<AuthUser, "id" | "role">,
    client?: ClientInfo,
  ) {
    const milliseconds = Math.max(0, Math.round(pausedMs));
    if (milliseconds === 0) return;
    await this.db
      .update(pointsVault)
      .set({
        expiresAt: sql`DATE_ADD(${pointsVault.expiresAt}, INTERVAL ${milliseconds * 1000} MICROSECOND)`,
      })
      .where(
        and(
          eq(pointsVault.userId, userId),
          inArray(pointsVault.status, ["active", "pending_verification"]),
          sql`${pointsVault.expiresAt} IS NOT NULL`,
        ),
      );
    await this.audit.record({
      actor,
      action: "points.clock_resumed",
      targetType: "user",
      targetId: userId,
      details: { pausedMs: milliseconds },
      client,
    });
  }

  private async page(where: SQL | undefined, page: number): Promise<LedgerPage> {
    const [total] = await this.db.select({ n: count() }).from(pointsVault).where(where);
    const rows = await this.db
      .select({ vault: pointsVault, name: userProfiles.fullName, leadTitle: leads.title })
      .from(pointsVault)
      .leftJoin(users, eq(users.id, pointsVault.userId))
      .leftJoin(userProfiles, eq(userProfiles.userId, pointsVault.userId))
      .leftJoin(leads, eq(leads.id, pointsVault.leadId))
      .where(where)
      .orderBy(desc(pointsVault.earnedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);
    return {
      total: Number(total?.n ?? 0),
      page,
      pageSize: PAGE_SIZE,
      items: rows.map(({ vault, name, leadTitle }) => ({
        id: vault.id,
        userId: vault.userId,
        userName: name,
        ruleKey: vault.ruleKey,
        ruleLabel: RULE_LABELS[vault.ruleKey] ?? vault.ruleKey,
        points: Number(vault.points),
        cashEquivalent: Number(vault.cashEquivalent),
        status: vault.status as LedgerStatus,
        leadId: vault.leadId,
        leadTitle,
        earnedAt: vault.earnedAt.toISOString(),
        expiresAt: vault.expiresAt?.toISOString() ?? null,
        note: vault.note,
      })),
    };
  }

  ledger(query: LedgerQuery) {
    return this.page(
      and(
        query.userId ? eq(pointsVault.userId, query.userId) : undefined,
        query.status ? eq(pointsVault.status, query.status) : undefined,
        query.ruleKey ? eq(pointsVault.ruleKey, query.ruleKey) : undefined,
      ),
      query.page,
    );
  }

  pending() {
    return this.page(eq(pointsVault.status, "pending_verification"), 1);
  }

  async me(actor: AuthUser, page: number): Promise<MyPoints> {
    const kesPerPoint = await getNumber("points.kes_per_point");
    const active = await this.sum(this.db, actor.id, "active");
    const pending = await this.sum(this.db, actor.id, "pending_verification");
    const expiringSoon = await this.sum(
      this.db,
      actor.id,
      "active",
      and(
        lte(pointsVault.expiresAt, new Date(Date.now() + 14 * DAY)),
        gte(pointsVault.expiresAt, new Date()),
      ),
    );
    return {
      active,
      pending,
      expiringSoon,
      kesPerPoint,
      cashValue: round2(active * kesPerPoint),
      nextMilestone: MILESTONES.find((milestone) => milestone > active) ?? null,
      ledger: await this.page(eq(pointsVault.userId, actor.id), page),
    };
  }

  /** Active BDPs for the admin pickers. */
  bdps() {
    return this.db
      .select({ id: users.id, fullName: userProfiles.fullName })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(roles.code, "bdp"), eq(users.status, "active"), isNull(users.deletedAt)))
      .orderBy(userProfiles.fullName);
  }
}
