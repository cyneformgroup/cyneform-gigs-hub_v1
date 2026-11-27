import {
  and,
  auditLogs,
  count,
  crmEntries,
  dealCompensation,
  desc,
  eq,
  equityPayouts,
  getNumber,
  gte,
  inArray,
  isNull,
  leads,
  lt,
  or,
  performanceBonuses,
  pointsVault,
  roles,
  sql,
  userProfiles,
  users,
} from "@cyneform/db";
import type { Dashboard } from "@cyneform/types";
import { Inject, Injectable } from "@nestjs/common";
import { DB, type Db } from "../database/database.module";

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(Number(n ?? 0) * 100) / 100;
const eatDay = (d: Date) => new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

@Injectable()
export class DashboardService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async summary(): Promise<Dashboard> {
    const now = new Date();
    const eatNow = new Date(now.getTime() + 3 * 3_600_000);
    const dayStart = new Date(
      Date.UTC(eatNow.getUTCFullYear(), eatNow.getUTCMonth(), eatNow.getUTCDate()) - 3 * 3_600_000,
    );
    const monthStart = new Date(
      Date.UTC(eatNow.getUTCFullYear(), eatNow.getUTCMonth(), 1) - 3 * 3_600_000,
    );
    const weekAgo = new Date(now.getTime() - 7 * DAY);
    const thirty = new Date(dayStart.getTime() - 29 * DAY);
    const idle = await getNumber("reports.dashboard_idle_days");

    const bdp = (status: "active" | "frozen") =>
      this.db
        .select({ n: count() })
        .from(users)
        .innerJoin(roles, eq(roles.id, users.roleId))
        .where(and(eq(roles.code, "bdp"), eq(users.status, status), isNull(users.deletedAt)));
    const [[active], [frozen], [newLeads], [outreachWeek], [deals], [pending], [ptsWeek]] =
      await Promise.all([
        bdp("active"),
        bdp("frozen"),
        this.db.select({ n: count() }).from(leads).where(gte(leads.createdAt, dayStart)),
        this.db.select({ n: count() }).from(crmEntries).where(gte(crmEntries.createdAt, weekAgo)),
        this.db
          .select({ n: count(), rev: sql<string>`coalesce(sum(${dealCompensation.dealValue}),0)` })
          .from(dealCompensation)
          .where(gte(dealCompensation.closedAt, monthStart)),
        this.db
          .select({ n: sql<string>`coalesce(sum(${dealCompensation.finalPayout}),0)` })
          .from(dealCompensation)
          .where(eq(dealCompensation.paymentStatus, "pending")),
        this.db
          .select({ n: sql<string>`coalesce(sum(${pointsVault.points}),0)` })
          .from(pointsVault)
          .where(gte(pointsVault.earnedAt, weekAgo)),
      ]);

    // alerts
    const alerts: Dashboard["alerts"] = [];
    const [stale] = await this.db
      .select({ n: count() })
      .from(pointsVault)
      .where(
        and(
          eq(pointsVault.status, "pending_verification"),
          lt(pointsVault.earnedAt, new Date(now.getTime() - 2 * DAY)),
        ),
      );
    if (Number(stale?.n) > 0)
      alerts.push({
        level: "urgent",
        text: `${stale?.n} point entries have waited over 48 hours for verification`,
        link: "/points/admin",
      });
    const [payDue] = await this.db
      .select({ n: count() })
      .from(dealCompensation)
      .where(eq(dealCompensation.paymentStatus, "pending"));
    if (Number(payDue?.n) > 0)
      alerts.push({
        level: "warn",
        text: `${payDue?.n} commission payment(s) are pending`,
        link: "/compensation/admin",
      });
    const [bon] = await this.db
      .select({ n: count() })
      .from(performanceBonuses)
      .where(inArray(performanceBonuses.status, ["pending_review", "authorized", "liquidated"]));
    if (Number(bon?.n) > 0)
      alerts.push({
        level: "warn",
        text: `${bon?.n} performance bonus(es) need action`,
        link: "/rewards/bonus",
      });
    const [eq2] = await this.db
      .select({ n: count() })
      .from(equityPayouts)
      .where(eq(equityPayouts.status, "pending"));
    if (Number(eq2?.n) > 0)
      alerts.push({
        level: "info",
        text: `${eq2?.n} equity payout(s) are pending`,
        link: "/rewards/equity",
      });
    const [idleN] = await this.db
      .select({ n: count() })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(
        and(
          eq(roles.code, "bdp"),
          eq(users.status, "active"),
          isNull(users.deletedAt),
          or(
            isNull(users.lastLoginAt),
            lt(users.lastLoginAt, new Date(now.getTime() - idle * DAY)),
          ),
        ),
      );
    if (Number(idleN?.n) > 0)
      alerts.push({
        level: "warn",
        text: `${idleN?.n} active BDP(s) have not logged in for ${idle}+ days`,
        link: "/users",
      });
    if (Number(frozen?.n) > 0)
      alerts.push({
        level: "info",
        text: `${frozen?.n} BDP account(s) are frozen`,
        link: "/users",
      });

