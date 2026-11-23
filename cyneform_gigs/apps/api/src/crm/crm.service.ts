import {
  and,
  count,
  crmEntries,
  crmFiles,
  desc,
  eq,
  getNumberList,
  isNull,
  type leads,
  newId,
  pointsVault,
  sql,
  userProfiles,
} from "@cyneform/db";
import { createQueue, type EventJob, QUEUES } from "@cyneform/queue";
import type {
  ChangeEntryStatusInput,
  EntryDetail,
  EntryItem,
  EntryPage,
  EntryQuery,
  FlagEntryInput,
  OutreachInput,
  UpdateEntryInput,
} from "@cyneform/types";
import {
  allowedNext,
  CrmContactsSchema,
  type CrmStatus,
  detectClientType,
  extractContacts,
  mergeContacts,
  missingFields,
  PROGRESS,
} from "@cyneform/validators";
import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import type { AuthUser } from "../access/auth-user";
import type { AuditService } from "../audit/audit.service";
import type { ClientInfo } from "../common/client-info";
import { badRequest, notFound } from "../common/errors";
import { env } from "../config/env";
import { DB, type Db } from "../database/database.module";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PointsService } from "../points/points.service";
import { followupDates } from "./dates";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Entry = typeof crmEntries.$inferSelect;
const PAGE = 25;

const json = <T>(s: string | null, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};
const iso = (d: Date | null) => d?.toISOString() ?? null;

@Injectable()
export class CrmService implements OnModuleDestroy {
  private readonly log = new Logger(CrmService.name);
  private readonly events = createQueue<EventJob>(QUEUES.events, env.REDIS_URL);

