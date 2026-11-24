import {
  and,
  compensationProfiles,
  count,
  crmEntries,
  dealCompensation,
  desc,
  eq,
  getNumber,
  getNumberList,
  gt,
  gte,
  inArray,
  lt,
  monthlyRevenue,
  newId,
  pointsVault,
  roles,
  rolloverTracking,
  sql,
  userProfiles,
  users,
} from "@cyneform/db";
import type {
  ApproveDealInput,
  CloseDealInput,
  CompensationStructure,
  CompensationSummary,
  DealItem,
  DealPage,
  DealQuery,
  EliteInput,
  PayDealInput,
  RolloverItem,
} from "@cyneform/types";
import { calculateDealCompensation, tierFor } from "@cyneform/validators";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { AuthUser } from "../access/auth-user";
import { AuditService } from "../audit/audit.service";
import type { ClientInfo } from "../common/client-info";
import { badRequest, notFound } from "../common/errors";
import { CrmService } from "../crm/crm.service";
import { DB, type Db } from "../database/database.module";
import { NotificationsService } from "../notifications/notifications.service";
import { PointsService } from "../points/points.service";

type Row = typeof dealCompensation.$inferSelect;
const PAGE = 25;
const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const kes = (n: number) => `${r2(n).toLocaleString("en-KE")} KES`;
const eat = (d: Date) => new Date(d.getTime() + 3 * 3_600_000);
const monthKey = (d: Date) => eat(d).toISOString().slice(0, 7);
const monthsBack = (d: Date, n: number) => {
  const e = eat(d);
  e.setUTCMonth(e.getUTCMonth() - n, 1);
  return e.toISOString().slice(0, 7);
};

@Injectable()
export class CompensationService {
  private readonly log = new Logger(CompensationService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(PointsService) private readonly points: PointsService,
    @Inject(CrmService) private readonly crm: CrmService,
  ) {}

  private async rules() {
    const rules = {
      limits: (await getNumberList("compensation.tier_limits")) as number[],
      rates: (await getNumberList("compensation.tier_rates")) as number[],
      caps: [
        await getNumber("compensation.cap_phase1"),
        await getNumber("compensation.cap_phase2"),
        await getNumber("compensation.cap_phase3"),
      ],
      phase2Revenue: await getNumber("compensation.phase2_revenue"),
      kesPerPoint: await getNumber("points.kes_per_point"),
      rolloverDays: await getNumber("points.rollover_days"),
    };
    if (
      rules.rates.length !== rules.limits.length + 1 ||
      rules.limits.some((n, i) => {
        const previous = rules.limits[i - 1];
        return previous !== undefined && n <= previous;
      })
    ) {
      throw badRequest(
        "COMPENSATION_SETTINGS",
        "Commission tier rates and limits are misconfigured.",
      );
    }
    return rules;
  }

  private toDeal(d: Row, owner: string | null): DealItem {
    return {
      id: d.id,
      crmEntryId: d.crmEntryId,
      userId: d.userId,
      ownerName: owner,
      dealName: d.dealName,
      dealValue: d.dealValue,
      closedAt: d.closedAt.toISOString(),
      month: d.month,
      cumulativeAfter: d.cumulativeAfter,
      tier: d.tier,
      commissionRate: d.commissionRate,
      commissionAmount: d.commissionAmount,
      kesPerPoint: d.kesPerPoint,
      pointsUsed: d.pointsUsed,
      pointsValue: d.pointsValue,
      rolloverApplied: d.rolloverApplied,
      totalBeforeCap: d.totalBeforeCap,
      capPhase: d.capPhase,
      capRate: d.capRate,
      capAmount: d.capAmount,
      finalPayout: d.finalPayout,
      rolloverCreated: d.rolloverCreated,
      clientPaymentStatus: d.clientPaymentStatus as DealItem["clientPaymentStatus"],
      paymentStatus: d.paymentStatus as DealItem["paymentStatus"],
      paymentReference: d.paymentReference,
      approvedAt: d.approvedAt?.toISOString() ?? null,
      paidAt: d.paidAt?.toISOString() ?? null,
    };
  }