    // top performers (30 days)
    const topRows = await this.db
      .select({
        u: dealCompensation.userId,
        name: userProfiles.fullName,
        rev: sql<string>`coalesce(sum(${dealCompensation.dealValue}),0)`,
      })
      .from(dealCompensation)
      .leftJoin(users, eq(users.id, dealCompensation.userId))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(gte(dealCompensation.closedAt, thirty))
      .groupBy(dealCompensation.userId, userProfiles.fullName)
      .orderBy(desc(sql`sum(${dealCompensation.dealValue})`));
    const ptsRows = topRows.length
      ? await this.db
          .select({ u: pointsVault.userId, p: sql<string>`coalesce(sum(${pointsVault.points}),0)` })
          .from(pointsVault)
          .where(
            and(
              inArray(
                pointsVault.userId,
                topRows.map((t) => t.u),
              ),
              gte(pointsVault.earnedAt, thirty),
            ),
          )
          .groupBy(pointsVault.userId)
      : [];
    const top = topRows
      .map((t) => ({
        name: t.name,
        revenue: r2(Number(t.rev)),
        points: r2(Number(ptsRows.find((p) => p.u === t.u)?.p ?? 0)),
      }))
      .sort((a, b) => b.revenue - a.revenue || b.points - a.points)
      .slice(0, 5);

    // feed
    const logs = await this.db
      .select({
        at: auditLogs.occurredAt,
        actor: userProfiles.fullName,
        action: auditLogs.action,
        targetType: auditLogs.targetType,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .orderBy(desc(auditLogs.occurredAt))
      .limit(15);
    const feed = logs.map((l) => ({
      at: l.at.toISOString(),
      actor: l.actor,
      action: l.action,
      target: l.targetType ?? null,
    }));

    // 30-day series (stored UTC, grouped on the EAT date)
    const d = (col: unknown) => sql<string>`date(${col} + interval 3 hour)`;
    const so = await this.db
      .select({ day: d(crmEntries.createdAt), n: count() })
      .from(crmEntries)
      .where(gte(crmEntries.createdAt, thirty))
      .groupBy(d(crmEntries.createdAt));
    const sr = await this.db
      .select({
        day: d(dealCompensation.closedAt),
        rev: sql<string>`coalesce(sum(${dealCompensation.dealValue}),0)`,
      })
      .from(dealCompensation)
      .where(gte(dealCompensation.closedAt, thirty))
      .groupBy(d(dealCompensation.closedAt));
    const series = Array.from({ length: 30 }, (_, i) => {
      const day = eatDay(new Date(thirty.getTime() + i * DAY));
      return {
        day,
        outreach: Number(so.find((x) => String(x.day).slice(0, 10) === day)?.n ?? 0),
        revenue: r2(Number(sr.find((x) => String(x.day).slice(0, 10) === day)?.rev ?? 0)),
      };
    });

    return {
      tiles: {
        activeBdps: Number(active?.n),
        frozenBdps: Number(frozen?.n),
        newLeadsToday: Number(newLeads?.n),
        outreachWeek: Number(outreachWeek?.n),
        dealsMonth: Number(deals?.n),
        revenueMonth: r2(Number(deals?.rev)),
        commissionPending: r2(Number(pending?.n)),
        pointsWeek: r2(Number(ptsWeek?.n)),
      },
      alerts,
      top,
      feed,
      series,
    };
  }
}
