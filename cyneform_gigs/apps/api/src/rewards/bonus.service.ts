import {
  and,
  asc,
  count,
  dealCompensation,
  desc,
  eq,
  getNumber,
  gt,
  gte,
  inArray,
  or,
  performanceBonuses,
  rolloverTracking,
  sql,
  userProfiles,
  users,
} from "@cyneform/db";
import type {
  BonusDecisionInput,
  BonusItem,
  BonusPage,
  BonusQuery,
  PayBonusInput,
} from "@cyneform/types";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { AuthUser } from "../access/auth-user";
import { AuditService } from "../audit/audit.service";
import type { ClientInfo } from "../common/client-info";
import { badRequest, notFound } from "../common/errors";
import { DB, type Db } from "../database/database.module";
import { NotificationsService } from "../notifications/notifications.service";

type Row = typeof performanceBonuses.$inferSelect;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const DAY = 86_400_000;
const PAGE = 25;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const kes = (n: number) => `${r2(n).toLocaleString("en-KE")} KES`;

@Injectable()
export class BonusService {
  private readonly log = new Logger(BonusService.name);
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  private toItem(b: Row, owner: string | null): BonusItem {
    return {
      id: b.id,
      userId: b.userId,
      ownerName: owner,
      contractsClosed: b.contractsClosed,
      windowStart: b.windowStart.toISOString(),
      windowEnd: b.windowEnd.toISOString(),
      rolloverSnapshot: b.rolloverSnapshot,
      maxPayout: b.maxPayout,
      status: b.status as BonusItem["status"],
      amount: b.amount,
      liquidatedAmount: b.liquidatedAmount,
      decisionNotes: b.decisionNotes,
      paymentReference: b.paymentReference,
      createdAt: b.createdAt.toISOString(),
    };
  }

  private async rolloverBalance(q: Pick<Db, "select">, userId: string) {
    const [r] = await q
      .select({ n: sql<string>`coalesce(sum(${rolloverTracking.remainingBalance}), 0)` })
      .from(rolloverTracking)
      .where(
        and(
          eq(rolloverTracking.userId, userId),
          eq(rolloverTracking.status, "active"),
          gt(rolloverTracking.expiresAt, new Date()),
        ),
      );
    return r2(Number(r?.n ?? 0));
  }

  async weeklyCheck() {
    const minContracts = await getNumber("bonus.min_contracts");
    const windowDays = await getNumber("bonus.window_days");
    const pctMax = await getNumber("bonus.max_percent");
    const end = new Date();
    const start = new Date(end.getTime() - windowDays * DAY);
    const rows = await this.db
      .select({ userId: dealCompensation.userId, n: count() })
      .from(dealCompensation)
      .innerJoin(users, eq(users.id, dealCompensation.userId))
      .where(and(gte(dealCompensation.closedAt, start), eq(users.status, "active")))
      .groupBy(dealCompensation.userId)
      .having(sql`count(*) >= ${minContracts}`);
    let made = 0;
    for (const r of rows) {
      const [open] = await this.db
        .select({ n: count() })
        .from(performanceBonuses)
        .where(
          and(
            eq(performanceBonuses.userId, r.userId),
            or(
              inArray(performanceBonuses.status, [
                "pending_review",
                "deferred",
                "authorized",
                "liquidated",
              ]),
              gte(performanceBonuses.createdAt, start),
            ),
          ),
        );
      if (Number(open?.n ?? 0)) continue;
      const balance = await this.rolloverBalance(this.db, r.userId);
      if (balance <= 0) continue;
      const max = r2((balance * pctMax) / 100);
      await this.db.insert(performanceBonuses).values({
        userId: r.userId,
        contractsClosed: Number(r.n),
        windowStart: start,
        windowEnd: end,
        rolloverSnapshot: balance,
        maxPayout: max,
      });
      const [who] = await this.db
        .select({ n: userProfiles.fullName })
        .from(userProfiles)
        .where(eq(userProfiles.userId, r.userId))
        .limit(1);
      await this.notifications.notifyRoles(["super_admin"], {
        type: "bonus.candidate",
        title: `${who?.n ?? "A BDP"} has qualified for Performance Accelerated Liquidation.`,
        body: `Contracts closed: ${r.n} in the last ${windowDays} days. Rollover vault balance: ${kes(balance)}. Potential bonus: up to ${kes(max)} (${pctMax}%).`,
        link: "/rewards/bonus",
      });
      made++;
    }
    this.log.log(`Bonus check: ${made} new candidate(s)`);
  }