  onModuleDestroy() {
    return this.events.close();
  }

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly points: PointsService,
  ) {}

  /** Called inside the outreach transaction (spec LH-002 step 10). Returns the new entry id. */
  async createFromLead(
    tx: Tx,
    lead: typeof leads.$inferSelect,
    userId: string,
    input: OutreachInput,
  ): Promise<string> {
    const now = new Date();
    const days = (await getNumberList("followups.days")) as number[];
    const [d1, d2, d3] = followupDates(now, [days[0] ?? 4, days[1] ?? 5, days[2] ?? 7]);
    const text = `${lead.title}\n${lead.description ?? ""}`;
    const contacts = mergeContacts(json<unknown>(lead.contacts, {}), extractContacts(text));
    const id = newId();
    await tx.insert(crmEntries).values({
      id,
      leadId: lead.id,
      userId,
      clientName: lead.title,
      eventDescription: lead.description,
      clientType: detectClientType(text),
      contacts: JSON.stringify(contacts),
      outreachChannels: JSON.stringify(input.channels),
      socialPlatforms: JSON.stringify(input.socialPlatforms),
      outreachNotes: input.notes ?? null,
      statuses: JSON.stringify(["1st_pitch_sent"]),
      currentStatus: "1st_pitch_sent",
      followup1Date: d1,
      followup2Date: d2,
      followup3Date: d3,
    });
    return id;
  }

  private async load(id: string, actor: AuthUser, write = false): Promise<Entry> {
    const [e] = await this.db.select().from(crmEntries).where(eq(crmEntries.id, id)).limit(1);
    if (!e) throw notFound("CRM entry not found.");
    const mine = e.userId === actor.id;
    if (write ? !mine : !mine && !actor.permissions.has("crm.view_all"))
      throw notFound("CRM entry not found.");
    return e;
  }

  private async fileCount(entryId: string, q: Pick<Db, "select"> = this.db) {
    const [r] = await q.select({ n: count() }).from(crmFiles).where(eq(crmFiles.entryId, entryId));
    return Number(r?.n ?? 0);
  }

  private async missing(e: Entry) {
    return missingFields({
      clientType: e.clientType,
      decisionMakerName: e.decisionMakerName,
      jobTitle: e.jobTitle,
      contacts: CrmContactsSchema.parse(json(e.contacts, {})),
      channels: json<string[]>(e.outreachChannels, []),
      fileCount: await this.fileCount(e.id),
    });
  }

  async list(q: EntryQuery, actor: AuthUser): Promise<EntryPage> {
    const all = actor.permissions.has("crm.view_all");
    const where = and(
      all
        ? q.userId
          ? eq(crmEntries.userId, q.userId)
          : undefined
        : eq(crmEntries.userId, actor.id),
      q.status ? eq(crmEntries.currentStatus, q.status) : undefined,
    );
    const [t] = await this.db.select({ n: count() }).from(crmEntries).where(where);
    const rows = await this.db
      .select({ e: crmEntries, owner: userProfiles.fullName })
      .from(crmEntries)
      .leftJoin(userProfiles, eq(userProfiles.userId, crmEntries.userId))
      .where(where)
      .orderBy(desc(crmEntries.createdAt))
      .limit(PAGE)
      .offset((q.page - 1) * PAGE);
    return {
      total: Number(t?.n ?? 0),
      page: q.page,
      pageSize: PAGE,
      items: rows.map(({ e, owner }) => this.item(e, owner)),
    };
  }

  private item(e: Entry, owner: string | null): EntryItem {
    return {
      id: e.id,
      leadId: e.leadId,
      clientName: e.clientName,
      clientType: e.clientType,
      currentStatus: e.currentStatus,
      isCompleted: e.isCompleted,
      ownerName: owner,
      followup1Date: iso(e.followup1Date),
      followup2Date: iso(e.followup2Date),
      followup3Date: iso(e.followup3Date),
      createdAt: e.createdAt.toISOString(),
    };
  }

  async detail(id: string, actor: AuthUser): Promise<EntryDetail> {
    const e = await this.load(id, actor);
    const [owner] = await this.db
      .select({ n: userProfiles.fullName })
      .from(userProfiles)
      .where(eq(userProfiles.userId, e.userId))
      .limit(1);
    const files = await this.db
      .select()
      .from(crmFiles)
      .where(eq(crmFiles.entryId, id))
      .orderBy(desc(crmFiles.createdAt));
    const [pts] = await this.db
      .select({ n: sql<string>`coalesce(sum(${pointsVault.points}), 0)` })
      .from(pointsVault)
      .where(
        and(
          eq(pointsVault.userId, e.userId),
          eq(pointsVault.leadId, e.leadId),
          eq(pointsVault.status, "active"),
        ),
      );
    const statuses = json<string[]>(e.statuses, []);
    return {
      ...this.item(e, owner?.n ?? null),
      description: e.eventDescription,
      decisionMakerName: e.decisionMakerName,
      jobTitle: e.jobTitle,
      contacts: CrmContactsSchema.parse(json(e.contacts, {})),
      channels: json(e.outreachChannels, []),
      socialPlatforms: json(e.socialPlatforms, []),
      outreachNotes: e.outreachNotes,
      statuses,
      allowedNext: allowedNext(statuses),
      missing: await this.missing(e),
      files: files.map((f) => ({
        id: f.id,
        name: f.originalName,
        mime: f.mime,
        size: f.size,
        createdAt: f.createdAt.toISOString(),
      })),
      pointsEarned: Number(pts?.n ?? 0),
      completedAt: iso(e.completedAt),
      callStatus: e.callStatus,
      callStartsAt: iso(e.callStartsAt),
      wonAt: iso(e.wonAt),
      lostAt: iso(e.lostAt),
      mine: e.userId === actor.id,
      flaggedGenericAt: iso(e.flaggedGenericAt),
      flagReason: e.flagReason,
    };
  }

  private award(e: Entry, ruleKey: string) {
    return this.points
      .award({ userId: e.userId, ruleKey, leadId: e.leadId, crmEntryId: e.id })
      .catch((err) => this.log.error(`Award ${ruleKey} failed: ${(err as Error).message}`));
  }

  /** Saves the manual fields. Decision maker and job title earn points the first time they are filled. */
  async update(
    id: string,
    input: UpdateEntryInput,
    actor: AuthUser,
    client?: ClientInfo,
  ): Promise<EntryDetail> {
    const e = await this.load(id, actor, true);
    if (e.wonAt || e.lostAt)
      throw badRequest("CLOSED", "This entry is closed and can no longer be edited.");
    const dm = input.decisionMakerName?.trim();
    const jt = input.jobTitle?.trim();
    await this.db
      .update(crmEntries)
      .set({
        ...(input.clientType ? { clientType: input.clientType } : {}),
        ...(dm !== undefined ? { decisionMakerName: dm || null } : {}),
        ...(jt !== undefined ? { jobTitle: jt || null } : {}),
        ...(input.contacts ? { contacts: JSON.stringify(input.contacts) } : {}),
        ...(input.channels ? { outreachChannels: JSON.stringify(input.channels) } : {}),
        ...(input.socialPlatforms
          ? { socialPlatforms: JSON.stringify(input.socialPlatforms) }
          : {}),
        ...(input.outreachNotes !== undefined
          ? { outreachNotes: input.outreachNotes || null }
          : {}),
      })
      .where(eq(crmEntries.id, id));
    await this.audit.record({
      actor,
      action: "crm.updated",
      targetType: "crm_entry",
      targetId: id,
      details: { fields: Object.keys(input) },
      client,
    });
    if (dm && !e.decisionMakerName) await this.award(e, "decision_maker");
    if (jt && !e.jobTitle) await this.award(e, "job_title");
    await this.evaluateCompletion(id);
    return this.detail(id, actor);
  }

  /** Spec CRM-004: when every required field is filled, mark complete and award the +10 bonus, once. */
  async evaluateCompletion(id: string) {
    const [e] = await this.db.select().from(crmEntries).where(eq(crmEntries.id, id)).limit(1);
    if (!e || e.isCompleted) return;
    if (Object.keys(await this.missing(e)).length > 0) return;
    const res = await this.db
      .update(crmEntries)
      .set({ isCompleted: true, completedAt: new Date() })
      .where(and(eq(crmEntries.id, id), eq(crmEntries.isCompleted, false)));
    if (!res[0].affectedRows) return; // another request completed it first
    await this.notifications.notify(e.userId, {
      type: "crm.completed",
      title: "CRM entry completed! +10 points awarded.",
      link: `/crm/${id}`,
    });
    await this.award(e, "entry_completed");
    await this.audit.record({
      actor: null,
      action: "crm.completed",
      targetType: "crm_entry",
      targetId: id,
    });
  }

  async changeStatus(
    id: string,
    input: ChangeEntryStatusInput,
    actor: AuthUser,
    client?: ClientInfo,
  ): Promise<EntryDetail> {
    const e = await this.load(id, actor, true);
    const statuses = json<string[]>(e.statuses, []);
    if (!allowedNext(statuses).includes(input.status))
      throw badRequest("INVALID_TRANSITION", "That status change is not allowed from here.");
    const now = new Date();
    await this.db
      .update(crmEntries)
      .set({
        statuses: JSON.stringify([...statuses, input.status]),
        currentStatus: input.status,
        ...(input.status === "won" ? { wonAt: now } : {}),
        ...(input.status === "lost" ? { lostAt: now } : {}),
      })
      .where(eq(crmEntries.id, id));
    await this.audit.record({
      actor,
      action: "crm.status_changed",
      targetType: "crm_entry",
      targetId: id,
      details: { from: e.currentStatus, to: input.status },
      client,
    });
    await this.cancelFollowups(e.id, input.status);
    await this.awardForStatus(e, input.status);
    return this.detail(id, actor);
  }

  /** Spec CRM-005, plus the layered quality upgrade for a response. Layered awards no-op when that scheme is off. */
  async awardForStatus(e: Entry, status: CrmStatus) {
    const rule: Partial<Record<CrmStatus, string>> = {
      followup_1: "followup_1",
      followup_2: "followup_2",
      followup_3: "followup_3",
      won: "deal_won",
      lost: "deal_lost",
    };
    if (rule[status]) await this.award(e, rule[status] as string);
    if (status === "responded") await this.awardQuality(e, "hook_response");
    if (status === "lost") await this.award(e, "deal_lost_closure");
  }

  private jobId = (entryId: string, n: number) => `crm-fu-${entryId}-${n}`;

  async scheduleFollowups(entryId: string) {
    const [e] = await this.db.select().from(crmEntries).where(eq(crmEntries.id, entryId)).limit(1);
    if (!e) return;
    for (const n of [1, 2, 3] as const) {
      const date = e[`followup${n}Date` as const];
      if (!date) continue;
      await this.events
        .add(
          "crm.followup",
          { type: "crm.followup", entryId, n },
          {
            jobId: this.jobId(entryId, n),
            delay: Math.max(0, date.getTime() - Date.now()),
            attempts: 3,
            backoff: { type: "exponential", delay: 10_000 },
            removeOnComplete: 500,
            removeOnFail: 500,
          },
        )
        .catch((err) =>
          this.log.error(
            `Could not schedule follow-up ${n} for ${entryId}: ${(err as Error).message}`,
          ),
        );
    }
  }

  async cancelFollowups(entryId: string, status: string) {
    const upTo =
      status === "won" || status === "lost"
        ? 3
        : status.startsWith("followup_")
          ? Number(status.slice(-1))
          : 0;
    for (let n = 1; n <= upTo; n++) {
      try {
        await (await this.events.getJob(this.jobId(entryId, n)))?.remove();
      } catch (err) {
        this.log.warn(`Could not cancel follow-up ${n} for ${entryId}: ${(err as Error).message}`);
      }
    }
  }

  async sendFollowup(entryId: string, n: 1 | 2 | 3) {
    const [e] = await this.db.select().from(crmEntries).where(eq(crmEntries.id, entryId)).limit(1);
    if (!e || e.wonAt || e.lostAt || e[`followup${n}NotifiedAt` as const]) return;
    if (
      json<string[]>(e.statuses, []).some(
        (s) => PROGRESS.indexOf(s as (typeof PROGRESS)[number]) >= n + 1,
      )
    )
      return;
    const res = await this.db
      .update(crmEntries)
      .set({ [`followup${n}NotifiedAt`]: new Date() })
      .where(
        and(eq(crmEntries.id, entryId), isNull(crmEntries[`followup${n}NotifiedAt` as const])),
      );
    if (!res[0].affectedRows) return;
    await this.notifications.notify(e.userId, {
      type: "crm.followup_due",
      title: `Follow-up ${n} is due for ${e.clientName}`,
      link: `/crm/${e.id}`,
    });
  }

  async awardQuality(e: Entry, ruleKey: string) {
    const [fresh] = await this.db
      .select({ f: crmEntries.flaggedGenericAt })
      .from(crmEntries)
      .where(eq(crmEntries.id, e.id))
      .limit(1);
    if (fresh?.f) return;
    await this.award(e, ruleKey);
  }

  async awardQualityForLead(userId: string, leadId: string, ruleKey: string) {
    const [e] = await this.db
      .select()
      .from(crmEntries)
      .where(and(eq(crmEntries.userId, userId), eq(crmEntries.leadId, leadId)))
      .limit(1);
    if (!e) {
      this.log.warn(`Skipped ${ruleKey}: no CRM entry found for lead ${leadId}`);
      return;
    }
    await this.awardQuality(e, ruleKey);
  }

  async flag(
    id: string,
    input: FlagEntryInput,
    actor: AuthUser,
    client?: ClientInfo,
  ): Promise<EntryDetail> {
    const [e] = await this.db.select().from(crmEntries).where(eq(crmEntries.id, id)).limit(1);
    if (!e) throw notFound("CRM entry not found.");
    if (e.flaggedGenericAt)
      throw badRequest("ALREADY_FLAGGED", "This outreach is already flagged.");
    await this.db
      .update(crmEntries)
      .set({ flaggedGenericAt: new Date(), flaggedBy: actor.id, flagReason: input.reason })
      .where(eq(crmEntries.id, id));
    const voided = await this.points.voidForLead(
      e.userId,
      e.leadId,
      ["hook_ghosted", "hook_response", "hook_call"],
      `Flagged as generic: ${input.reason}`,
      actor,
      client,
    );
    await this.notifications.notify(e.userId, {
      type: "crm.flagged",
      title: "Outreach flagged as duplicate/generic. 0 quality points awarded.",
      body: input.reason,
      link: `/crm/${id}`,
    });
    await this.audit.record({
      actor,
      action: "crm.flagged_generic",
      targetType: "crm_entry",
      targetId: id,
      details: { reason: input.reason, voidedPoints: voided },
      client,
    });
    return this.detail(id, actor);
  }

  /** Daily safety net: one reminder per due follow-up, idempotent with delayed jobs. */
  async remindDue() {
    const now = new Date();
    const rows = await this.db
      .select()
      .from(crmEntries)
      .where(and(isNull(crmEntries.wonAt), isNull(crmEntries.lostAt)));
    let sent = 0;
    for (const e of rows) {
      const statuses = json<string[]>(e.statuses, []);
      for (const n of [1, 2, 3] as const) {
        const date = e[`followup${n}Date` as const];
        const notified = e[`followup${n}NotifiedAt` as const];
        const passed = statuses.some(
          (s) => PROGRESS.indexOf(s as (typeof PROGRESS)[number]) >= n + 1,
        );
        if (!date || notified || date > now || passed) continue;
        await this.sendFollowup(e.id, n);
        sent++;
      }
    }
    this.log.log(`Follow-up reminders: ${sent}`);
  }
}