  private assertCloseable(
    e:
      | { userId: string; isCompleted: boolean; wonAt: Date | null; lostAt: Date | null }
      | undefined,
    actor: AuthUser,
  ) {
    if (!e || e.userId !== actor.id) throw notFound("CRM entry not found.");
    if (e.wonAt || e.lostAt) throw badRequest("CLOSED", "This entry is already closed.");
    if (!e.isCompleted)
      throw badRequest(
        "INCOMPLETE",
        "Complete all required fields and upload evidence before closing the deal.",
      );
  }

  /** Spec CRM-006 and COMP-010, steps 1 to 9. */
  async close(
    entryId: string,
    input: CloseDealInput,
    actor: AuthUser,
    client?: ClientInfo,
  ): Promise<DealItem> {
    const [pre] = await this.db
      .select()
      .from(crmEntries)
      .where(eq(crmEntries.id, entryId))
      .limit(1);
    this.assertCloseable(pre, actor);
    const entry0 = pre as typeof crmEntries.$inferSelect;

    // +20 for the win, before the sum below, so it is part of the points cashed in. The 24h duplicate rule makes a retry harmless.
    await this.points
      .award({
        userId: actor.id,
        ruleKey: "deal_won",
        leadId: entry0.leadId,
        crmEntryId: entry0.id,
      })
      .catch(() => undefined);

    const r = await this.rules();
    const now = new Date();
    const month = monthKey(now);
    const value = r2(input.projectValue);
    const out = { id: newId() };

    await this.db.transaction(async (tx) => {
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, actor.id))
        .limit(1)
        .for("update");
      const [e] = await tx
        .select()
        .from(crmEntries)
        .where(eq(crmEntries.id, entryId))
        .limit(1)
        .for("update");
      this.assertCloseable(e, actor);
      const entry = e as typeof crmEntries.$inferSelect;

      // Pillar 2: tiered commission on the NEW cumulative monthly revenue.
      const [m] = await tx
        .select()
        .from(monthlyRevenue)
        .where(and(eq(monthlyRevenue.userId, actor.id), eq(monthlyRevenue.month, month)))
        .limit(1)
        .for("update");
      const cumBefore = m?.cumulativeRevenue ?? 0;

      // Pillar 5: which cap phase applies.
      const [prof] = await tx
        .select()
        .from(compensationProfiles)
        .where(eq(compensationProfiles.userId, actor.id))
        .limit(1);
      const [yr] = await tx
        .select({ n: sql<string>`coalesce(sum(${monthlyRevenue.cumulativeRevenue}), 0)` })
        .from(monthlyRevenue)
        .where(
          and(eq(monthlyRevenue.userId, actor.id), gte(monthlyRevenue.month, monthsBack(now, 11))),
        );
      const phase = prof?.elite ? 3 : Number(yr?.n ?? 0) >= r.phase2Revenue ? 2 : 1;
      const capRate = r.caps[phase - 1] as number;

      // Points vault value: every ACTIVE point (spec COMP-010 step 3).
      const [pts] = await tx
        .select({ n: sql<string>`coalesce(sum(${pointsVault.points}), 0)` })
        .from(pointsVault)
        .where(and(eq(pointsVault.userId, actor.id), eq(pointsVault.status, "active")));
      const pointsUsed = r2(Number(pts?.n ?? 0));

      // Rollover from earlier deals that has not expired (step 6).
      const prior = await tx
        .select()
        .from(rolloverTracking)
        .where(
          and(
            eq(rolloverTracking.userId, actor.id),
            eq(rolloverTracking.status, "active"),
            gt(rolloverTracking.expiresAt, now),
          ),
        )
        .for("update");
      const rolloverApplied = r2(prior.reduce((s, p) => s + p.remainingBalance, 0));

      const calculation = calculateDealCompensation({
        cumulativeBefore: cumBefore,
        dealValue: value,
        tierLimits: r.limits,
        tierRates: r.rates,
        pointsUsed,
        kesPerPoint: r.kesPerPoint,
        rolloverApplied,
        capPhase: phase,
        capRate,
      });

      await tx.insert(dealCompensation).values({
        id: out.id,
        userId: actor.id,
        crmEntryId: entry.id,
        leadId: entry.leadId,
        dealName: entry.clientName,
        dealValue: value,
        closedAt: now,
        month,
        ...calculation,
        clientPaymentStatus: input.clientPaymentStatus,
        clientPaidAt: input.clientPaymentStatus === "fully_paid" ? now : null,
      });
      await tx
        .update(pointsVault)
        .set({ status: "used", usedInDealId: out.id })
        .where(and(eq(pointsVault.userId, actor.id), eq(pointsVault.status, "active")));
      if (prior.length) {
        await tx
          .update(rolloverTracking)
          .set({ status: "applied", remainingBalance: 0, appliedInDealId: out.id })
          .where(
            inArray(
              rolloverTracking.id,
              prior.map((p) => p.id),
            ),
          );
      }
      if (calculation.rolloverCreated > 0) {
        await tx.insert(rolloverTracking).values({
          userId: actor.id,
          sourceDealId: out.id,
          rolloverAmount: calculation.rolloverCreated,
          remainingBalance: calculation.rolloverCreated,
          expiresAt: new Date(now.getTime() + r.rolloverDays * DAY),
        });
      }
      if (m) {
        await tx
          .update(monthlyRevenue)
          .set({
            cumulativeRevenue: calculation.cumulativeAfter,
            dealsClosed: m.dealsClosed + 1,
            tierApplied: calculation.tier,
            effectiveRate: calculation.commissionRate,
          })
          .where(eq(monthlyRevenue.id, m.id));
      } else {
        await tx.insert(monthlyRevenue).values({
          userId: actor.id,
          month,
          cumulativeRevenue: calculation.cumulativeAfter,
          dealsClosed: 1,
          tierApplied: calculation.tier,
          effectiveRate: calculation.commissionRate,
        });
      }
      const closed = {
        won: true,
        won_at: now.toISOString(),
        project_name: entry.clientName,
        project_value: value,
        commission_rate: calculation.commissionRate,
        commission_amount: calculation.commissionAmount,
        points_used: calculation.pointsUsed,
        points_value: calculation.pointsValue,
        total_compensation: calculation.finalPayout,
        compensation_status: input.clientPaymentStatus,
        payment_date: null,
        payment_reference: null,
      };
      await tx
        .update(crmEntries)
        .set({
          statuses: JSON.stringify([...(JSON.parse(entry.statuses) as string[]), "won"]),
          currentStatus: "won",
          wonAt: now,
          closedProject: JSON.stringify(closed),
        })
        .where(eq(crmEntries.id, entryId));
    });

    await this.crm.cancelFollowups(entryId, "won");
    const [row] = await this.db
      .select()
      .from(dealCompensation)
      .where(eq(dealCompensation.id, out.id))
      .limit(1);
    const deal = this.toDeal(row as Row, null);
    await this.audit.record({
      actor,
      action: "compensation.deal_closed",
      targetType: "deal",
      targetId: out.id,
      details: {
        value,
        tier: deal.tier,
        rate: deal.commissionRate,
        pointsUsed: deal.pointsUsed,
        capPhase: deal.capPhase,
        finalPayout: deal.finalPayout,
        rollover: deal.rolloverCreated,
      },
      client,
    });
    await this.notifications.notify(actor.id, {
      type: "compensation.deal_closed",
      title: `Deal closed! ${deal.dealName}: ${kes(deal.finalPayout)}`,
      body: `${deal.pointsUsed} points used${deal.rolloverCreated > 0 ? `, ${kes(deal.rolloverCreated)} rolled over to your next deal` : ""}.`,
      link: "/compensation",
    });
    const [who] = await this.db
      .select({ n: userProfiles.fullName })
      .from(userProfiles)
      .where(eq(userProfiles.userId, actor.id))
      .limit(1);
    await this.notifications.notifyRoles(
      ["admin", "super_admin"],
      {
        type: "compensation.deal_closed",
        title: `${who?.n ?? "A BDP"} closed a deal! ${deal.dealName}`,
        body: `Compensation: ${kes(deal.finalPayout)}`,
        link: "/compensation/admin",
      },
      actor.id,
    );
    return { ...deal, ownerName: who?.n ?? null };
  }

  private async page(where: ReturnType<typeof and>, page: number): Promise<DealPage> {
    const [t] = await this.db.select({ n: count() }).from(dealCompensation).where(where);
    const rows = await this.db
      .select({ d: dealCompensation, owner: userProfiles.fullName })
      .from(dealCompensation)
      .leftJoin(userProfiles, eq(userProfiles.userId, dealCompensation.userId))
      .where(where)
      .orderBy(desc(dealCompensation.closedAt))
      .limit(PAGE)
      .offset((page - 1) * PAGE);
    return {
      total: Number(t?.n ?? 0),
      page,
      pageSize: PAGE,
      items: rows.map(({ d, owner }) => this.toDeal(d, owner)),
    };
  }

  myDeals(q: DealQuery, actor: AuthUser) {
    return this.page(
      and(
        eq(dealCompensation.userId, actor.id),
        q.paymentStatus ? eq(dealCompensation.paymentStatus, q.paymentStatus) : undefined,
      ),
      q.page,
    );
  }

  adminDeals(q: DealQuery) {
    return this.page(
      and(
        q.userId ? eq(dealCompensation.userId, q.userId) : undefined,
        q.paymentStatus ? eq(dealCompensation.paymentStatus, q.paymentStatus) : undefined,
      ),
      q.page,
    );
  }

  async rollover(actor: AuthUser): Promise<RolloverItem[]> {
    const rows = await this.db
      .select()
      .from(rolloverTracking)
      .where(eq(rolloverTracking.userId, actor.id))
      .orderBy(desc(rolloverTracking.createdAt))
      .limit(50);
    return rows.map((x) => ({
      id: x.id,
      sourceDealId: x.sourceDealId,
      rolloverAmount: x.rolloverAmount,
      remainingBalance: x.remainingBalance,
      expiresAt: x.expiresAt.toISOString(),
      status: x.status as RolloverItem["status"],
      createdAt: x.createdAt.toISOString(),
    }));
  }

  async summary(actor: AuthUser): Promise<CompensationSummary> {
    const r = await this.rules();
    const now = new Date();
    const month = monthKey(now);
    const sumOf = async (status: string[]) => {
      const [x] = await this.db
        .select({ n: sql<string>`coalesce(sum(${dealCompensation.finalPayout}), 0)` })
        .from(dealCompensation)
        .where(
          and(
            eq(dealCompensation.userId, actor.id),
            inArray(dealCompensation.paymentStatus, status),
          ),
        );
      return Number(x?.n ?? 0);
    };
    const [roll] = await this.db
      .select({
        total: sql<string>`coalesce(sum(${rolloverTracking.remainingBalance}), 0)`,
        soon: sql<string>`coalesce(sum(case when ${rolloverTracking.expiresAt} <= ${new Date(now.getTime() + 7 * DAY)} then ${rolloverTracking.remainingBalance} else 0 end), 0)`,
      })
      .from(rolloverTracking)
      .where(
        and(
          eq(rolloverTracking.userId, actor.id),
          eq(rolloverTracking.status, "active"),
          gt(rolloverTracking.expiresAt, now),
        ),
      );
    const [pts] = await this.db
      .select({ n: sql<string>`coalesce(sum(${pointsVault.points}), 0)` })
      .from(pointsVault)
      .where(and(eq(pointsVault.userId, actor.id), eq(pointsVault.status, "active")));
    const [m] = await this.db
      .select()
      .from(monthlyRevenue)
      .where(and(eq(monthlyRevenue.userId, actor.id), eq(monthlyRevenue.month, month)))
      .limit(1);
    const [prof] = await this.db
      .select()
      .from(compensationProfiles)
      .where(eq(compensationProfiles.userId, actor.id))
      .limit(1);
    const [yr] = await this.db
      .select({ n: sql<string>`coalesce(sum(${monthlyRevenue.cumulativeRevenue}), 0)` })
      .from(monthlyRevenue)
      .where(
        and(eq(monthlyRevenue.userId, actor.id), gte(monthlyRevenue.month, monthsBack(now, 11))),
      );
    const monthRevenue = m?.cumulativeRevenue ?? 0;
    const { tier, rate } = tierFor(monthRevenue, r.limits, r.rates);
    const phase = prof?.elite ? 3 : Number(yr?.n ?? 0) >= r.phase2Revenue ? 2 : 1;
    return {
      lifetimePaid: await sumOf(["paid"]),
      pendingPayout: await sumOf(["pending", "approved"]),
      rolloverBalance: r2(Number(roll?.total ?? 0)),
      rolloverExpiringSoon: r2(Number(roll?.soon ?? 0)),
      activePoints: r2(Number(pts?.n ?? 0)),
      month,
      monthRevenue,
      tier,
      rate,
      nextTierAt: r.limits[tier - 1] ?? null,
      capPhase: phase,
      capRate: r.caps[phase - 1] as number,
    };
  }

  async structure(): Promise<CompensationStructure> {
    const r = await this.rules();
    return {
      tiers: r.rates.map((rate, i) => ({
        tier: i + 1,
        from: i === 0 ? 0 : (r.limits[i - 1] as number),
        to: r.limits[i] ?? null,
        rate,
      })),
      caps: [
        {
          phase: 1,
          rate: r.caps[0] as number,
          note: "Until you reach the annual revenue for phase 2",
        },
        {
          phase: 2,
          rate: r.caps[1] as number,
          note: `After ${kes(r.phase2Revenue)} revenue in 12 months`,
        },
        { phase: 3, rate: r.caps[2] as number, note: "Elite performers, set by an admin" },
      ],
      kesPerPoint: r.kesPerPoint,
      rolloverDays: r.rolloverDays,
    };
  }

  private async deal(id: string): Promise<Row> {
    const [d] = await this.db
      .select()
      .from(dealCompensation)
      .where(eq(dealCompensation.id, id))
      .limit(1);
    if (!d) throw notFound("Deal not found.");
    return d;
  }

  async markClientPaid(id: string, actor: AuthUser, client?: ClientInfo) {
    const d = await this.deal(id);
    if (d.clientPaymentStatus === "fully_paid")
      throw badRequest("ALREADY_PAID", "The client is already marked as paid.");
    await this.db.transaction(async (tx) => {
      const res = await tx
        .update(dealCompensation)
        .set({ clientPaymentStatus: "fully_paid", clientPaidAt: new Date() })
        .where(
          and(eq(dealCompensation.id, id), eq(dealCompensation.clientPaymentStatus, "not_paid")),
        );
      if (!res[0].affectedRows)
        throw badRequest("ALREADY_PAID", "The client is already marked as paid.");
      const [e] = await tx
        .select({ c: crmEntries.closedProject })
        .from(crmEntries)
        .where(eq(crmEntries.id, d.crmEntryId))
        .limit(1);
      if (e?.c) {
        const cp = JSON.parse(e.c) as Record<string, unknown>;
        await tx
          .update(crmEntries)
          .set({ closedProject: JSON.stringify({ ...cp, compensation_status: "fully_paid" }) })
          .where(eq(crmEntries.id, d.crmEntryId));
      }
    });
    await this.audit.record({
      actor,
      action: "compensation.client_paid",
      targetType: "deal",
      targetId: id,
      client,
    });
  }

  async approve(id: string, input: ApproveDealInput, actor: AuthUser, client?: ClientInfo) {
    const d = await this.deal(id);
    if (d.paymentStatus !== "pending")
      throw badRequest("NOT_PENDING", "Only a pending payout can be approved.");
    if (d.clientPaymentStatus !== "fully_paid")
      throw badRequest(
        "CLIENT_UNPAID",
        "The client has not paid this invoice yet. Mark the client as paid first.",
      );
    const res = await this.db
      .update(dealCompensation)
      .set({
        paymentStatus: "approved",
        approvedBy: actor.id,
        approvedAt: new Date(),
        paymentNote: input.note ?? null,
      })
      .where(and(eq(dealCompensation.id, id), eq(dealCompensation.paymentStatus, "pending")));
    if (!res[0].affectedRows)
      throw badRequest("NOT_PENDING", "Only a pending payout can be approved.");
    await this.notifications.notify(d.userId, {
      type: "compensation.approved",
      title: `Your payout for ${d.dealName} was approved: ${kes(d.finalPayout)}`,
      link: "/compensation",
    });
    await this.audit.record({
      actor,
      action: "compensation.approved",
      targetType: "deal",
      targetId: id,
      details: { amount: d.finalPayout },
      client,
    });
  }

  async pay(id: string, input: PayDealInput, actor: AuthUser, client?: ClientInfo) {
    const d = await this.deal(id);
    if (d.paymentStatus !== "approved")
      throw badRequest("NOT_APPROVED", "Approve the payout before marking it as paid.");
    const now = new Date();
    await this.db.transaction(async (tx) => {
      const res = await tx
        .update(dealCompensation)
        .set({
          paymentStatus: "paid",
          paidBy: actor.id,
          paidAt: now,
          paymentReference: input.reference,
          paymentNote: input.note ?? d.paymentNote,
        })
        .where(and(eq(dealCompensation.id, id), eq(dealCompensation.paymentStatus, "approved")));
      if (!res[0].affectedRows)
        throw badRequest("NOT_APPROVED", "Approve the payout before marking it as paid.");
      const [e] = await tx
        .select({ c: crmEntries.closedProject })
        .from(crmEntries)
        .where(eq(crmEntries.id, d.crmEntryId))
        .limit(1);
      if (e?.c) {
        const cp = JSON.parse(e.c) as Record<string, unknown>;
        await tx
          .update(crmEntries)
          .set({
            closedProject: JSON.stringify({
              ...cp,
              payment_date: now.toISOString(),
              payment_reference: input.reference,
            }),
          })
          .where(eq(crmEntries.id, d.crmEntryId));
      }
    });
    await this.notifications.notify(d.userId, {
      type: "compensation.paid",
      title: `You were paid ${kes(d.finalPayout)} for ${d.dealName}`,
      body: `Reference: ${input.reference}`,
      link: "/compensation",
    });
    await this.audit.record({
      actor,
      action: "compensation.paid",
      targetType: "deal",
      targetId: id,
      details: { amount: d.finalPayout, reference: input.reference },
      client,
    });
  }

  async setElite(input: EliteInput, actor: AuthUser, client?: ClientInfo) {
    const [u] = await this.db
      .select({ id: users.id })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(and(eq(users.id, input.userId), eq(roles.code, "bdp")))
      .limit(1);
    if (!u) throw notFound("BDP not found.");
    await this.db
      .insert(compensationProfiles)
      .values({ userId: input.userId, elite: input.elite, updatedBy: actor.id })
      .onDuplicateKeyUpdate({ set: { elite: input.elite, updatedBy: actor.id } });
    await this.audit.record({
      actor,
      action: "compensation.elite_set",
      targetType: "user",
      targetId: input.userId,
      details: { elite: input.elite, reason: input.reason },
      client,
    });
  }

  /** Daily job: rollover past its expiry is forfeited (setting points.rollover_days). */
  async expireRollover() {
    const now = new Date();
    const due = await this.db
      .select({
        userId: rolloverTracking.userId,
        n: sql<string>`sum(${rolloverTracking.remainingBalance})`,
      })
      .from(rolloverTracking)
      .where(and(eq(rolloverTracking.status, "active"), lt(rolloverTracking.expiresAt, now)))
      .groupBy(rolloverTracking.userId);
    for (const d of due) {
      const res = await this.db
        .update(rolloverTracking)
        .set({ status: "expired" })
        .where(
          and(
            eq(rolloverTracking.userId, d.userId),
            eq(rolloverTracking.status, "active"),
            lt(rolloverTracking.expiresAt, now),
          ),
        );
      if (!res[0].affectedRows) continue;
      await this.notifications.notify(d.userId, {
        type: "compensation.rollover_expired",
        title: `${kes(Number(d.n))} of rollover expired`,
        link: "/compensation",
      });
      await this.audit.record({
        actor: null,
        action: "compensation.rollover_expired",
        targetType: "user",
        targetId: d.userId,
        details: { amount: Number(d.n) },
      });
    }
    this.log.log(`Rollover expiry: ${due.length} user(s)`);
  }
}