  async list(q: BonusQuery): Promise<BonusPage> {
    const where = q.status ? eq(performanceBonuses.status, q.status) : undefined;
    const [t] = await this.db.select({ n: count() }).from(performanceBonuses).where(where);
    const rows = await this.db
      .select({ b: performanceBonuses, owner: userProfiles.fullName })
      .from(performanceBonuses)
      .leftJoin(userProfiles, eq(userProfiles.userId, performanceBonuses.userId))
      .where(where)
      .orderBy(desc(performanceBonuses.createdAt))
      .limit(PAGE)
      .offset((q.page - 1) * PAGE);
    return {
      total: Number(t?.n ?? 0),
      page: q.page,
      pageSize: PAGE,
      items: rows.map(({ b, owner }) => this.toItem(b, owner)),
    };
  }

  async mine(actor: AuthUser): Promise<BonusItem[]> {
    const rows = await this.db
      .select()
      .from(performanceBonuses)
      .where(
        and(
          eq(performanceBonuses.userId, actor.id),
          inArray(performanceBonuses.status, ["authorized", "liquidated", "paid"]),
        ),
      )
      .orderBy(desc(performanceBonuses.createdAt))
      .limit(20);
    return rows.map((b) => this.toItem(b, null));
  }

  async decide(id: string, input: BonusDecisionInput, actor: AuthUser, client?: ClientInfo) {
    const [b] = await this.db
      .select()
      .from(performanceBonuses)
      .where(eq(performanceBonuses.id, id))
      .limit(1);
    if (!b) throw notFound("Bonus record not found.");
    if (!["pending_review", "deferred"].includes(b.status))
      throw badRequest("NOT_OPEN", "This bonus has already been decided.");
    const status =
      input.decision === "authorize"
        ? "authorized"
        : input.decision === "decline"
          ? "declined"
          : "deferred";
    if (input.decision === "authorize") {
      const pctMax = await getNumber("bonus.max_percent");
      const max = r2(((await this.rolloverBalance(this.db, b.userId)) * pctMax) / 100);
      if ((input.amount as number) > max)
        throw badRequest(
          "OVER_MAX",
          `The maximum bonus is ${kes(max)} (${pctMax}% of the current rollover vault).`,
        );
    }
    const res = await this.db
      .update(performanceBonuses)
      .set({
        status,
        amount: input.decision === "authorize" ? (input.amount as number) : null,
        decidedBy: actor.id,
        decidedAt: new Date(),
        decisionNotes: input.notes,
      })
      .where(
        and(
          eq(performanceBonuses.id, id),
          inArray(performanceBonuses.status, ["pending_review", "deferred"]),
        ),
      );
    if (!res[0].affectedRows) throw badRequest("NOT_OPEN", "This bonus has already been decided.");
    await this.audit.record({
      actor,
      action: `bonus.${status}`,
      targetType: "bonus",
      targetId: id,
      details: { amount: input.amount, notes: input.notes },
      client,
    });
    if (input.decision === "authorize") await this.tryLiquidate(id);
  }

