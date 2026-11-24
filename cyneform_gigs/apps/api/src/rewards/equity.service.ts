import {
  and,
  count,
  crmEntries,
  dealCompensation,
  desc,
  eq,
  equityGrants,
  equityMilestones,
  equityPayouts,
  getNumber,
  getNumberList,
  gte,
  isNull,
  lt,
  pointsVault,
  sql,
  userProfiles,
  users,
} from "@cyneform/db";
import type {
  Eligibility,
  GrantEquityInput,
  GrantItem,
  MilestoneInput,
  MilestoneItem,
  MyEquity,
  PayoutItem,
  PayPayoutInput,
} from "@cyneform/types";
import { equityPayout, vestedPercent } from "@cyneform/validators";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { AuthUser } from "../access/auth-user";
import { AuditService } from "../audit/audit.service";
import type { ClientInfo } from "../common/client-info";
import { badRequest, conflict, notFound } from "../common/errors";
import { DB, type Db } from "../database/database.module";
import { NotificationsService } from "../notifications/notifications.service";

type Grant = typeof equityGrants.$inferSelect;
const DAY = 86_400_000;
const kes = (n: number) => `${n.toLocaleString("en-KE", { maximumFractionDigits: 2 })} KES`;

@Injectable()
export class EquityService {
  private readonly log = new Logger(EquityService.name);
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  private async toGrant(g: Grant, owner: string | null): Promise<GrantItem> {
    const milestones = [...(await getNumberList("equity.milestones"))].sort((a, b) => a - b);
    const [last] = await this.db
      .select({ v: sql<string>`coalesce(max(${equityMilestones.valuation}), 0)` })
      .from(equityMilestones);
    return {
      id: g.id,
      userId: g.userId,
      ownerName: owner,
      percentage: g.percentage,
      grantDate: g.grantDate.toISOString(),
      cliffDate: g.cliffDate.toISOString(),
      baselineValuation: g.baselineValuation,
      vestedPercent: vestedPercent(g.grantDate, new Date()),
      nextMilestone: milestones.find((m) => m > Number(last?.v ?? 0)) ?? null,
    };
  }

