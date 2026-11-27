import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  and,
  count,
  crmEntries,
  dealCompensation,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  leads,
  lt,
  pointsVault,
  roles,
  sql,
  userProfiles,
  users,
  weeklyReports,
} from "@cyneform/db";
import type {
  AdminReport,
  AdminReportQuery,
  CurrentReport,
  ReportItem,
  SubmissionItem,
  SubmitReportInput,
  WeekStats,
} from "@cyneform/types";
import { eatRange, eatWeekStart, reportDeadline, weekEndDate } from "@cyneform/validators";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthUser } from "../access/auth-user";
import type { AuditService } from "../audit/audit.service";
import type { ClientInfo } from "../common/client-info";
import { badRequest, forbidden, notFound } from "../common/errors";
import { DB, type Db } from "../database/database.module";
import type { MailService } from "../mail/mail.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PointsService } from "../points/points.service";
import { barChart, heading, para, renderPdf, table, title } from "./pdf";

type Row = typeof weeklyReports.$inferSelect;
const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => r2(Number(v ?? 0));
const kes = (n: number) => `${n.toLocaleString("en-KE", { maximumFractionDigits: 2 })} KES`;

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly points: PointsService,
  ) {}

  // ---------- stats ----------
  async weekStats(userId: string, weekStart: string): Promise<WeekStats> {
    const weekEnd = weekEndDate(weekStart);
    const { start, end } = eatRange(weekStart, weekEnd);
    const [out] = await this.db
      .select({ n: count() })
      .from(crmEntries)
      .where(
        and(
          eq(crmEntries.userId, userId),
          gte(crmEntries.createdAt, start),
          lt(crmEntries.createdAt, end),
        ),
      );
    const [d] = await this.db
      .select({
        n: count(),
        rev: sql<string>`coalesce(sum(${dealCompensation.dealValue}),0)`,
        com: sql<string>`coalesce(sum(${dealCompensation.finalPayout}),0)`,
      })
      .from(dealCompensation)
      .where(
        and(
          eq(dealCompensation.userId, userId),
          gte(dealCompensation.closedAt, start),
          lt(dealCompensation.closedAt, end),
        ),
      );
    const byRule = await this.db
      .select({ rule: pointsVault.ruleKey, p: sql<string>`coalesce(sum(${pointsVault.points}),0)` })
      .from(pointsVault)
      .where(
        and(
          eq(pointsVault.userId, userId),
          gte(pointsVault.earnedAt, start),
          lt(pointsVault.earnedAt, end),
        ),
      )
      .groupBy(pointsVault.ruleKey);
    const statuses = await this.db
      .select({ status: crmEntries.currentStatus, n: count() })
      .from(crmEntries)
      .where(and(eq(crmEntries.userId, userId), lt(crmEntries.createdAt, end)))
      .groupBy(crmEntries.currentStatus);
    const [pipe] = await this.db
      .select({ v: sql<string>`coalesce(sum(${crmEntries.estimatedValue}),0)` })
      .from(crmEntries)
      .where(
        and(eq(crmEntries.userId, userId), isNull(crmEntries.wonAt), isNull(crmEntries.lostAt)),
      );
    const entries = await this.db
      .select({
        title: leads.title,
        status: crmEntries.currentStatus,
        v: crmEntries.estimatedValue,
      })
      .from(crmEntries)
      .innerJoin(leads, eq(leads.id, crmEntries.leadId))
      .where(
        and(
          eq(crmEntries.userId, userId),
          gte(crmEntries.createdAt, start),
          lt(crmEntries.createdAt, end),
        ),
      )
      .orderBy(desc(crmEntries.createdAt))
      .limit(25);
    const pointsByRule = byRule.map((r) => ({ rule: r.rule, points: num(r.p) }));
    return {
      weekStart,
      weekEnd,
      outreach: Number(out?.n ?? 0),
      deals: Number(d?.n ?? 0),
      revenue: num(d?.rev),
      commission: num(d?.com),
      pipelineValue: num(pipe?.v),
      pointsEarned: r2(pointsByRule.reduce((s, r) => s + r.points, 0)),
      pointsByRule,
      statusCounts: statuses.map((s) => ({ status: s.status, count: Number(s.n) })),
      entries: entries.map((e) => ({
        title: e.title,
        status: e.status,
        estimatedValue: e.v ?? null,
      })),
    };
  }

  private toItem(r: Row): ReportItem {
    return {
      id: r.id,
      weekStart: r.weekStart,
      onTime: r.onTime === 1,
      submittedAt: r.submittedAt.toISOString(),
      challenges: r.challenges,
      recommendations: r.recommendations,
      feedback: r.feedback,
      setbacks: r.setbacks,
      nextWeekCalls: r.nextWeekCalls,
    };
  }

  async current(actor: AuthUser): Promise<CurrentReport> {
    const weekStart = eatWeekStart(new Date());
    const [r] = await this.db
      .select()
      .from(weeklyReports)
      .where(and(eq(weeklyReports.userId, actor.id), eq(weeklyReports.weekStart, weekStart)))
      .limit(1);
    const prev = eatWeekStart(new Date(Date.now() - 7 * DAY));
    const [pr] = await this.db
      .select({ id: weeklyReports.id })
      .from(weeklyReports)
      .where(and(eq(weeklyReports.userId, actor.id), eq(weeklyReports.weekStart, prev)))
      .limit(1);
    return {
      weekStart,
      deadline: reportDeadline(weekStart).toISOString(),
      stats: await this.weekStats(actor.id, weekStart),
      report: r ? this.toItem(r) : null,
      canSubmitPrevious: !pr,
    };
  }

  async previousStats(actor: AuthUser) {
    const prev = eatWeekStart(new Date(Date.now() - 7 * DAY));
    return this.weekStats(actor.id, prev);
  }

  async mine(actor: AuthUser): Promise<ReportItem[]> {
    const rows = await this.db
      .select()
      .from(weeklyReports)
      .where(eq(weeklyReports.userId, actor.id))
      .orderBy(desc(weeklyReports.weekStart))
      .limit(26);
    return rows.map((r) => this.toItem(r));
  }

  // ---------- submit ----------
  async submit(input: SubmitReportInput, actor: AuthUser, client?: ClientInfo) {
    const thisWeek = eatWeekStart(new Date());
    const lastWeek = eatWeekStart(new Date(Date.now() - 7 * DAY));
    if (input.weekStart !== thisWeek && input.weekStart !== lastWeek)
      throw badRequest("BAD_WEEK", "You can submit this week's report or last week's.");
    const stats = await this.weekStats(actor.id, input.weekStart);
    const onTime = Date.now() <= reportDeadline(input.weekStart).getTime();
    const id = crypto.randomUUID();
    try {
      await this.db.insert(weeklyReports).values({
        id,
        userId: actor.id,
        weekStart: input.weekStart,
        challenges: input.challenges,
        recommendations: input.recommendations,
        feedback: input.feedback,
        setbacks: input.setbacks,
        nextWeekCalls: input.nextWeekCalls,
        snapshot: JSON.stringify(stats),
        onTime: onTime ? 1 : 0,
      });
    } catch (error) {
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
        throw badRequest(
          "ALREADY_SUBMITTED",
          "You have already submitted the report for that week.",
        );
      }
      throw error;
    }
    const [me] = await this.db
      .select({ name: userProfiles.fullName, email: users.businessEmail })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, actor.id))
      .limit(1);
    const pdf = await this.buildWeeklyPdf(me?.name ?? "BDP", stats, input, onTime);
    await this.save(id, pdf);

    if (onTime)
      await this.points.award({
        userId: actor.id,
        ruleKey: "weekly_report",
        note: `Week of ${input.weekStart}`,
      });
    const subject = `Weekly report: ${me?.name ?? "BDP"}, week of ${input.weekStart}`;
    const attachments = [{ filename: `weekly-report-${input.weekStart}.pdf`, content: pdf }];
    const body = `${me?.name ?? "A BDP"} submitted the weekly report for the week of ${input.weekStart}${onTime ? "" : " (late)"}.\nOutreach: ${stats.outreach}. Deals: ${stats.deals}. Revenue: ${kes(stats.revenue)}. Points: ${stats.pointsEarned}.\nThe full report is attached.`;
    for (const e of await this.adminEmails(["super_admin"]))
      await this.mail.send(e, subject, body, { attachments });
    if (me?.email)
      await this.mail.send(
        me.email,
        `Your weekly report (copy): week of ${input.weekStart}`,
        `Thank you. Your report was submitted and is attached for your records.`,
        { attachments },
      );
    await this.notifications.notifyRoles(["admin", "super_admin"], {
      type: "report.submitted",
      title: `${me?.name ?? "A BDP"} submitted a weekly report`,
      body: `Week of ${input.weekStart}${onTime ? "" : " (late)"}`,
      link: "/reports/admin",
    });
    await this.audit.record({
      actor,
      action: "report.submitted",
      targetType: "weekly_report",
      targetId: id,
      details: { weekStart: input.weekStart, onTime },
      client,
    });
    return { id, onTime };
  }

  private async adminEmails(codes: ("admin" | "super_admin" | "bdp")[]) {
    const rows = await this.db
      .select({ email: users.businessEmail })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(and(inArray(roles.code, codes), eq(users.status, "active"), isNull(users.deletedAt)));
    return rows.flatMap((r) => (r.email ? [r.email] : []));
  }

  // ---------- PDFs ----------
  private dir = () => path.resolve(process.env.UPLOAD_DIR ?? "./uploads", "reports");
  private async save(id: string, pdf: Buffer) {
    await mkdir(this.dir(), { recursive: true });
    await writeFile(path.join(this.dir(), `${id}.pdf`), pdf);
  }

  private buildWeeklyPdf(
    name: string,
    s: WeekStats,
    t: Pick<
      SubmitReportInput,
      "challenges" | "recommendations" | "feedback" | "setbacks" | "nextWeekCalls"
    >,
    onTime: boolean,
  ) {
    return renderPdf((doc) => {
      title(
        doc,
        "Weekly BDP report",
        `${name} · ${s.weekStart} to ${s.weekEnd}${onTime ? "" : " · submitted late"}`,
      );
      heading(doc, "Summary");
      table(
        doc,
        [
          { key: "k", label: "Measure", width: 260 },
          { key: "v", label: "Value", width: 200, align: "right" },
        ],
        [
          { k: "Outreach sent", v: s.outreach },
          { k: "Deals closed", v: s.deals },
          { k: "Revenue closed", v: kes(s.revenue) },
          { k: "Commission paid out", v: kes(s.commission) },
          { k: "Pipeline value (open entries)", v: kes(s.pipelineValue) },
          { k: "Points earned", v: s.pointsEarned },
        ],
      );
      heading(doc, "Charts");
      barChart(
        doc,
        s.statusCounts.map((c) => ({ label: c.status.slice(0, 8), value: c.count })),
        { title: "CRM entries by status" },
      );
      barChart(
        doc,
        s.pointsByRule.map((p) => ({ label: p.rule.slice(0, 8), value: p.points })),
        { title: "Points by rule" },
      );
      heading(doc, "CRM activity this week");
      table(
        doc,
        [
          { key: "t", label: "Lead", width: 280 },
          { key: "s", label: "Status", width: 100 },
          { key: "v", label: "Est. value", width: 100, align: "right" },
        ],
        s.entries.map((e) => ({
          t: e.title,
          s: e.status,
          v: e.estimatedValue === null ? "" : kes(e.estimatedValue),
        })),
      );
      heading(doc, "Points breakdown");
      table(
        doc,
        [
          { key: "r", label: "Rule", width: 300 },
          { key: "p", label: "Points", width: 100, align: "right" },
        ],
        s.pointsByRule.map((p) => ({ r: p.rule, p: p.points })),
      );
      heading(doc, "BDP notes");
      para(doc, "Challenges faced", t.challenges);
      para(doc, "Recommendations", t.recommendations);
      para(doc, "Feedback", t.feedback);
      para(doc, "Setbacks", t.setbacks);
      para(doc, "Calls planned for next week", t.nextWeekCalls);
    });
  }

  async weeklyPdf(id: string, actor: AuthUser, canViewAll: boolean): Promise<Buffer> {
    const [r] = await this.db.select().from(weeklyReports).where(eq(weeklyReports.id, id)).limit(1);
    if (!r) throw notFound("Report not found.");
    if (r.userId !== actor.id && !canViewAll) throw forbidden("You cannot open this report.");
    try {
      return await readFile(path.join(this.dir(), `${id}.pdf`));
    } catch {
      const [u] = await this.db
        .select({ n: userProfiles.fullName })
        .from(users)
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(eq(users.id, r.userId))
        .limit(1);
      const pdf = await this.buildWeeklyPdf(
        u?.n ?? "BDP",
        JSON.parse(r.snapshot) as WeekStats,
        r,
        r.onTime === 1,
      );
      await this.save(id, pdf);
      return pdf;
    }
  }

  // ---------- reminders (RPT-001) ----------
  private async unsubmitted(weekStart: string) {
    const bdps = await this.db
      .select({ id: users.id, name: userProfiles.fullName })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(roles.code, "bdp"), eq(users.status, "active"), isNull(users.deletedAt)));
    const done = await this.db
      .select({ u: weeklyReports.userId })
      .from(weeklyReports)
      .where(eq(weeklyReports.weekStart, weekStart));
    const set = new Set(done.map((d) => d.u));
    return bdps.filter((b) => !set.has(b.id));
  }

  async remind() {
    const weekStart = eatWeekStart(new Date());
    for (const b of await this.unsubmitted(weekStart)) {
      await this.notifications.notify(b.id, {
        type: "report.reminder",
        title: "Your weekly report is due",
        body: "Submit it by Saturday 11:59 PM EAT to earn the on-time points.",
        link: "/reports",
      });
    }
  }

  async overdue() {
    const weekStart = eatWeekStart(new Date());
    const list = await this.unsubmitted(weekStart);
    if (list.length === 0) return;
    await this.notifications.notifyRoles(["admin", "super_admin"], {
      type: "report.overdue",
      title: `${list.length} BDP(s) have not submitted this week's report`,
      body: list
        .map((l) => l.name)
        .join(", ")
        .slice(0, 400),
      link: "/reports/admin",
    });
  }

  async submissions(weekStart: string | undefined): Promise<SubmissionItem[]> {
    const ws = weekStart ?? eatWeekStart(new Date());
    const bdps = await this.db
      .select({ id: users.id, name: userProfiles.fullName })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(roles.code, "bdp"), eq(users.status, "active"), isNull(users.deletedAt)));
    const done = await this.db
      .select({ u: weeklyReports.userId, t: weeklyReports.onTime })
      .from(weeklyReports)
      .where(eq(weeklyReports.weekStart, ws));
    return bdps.map((b) => {
      const d = done.find((x) => x.u === b.id);
      return { userId: b.id, name: b.name, submitted: !!d, onTime: d ? d.t === 1 : null };
    });
  }

  // ---------- admin report (RPT-002) ----------
  async adminReport(q: AdminReportQuery): Promise<AdminReport> {
    const { start, end } = eatRange(q.from, q.to);
    if (end.getTime() <= start.getTime())
      throw badRequest("BAD_RANGE", "The end date must be on or after the start date.");
    const rangeEnd = new Date(`${q.to}T00:00:00Z`);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
    const maxEnd = new Date(`${q.from}T00:00:00Z`);
    maxEnd.setUTCMonth(maxEnd.getUTCMonth() + 13);
    if (rangeEnd > maxEnd) throw badRequest("TOO_LONG", "Choose a range of 13 months or less.");
    const ids = q.userIds ? q.userIds.split(",").filter(Boolean) : [];
    const bdps = await this.db
      .select({ id: users.id, name: userProfiles.fullName })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(
        and(
          eq(roles.code, "bdp"),
          isNull(users.deletedAt),
          ids.length ? inArray(users.id, ids) : undefined,
        ),
      );
    const idList = bdps.map((b) => b.id);
    if (idList.length === 0) return { from: q.from, to: q.to, rows: [] };
    const out = await this.db
      .select({ u: crmEntries.userId, n: count() })
      .from(crmEntries)
      .where(
        and(
          inArray(crmEntries.userId, idList),
          gte(crmEntries.createdAt, start),
          lt(crmEntries.createdAt, end),
        ),
      )
      .groupBy(crmEntries.userId);
    const deals = await this.db
      .select({
        u: dealCompensation.userId,
        n: count(),
        rev: sql<string>`coalesce(sum(${dealCompensation.dealValue}),0)`,
      })
      .from(dealCompensation)
      .where(
        and(
          inArray(dealCompensation.userId, idList),
          gte(dealCompensation.closedAt, start),
          lt(dealCompensation.closedAt, end),
        ),
      )
      .groupBy(dealCompensation.userId);
    const commissions = await this.db
      .select({
        u: dealCompensation.userId,
        com: sql<string>`coalesce(sum(${dealCompensation.finalPayout}),0)`,
      })
      .from(dealCompensation)
      .where(
        and(
          inArray(dealCompensation.userId, idList),
          eq(dealCompensation.paymentStatus, "paid"),
          gte(dealCompensation.paidAt, start),
          lt(dealCompensation.paidAt, end),
        ),
      )
      .groupBy(dealCompensation.userId);
    const pts = await this.db
      .select({ u: pointsVault.userId, p: sql<string>`coalesce(sum(${pointsVault.points}),0)` })
      .from(pointsVault)
      .where(
        and(
          inArray(pointsVault.userId, idList),
          gte(pointsVault.earnedAt, start),
          lt(pointsVault.earnedAt, end),
        ),
      )
      .groupBy(pointsVault.userId);
    const reps = await this.db
      .select({ u: weeklyReports.userId, n: count() })
      .from(weeklyReports)
      .where(
        and(
          inArray(weeklyReports.userId, idList),
          gte(weeklyReports.weekStart, eatWeekStart(start)),
          lt(weeklyReports.weekStart, `${q.to}~`),
        ),
      )
      .groupBy(weeklyReports.userId);
    const rows = bdps.map((b) => {
      const d = deals.find((x) => x.u === b.id);
      return {
        userId: b.id,
        name: b.name,
        outreach: Number(out.find((x) => x.u === b.id)?.n ?? 0),
        deals: Number(d?.n ?? 0),
        revenue: num(d?.rev),
        commission: num(commissions.find((x) => x.u === b.id)?.com),
        points: num(pts.find((x) => x.u === b.id)?.p),
        reports: Number(reps.find((x) => x.u === b.id)?.n ?? 0),
      };
    });
    rows.sort((a, b) => b.revenue - a.revenue || b.points - a.points);
    return { from: q.from, to: q.to, rows };
  }

  async adminPdf(q: AdminReportQuery) {
    const r = await this.adminReport(q);
    return renderPdf((doc) => {
      title(doc, "Performance report", `${r.from} to ${r.to} · ${r.rows.length} BDP(s)`);
      heading(doc, "Rankings");
      table(
        doc,
        [
          { key: "rank", label: "#", width: 24 },
          { key: "name", label: "BDP", width: 140 },
          { key: "outreach", label: "Outreach", width: 55, align: "right" },
          { key: "deals", label: "Deals", width: 42, align: "right" },
          { key: "revenue", label: "Revenue", width: 85, align: "right" },
          { key: "commission", label: "Commission", width: 85, align: "right" },
          { key: "points", label: "Points", width: 50, align: "right" },
          { key: "reports", label: "Reports", width: 45, align: "right" },
        ],
        r.rows.map((x, i) => ({
          ...x,
          rank: i + 1,
          revenue: kes(x.revenue),
          commission: kes(x.commission),
        })),
      );
      barChart(
        doc,
        r.rows.slice(0, 10).map((x) => ({
          label: (x.name ?? "").split(" ")[0]?.slice(0, 7) ?? "",
          value: x.revenue,
        })),
        { title: "Revenue, top 10" },
      );
      barChart(
        doc,
        r.rows.slice(0, 10).map((x) => ({
          label: (x.name ?? "").split(" ")[0]?.slice(0, 7) ?? "",
          value: x.points,
        })),
        { title: "Points, top 10" },
      );
    });
  }

  async emailAdminPdf(q: AdminReportQuery, actor: AuthUser, client?: ClientInfo) {
    const pdf = await this.adminPdf(q);
    const [me] = await this.db
      .select({ email: users.businessEmail })
      .from(users)
      .where(eq(users.id, actor.id))
      .limit(1);
    if (!me?.email) throw badRequest("NO_EMAIL", "Your account has no email address.");
    await this.mail.send(
      me.email,
      `Performance report ${q.from} to ${q.to}`,
      "The report you requested is attached.",
      { attachments: [{ filename: `report-${q.from}-${q.to}.pdf`, content: pdf }] },
    );
    await this.audit.record({
      actor,
      action: "report.emailed",
      targetType: "report",
      targetId: `${q.from}:${q.to}`,
      details: {},
      client,
    });
  }
}