  async tryLiquidate(id: string) {
    const [b] = await this.db
      .select()
      .from(performanceBonuses)
      .where(eq(performanceBonuses.id, id))
      .limit(1);
    if (b?.status !== "authorized" || b.amount == null) return;
    const windowDays = await getNumber("bonus.invoice_window_days");
    const major = await getNumber("bonus.major_invoice_kes");
    const [cleared] = await this.db
      .select({ n: count() })
      .from(dealCompensation)
      .where(
        and(
          gte(dealCompensation.clientPaidAt, new Date(Date.now() - windowDays * DAY)),
          gte(dealCompensation.dealValue, major),
        ),
      );
    if (!Number(cleared?.n ?? 0)) return;
    const out = { paid: 0, left: 0 };
    await this.db.transaction(async (tx: Tx) => {
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, b.userId))
        .limit(1)
        .for("update");
      const [fresh] = await tx
        .select()
        .from(performanceBonuses)
        .where(eq(performanceBonuses.id, id))
        .limit(1)
        .for("update");
      if (fresh?.status !== "authorized" || fresh.amount == null) return;
      const rows = await tx
        .select()
        .from(rolloverTracking)
        .where(
          and(
            eq(rolloverTracking.userId, b.userId),
            eq(rolloverTracking.status, "active"),
            gt(rolloverTracking.expiresAt, new Date()),
          ),
        )
        .orderBy(asc(rolloverTracking.createdAt))
        .for("update");
      let need = fresh.amount;
      for (const row of rows) {
        if (need <= 0) break;
        const take = Math.min(need, row.remainingBalance);
        const left = r2(row.remainingBalance - take);
        await tx
          .update(rolloverTracking)
          .set({ remainingBalance: left, status: left === 0 ? "paid_out" : "active" })
          .where(eq(rolloverTracking.id, row.id));
        need = r2(need - take);
        out.paid = r2(out.paid + take);
      }
      out.left = r2(rows.reduce((sum, row) => sum + row.remainingBalance, 0) - out.paid);
      if (out.paid <= 0) return;
      const changed = await tx
        .update(performanceBonuses)
        .set({ status: "liquidated", liquidatedAt: new Date(), liquidatedAmount: out.paid })
        .where(and(eq(performanceBonuses.id, id), eq(performanceBonuses.status, "authorized")));
      if (!changed[0].affectedRows)
        throw badRequest("NOT_OPEN", "This bonus has already been liquidated.");
    });
    if (out.paid <= 0) return;
    await this.notifications.notify(b.userId, {
      type: "bonus.decided",
      title: "Congratulations! The Managing Partner has authorized a performance bonus.",
      body: `Amount: ${kes(out.paid)}. Your remaining rollover balance: ${kes(out.left)}.`,
      link: "/compensation",
    });
    await this.audit.record({
      actor: null,
      action: "bonus.liquidated",
      targetType: "bonus",
      targetId: id,
      details: { amount: out.paid },
    });
  }

  async processQueued() {
    const rows = await this.db
      .select({ id: performanceBonuses.id })
      .from(performanceBonuses)
      .where(eq(performanceBonuses.status, "authorized"));
    for (const row of rows) await this.tryLiquidate(row.id);
  }

  async pay(id: string, input: PayBonusInput, actor: AuthUser, client?: ClientInfo) {
    const [b] = await this.db
      .select()
      .from(performanceBonuses)
      .where(eq(performanceBonuses.id, id))
      .limit(1);
    if (!b) throw notFound("Bonus record not found.");
    if (b.status !== "liquidated")
      throw badRequest("NOT_LIQUIDATED", "Only a liquidated bonus can be marked as paid.");
    const changed = await this.db
      .update(performanceBonuses)
      .set({
        status: "paid",
        paidBy: actor.id,
        paidAt: new Date(),
        paymentReference: input.reference,
      })
      .where(and(eq(performanceBonuses.id, id), eq(performanceBonuses.status, "liquidated")));
    if (!changed[0].affectedRows)
      throw badRequest("NOT_LIQUIDATED", "Only a liquidated bonus can be marked as paid.");
    await this.notifications.notify(b.userId, {
      type: "bonus.decided",
      title: `Your performance bonus of ${kes(b.liquidatedAmount ?? 0)} was paid`,
      body: `Reference: ${input.reference}`,
      link: "/compensation",
    });
    await this.audit.record({
      actor,
      action: "bonus.paid",
      targetType: "bonus",
      targetId: id,
      details: { reference: input.reference },
      client,
    });
  }
}