  async eligibility(userId: string): Promise<Eligibility> {
    const [u] = await this.db
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!u) throw notFound("User not found.");
    const [corpNeed, pipelineMin, target] = await Promise.all([
      getNumber("equity.corporate_contracts"),
      getNumber("equity.pipeline_min_kes"),
      getNumber("equity.quarterly_target_kes"),
    ]);
    const now = new Date();
    const days = (n: number) => new Date(now.getTime() - n * DAY);
    const [corporate] = await this.db
      .select({ n: count() })
      .from(dealCompensation)
      .innerJoin(crmEntries, eq(crmEntries.id, dealCompensation.crmEntryId))
      .where(
        and(
          eq(dealCompensation.userId, userId),
          gte(dealCompensation.closedAt, days(45)),
          eq(crmEntries.clientType, "Corporate Event"),
        ),
      );
    const [last] = await this.db
      .select({ at: sql<Date | null>`max(${dealCompensation.closedAt})` })
      .from(dealCompensation)
      .where(eq(dealCompensation.userId, userId));
    const [rev] = await this.db
      .select({ n: sql<string>`coalesce(sum(${dealCompensation.dealValue}), 0)` })
      .from(dealCompensation)
      .where(and(eq(dealCompensation.userId, userId), gte(dealCompensation.closedAt, days(90))));
    const [stale] = await this.db
      .select({ n: count() })
      .from(pointsVault)
      .where(
        and(
          eq(pointsVault.userId, userId),
          eq(pointsVault.status, "pending_verification"),
          lt(pointsVault.earnedAt, days(2)),
        ),
      );
    const [pipe] = await this.db
      .select({ n: sql<string>`coalesce(sum(${crmEntries.estimatedValue}), 0)` })
      .from(crmEntries)
      .where(
        and(eq(crmEntries.userId, userId), isNull(crmEntries.wonAt), isNull(crmEntries.lostAt)),
      );
    const months = (now.getTime() - u.createdAt.getTime()) / (30.44 * DAY);
    const lastAt = last?.at ? new Date(last.at) : null;
    const gap = lastAt ? Math.floor((now.getTime() - lastAt.getTime()) / DAY) : null;
    const revenue = Number(rev?.n ?? 0);
    const pipeline = Number(pipe?.n ?? 0);
    const checks = [
      {
        key: "cliff",
        label: "1-year cliff",
        ok: months >= 12,
        detail: `${Math.floor(months)} months of engagement`,
      },
      {
        key: "gap",
        label: "No 75-day gap without closing a deal",
        ok: gap !== null && gap <= 75,
        detail: gap === null ? "No deals closed yet" : `Last deal ${gap} days ago`,
      },
      {
        key: "corporate",
        label: `${corpNeed} corporate contracts in 45 days`,
        ok: Number(corporate?.n ?? 0) >= corpNeed,
        detail: `${corporate?.n ?? 0} closed`,
      },
      {
        key: "target",
        label: "Revenue target (last 90 days)",
        ok: target === 0 || revenue >= target,
        detail: target === 0 ? "Not enforced yet" : `${kes(revenue)} of ${kes(target)}`,
      },
      {
        key: "verification",
        label: "Points verification up to date",
        ok: Number(stale?.n ?? 0) === 0,
        detail: `${stale?.n ?? 0} entries waiting more than 48 hours`,
      },
      {
        key: "pipeline",
        label: `Pipeline of at least ${kes(pipelineMin)}`,
        ok: pipeline >= pipelineMin,
        detail: `${kes(pipeline)} in open entries`,
      },
    ];
    return { eligible: checks.every((c) => c.ok), checks };
  }

  async grant(input: GrantEquityInput, actor: AuthUser, client?: ClientInfo) {
    const eligibility = await this.eligibility(input.userId);
    if (!eligibility.eligible && !input.override)
      throw badRequest(
        "NOT_ELIGIBLE",
        `Not eligible yet: ${eligibility.checks
          .filter((c) => !c.ok)
          .map((c) => c.label)
          .join("; ")}. Use override with a reason to grant anyway.`,
      );
    const [dup] = await this.db
      .select({ id: equityGrants.id })
      .from(equityGrants)
      .where(eq(equityGrants.userId, input.userId))
      .limit(1);
    if (dup) throw conflict("ALREADY_GRANTED", "This BDP already has a phantom equity grant.");
    const now = new Date();
    const baseline = await getNumber("equity.baseline");
    try {
      await this.db.insert(equityGrants).values({
        userId: input.userId,
        percentage: input.percentage,
        grantDate: now,
        cliffDate: new Date(
          Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate()),
        ),
        baselineValuation: baseline,
        grantedBy: actor.id,
        reason: input.reason,
        overridden: eligibility.eligible ? 0 : 1,
      });
    } catch (err) {
      if ((err as { code?: string }).code === "ER_DUP_ENTRY")
        throw conflict("ALREADY_GRANTED", "This BDP already has a phantom equity grant.");
      throw err;
    }
    await this.notifications.notify(input.userId, {
      type: "equity.granted",
      title: "Congratulations! You've been granted phantom equity.",
      body: `Grant: ${input.percentage}% of company value appreciation. Vesting: 4-year schedule with 1-year cliff. Baseline valuation: ${kes(baseline)}.`,
      link: "/compensation",
    });
    await this.audit.record({
      actor,
      action: "equity.granted",
      targetType: "user",
      targetId: input.userId,
      details: {
        percentage: input.percentage,
        reason: input.reason,
        overridden: !eligibility.eligible,
      },
      client,
    });
  }

  async list(): Promise<GrantItem[]> {
    const rows = await this.db
      .select({ g: equityGrants, owner: userProfiles.fullName })
      .from(equityGrants)
      .leftJoin(userProfiles, eq(userProfiles.userId, equityGrants.userId))
      .orderBy(desc(equityGrants.createdAt));
    return Promise.all(rows.map(({ g, owner }) => this.toGrant(g, owner)));
  }
  async mine(actor: AuthUser): Promise<MyEquity> {
    const [grant] = await this.db
      .select()
      .from(equityGrants)
      .where(eq(equityGrants.userId, actor.id))
      .limit(1);
    return {
      grant: grant ? await this.toGrant(grant, null) : null,
      payouts: await this.payouts(actor.id),
    };
  }
  async milestones(): Promise<MilestoneItem[]> {
    const rows = await this.db
      .select()
      .from(equityMilestones)
      .orderBy(desc(equityMilestones.valuation));
    return rows.map((m) => ({
      id: m.id,
      name: m.name,
      valuation: m.valuation,
      reachedAt: m.reachedAt.toISOString(),
      notes: m.notes,
    }));
  }

  async recordMilestone(input: MilestoneInput, actor: AuthUser, client?: ClientInfo) {
    const [dup] = await this.db
      .select({ id: equityMilestones.id })
      .from(equityMilestones)
      .where(eq(equityMilestones.name, input.name))
      .limit(1);
    if (dup) throw conflict("MILESTONE_EXISTS", "A milestone with that name is already recorded.");
    const now = new Date();
    const id = crypto.randomUUID();
    const created: { userId: string; amount: number; vested: number }[] = [];
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(equityMilestones).values({
          id,
          name: input.name,
          valuation: input.valuation,
          recordedBy: actor.id,
          notes: input.notes ?? null,
        });
        const grants = await tx.select().from(equityGrants);
        for (const grant of grants) {
          const vested = vestedPercent(grant.grantDate, now);
          const amount = equityPayout(
            grant.percentage,
            vested,
            input.valuation,
            grant.baselineValuation,
          );
          if (vested <= 0 || amount <= 0) continue;
          await tx.insert(equityPayouts).values({
            grantId: grant.id,
            userId: grant.userId,
            milestoneId: id,
            vestedPercent: vested,
            amount,
          });
          created.push({ userId: grant.userId, amount, vested });
        }
      });
    } catch (err) {
      if ((err as { code?: string }).code === "ER_DUP_ENTRY")
        throw conflict("MILESTONE_EXISTS", "A milestone with that name is already recorded.");
      throw err;
    }
    for (const payout of created)
      await this.notifications.notify(payout.userId, {
        type: "equity.payout",
        title: `Milestone reached: ${input.name}`,
        body: `Your phantom equity payout: ${kes(payout.amount)} (${payout.vested}% vested).`,
        link: "/compensation",
      });
    await this.notifications.notifyRoles(
      ["admin", "super_admin"],
      {
        type: "equity.milestone",
        title: `Milestone reached: ${input.name}`,
        body: `${created.length} payout(s) created.`,
        link: "/rewards/equity",
      },
      actor.id,
    );
    await this.audit.record({
      actor,
      action: "equity.milestone",
      targetType: "equity_milestone",
      targetId: id,
      details: { name: input.name, valuation: input.valuation, payouts: created.length },
      client,
    });
  }

  async payouts(userId?: string): Promise<PayoutItem[]> {
    const rows = await this.db
      .select({ p: equityPayouts, owner: userProfiles.fullName, milestone: equityMilestones })
      .from(equityPayouts)
      .innerJoin(equityMilestones, eq(equityMilestones.id, equityPayouts.milestoneId))
      .leftJoin(userProfiles, eq(userProfiles.userId, equityPayouts.userId))
      .where(userId ? eq(equityPayouts.userId, userId) : undefined)
      .orderBy(desc(equityPayouts.createdAt))
      .limit(100);
    return rows.map(({ p, owner, milestone }) => ({
      id: p.id,
      userId: p.userId,
      ownerName: userId ? null : owner,
      milestoneName: milestone.name,
      valuation: milestone.valuation,
      vestedPercent: p.vestedPercent,
      amount: p.amount,
      status: p.status as PayoutItem["status"],
      paymentReference: p.paymentReference,
      createdAt: p.createdAt.toISOString(),
    }));
  }
  async payPayout(id: string, input: PayPayoutInput, actor: AuthUser, client?: ClientInfo) {
    const [payout] = await this.db
      .select()
      .from(equityPayouts)
      .where(eq(equityPayouts.id, id))
      .limit(1);
    if (!payout) throw notFound("Payout not found.");
    if (payout.status !== "pending")
      throw badRequest("NOT_PENDING", "This payout is already paid.");
    const changed = await this.db
      .update(equityPayouts)
      .set({
        status: "paid",
        paidBy: actor.id,
        paidAt: new Date(),
        paymentReference: input.reference,
      })
      .where(and(eq(equityPayouts.id, id), eq(equityPayouts.status, "pending")));
    if (!changed[0].affectedRows) throw badRequest("NOT_PENDING", "This payout is already paid.");
    await this.notifications.notify(payout.userId, {
      type: "equity.payout",
      title: `Your equity payout of ${kes(payout.amount)} was paid`,
      body: `Reference: ${input.reference}`,
      link: "/compensation",
    });
    await this.audit.record({
      actor,
      action: "equity.payout_paid",
      targetType: "equity_payout",
      targetId: id,
      details: { amount: payout.amount, reference: input.reference },
      client,
    });
  }

  async dailyVesting() {
    const now = new Date();
    const grants = await this.db
      .select({ grant: equityGrants, owner: userProfiles.fullName })
      .from(equityGrants)
      .leftJoin(userProfiles, eq(userProfiles.userId, equityGrants.userId));
    for (const { grant, owner } of grants) {
      const vested = vestedPercent(grant.grantDate, now);
      if (vested <= grant.vestedNotifiedPct) continue;
      const changed = await this.db
        .update(equityGrants)
        .set({ vestedNotifiedPct: vested })
        .where(and(eq(equityGrants.id, grant.id), lt(equityGrants.vestedNotifiedPct, vested)));
      if (!changed[0].affectedRows) continue;
      await this.notifications.notify(grant.userId, {
        type: "equity.vesting",
        title: `Your phantom equity is now ${vested}% vested`,
        link: "/compensation",
      });
      await this.notifications.notifyRoles(["admin", "super_admin"], {
        type: "equity.vesting",
        title:
          vested === 25
            ? `${owner ?? "A BDP"} has completed the 1-year cliff`
            : `${owner ?? "A BDP"} has reached ${vested}% vesting`,
        link: "/rewards/equity",
      });
    }
    this.log.log("Equity vesting check done");
  }
}
