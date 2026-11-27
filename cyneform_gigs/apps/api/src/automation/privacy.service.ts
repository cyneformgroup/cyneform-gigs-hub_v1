import {
  and,
  crmEntries,
  dataRequests,
  dealCompensation,
  desc,
  eq,
  getNumber,
  inArray,
  leaveRequests,
  lt,
  meetingAttendees,
  notifications,
  pointsVault,
  trainingViews,
  userProfiles,
  users,
  weeklyReports,
} from "@cyneform/db";
import type {
  CreateDataRequestInput,
  DataRequestItem,
  DataRequestQuery,
  ResolveDataRequestInput,
} from "@cyneform/types";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthUser } from "../access/auth-user";
import { AuditService } from "../audit/audit.service";
import type { ClientInfo } from "../common/client-info";
import { decrypt, storedEmail } from "../common/crypto";
import { badRequest, conflict, notFound } from "../common/errors";
import { DB, type Db } from "../database/database.module";
import { NotificationsService } from "../notifications/notifications.service";
import { LifecycleService } from "./lifecycle.service";

const DAY = 86_400_000;
const decryptOptional = (value: Buffer | null | undefined) => {
  try {
    return value ? decrypt(value) : null;
  } catch {
    return null;
  }
};

@Injectable()
export class PrivacyService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(LifecycleService) private readonly lifecycle: LifecycleService,
  ) {}

  /** Includes only the signed-in user's records and excludes credentials and session tokens. */
  async exportMine(actor: AuthUser, client?: ClientInfo) {
    const hour = new Date().toISOString().slice(0, 13);
    if (!(await this.lifecycle.noticeOnce(actor.id, "data_export", hour)))
      throw conflict(
        "EXPORT_LIMIT",
        "You can download your data once an hour. Please try again later.",
      );

    const [account] = await this.db
      .select({
        id: users.id,
        businessEmail: users.businessEmail,
        legacyBusinessEmail: users.businessEmailCt,
        status: users.status,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(eq(users.id, actor.id))
      .limit(1);
    const [profile] = await this.db
      .select({
        fullName: userProfiles.fullName,
        contractorNumber: userProfiles.contractorNumber,
        personalEmail: userProfiles.personalEmail,
        legacyPersonalEmail: userProfiles.personalEmailCt,
        phone: userProfiles.phoneCt,
        idNumber: userProfiles.idNumberCt,
        location: userProfiles.location,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, actor.id))
      .limit(1);

    const [points, crm, deals, reports, training, attendance, leave, notes, requests] =
      await Promise.all([
        this.db.select().from(pointsVault).where(eq(pointsVault.userId, actor.id)),
        this.db.select().from(crmEntries).where(eq(crmEntries.userId, actor.id)),
        this.db.select().from(dealCompensation).where(eq(dealCompensation.userId, actor.id)),
        this.db.select().from(weeklyReports).where(eq(weeklyReports.userId, actor.id)),
        this.db.select().from(trainingViews).where(eq(trainingViews.userId, actor.id)),
        this.db.select().from(meetingAttendees).where(eq(meetingAttendees.userId, actor.id)),
        this.db.select().from(leaveRequests).where(eq(leaveRequests.userId, actor.id)),
        this.db
          .select()
          .from(notifications)
          .where(eq(notifications.userId, actor.id))
          .orderBy(desc(notifications.createdAt)),
        this.db.select().from(dataRequests).where(eq(dataRequests.userId, actor.id)),
      ]);

    await this.audit.record({
      actor,
      action: "privacy.export",
      targetType: "user",
      targetId: actor.id,
      details: {},
      client,
    });
    return {
      generatedAt: new Date().toISOString(),
      account: account
        ? {
            id: account.id,
            businessEmail: storedEmail(account.businessEmail, account.legacyBusinessEmail),
            status: account.status,
            createdAt: account.createdAt.toISOString(),
            lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
          }
        : null,
      profile: profile
        ? {
            fullName: profile.fullName,
            contractorNumber: profile.contractorNumber,
            personalEmail: storedEmail(profile.personalEmail, profile.legacyPersonalEmail),
            phone: decryptOptional(profile.phone),
            idNumber: decryptOptional(profile.idNumber),
            location: profile.location,
          }
        : null,
      points,
      crmEntries: crm,
      deals,
      weeklyReports: reports,
      trainingViews: training,
      meetingAttendance: attendance,
      leaveRequests: leave,
      notifications: notes,
      dataRequests: requests,
    };
  }

  private toItem(row: typeof dataRequests.$inferSelect, ownerName: string | null): DataRequestItem {
    const open = row.status === "open" || row.status === "in_progress";
    return {
      id: row.id,
      userId: row.userId,
      ownerName,
      type: row.type as DataRequestItem["type"],
      details: row.details,
      status: row.status as DataRequestItem["status"],
      dueAt: row.dueAt.toISOString(),
      overdue: open && row.dueAt.getTime() < Date.now(),
      response: row.response,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async create(input: CreateDataRequestInput, actor: AuthUser, client?: ClientInfo) {
    const [open] = await this.db
      .select({ id: dataRequests.id })
      .from(dataRequests)
      .where(
        and(
          eq(dataRequests.userId, actor.id),
          eq(dataRequests.type, input.type),
          inArray(dataRequests.status, ["open", "in_progress"]),
        ),
      )
      .limit(1);
    if (open) throw conflict("REQUEST_OPEN", "You already have an open request of this type.");

    const days = await getNumber("privacy.response_days");
    const id = crypto.randomUUID();
    await this.db.insert(dataRequests).values({
      id,
      userId: actor.id,
      type: input.type,
      details: input.details,
      dueAt: new Date(Date.now() + days * DAY),
    });
    const [person] = await this.db
      .select({ name: userProfiles.fullName })
      .from(userProfiles)
      .where(eq(userProfiles.userId, actor.id))
      .limit(1);
    await this.notifications.notifyRoles(
      ["admin", "super_admin"],
      {
        type: "privacy.request",
        title: `Data request (${input.type}) from ${person?.name ?? "a user"}`,
        body: `Respond within ${days} days.`,
        link: "/privacy/requests",
      },
      actor.id,
    );
    await this.audit.record({
      actor,
      action: "privacy.request_created",
      targetType: "data_request",
      targetId: id,
      details: { type: input.type },
      client,
    });
    return { id };
  }

  async mine(actor: AuthUser): Promise<DataRequestItem[]> {
    const rows = await this.db
      .select()
      .from(dataRequests)
      .where(eq(dataRequests.userId, actor.id))
      .orderBy(desc(dataRequests.createdAt))
      .limit(50);
    return rows.map((row) => this.toItem(row, null));
  }

  async list(query: DataRequestQuery): Promise<DataRequestItem[]> {
    const rows = await this.db
      .select({ request: dataRequests, ownerName: userProfiles.fullName })
      .from(dataRequests)
      .leftJoin(userProfiles, eq(userProfiles.userId, dataRequests.userId))
      .where(query.status ? eq(dataRequests.status, query.status) : undefined)
      .orderBy(desc(dataRequests.createdAt))
      .limit(200);
    return rows.map(({ request, ownerName }) => this.toItem(request, ownerName));
  }

  async resolve(id: string, input: ResolveDataRequestInput, actor: AuthUser, client?: ClientInfo) {
    const [request] = await this.db
      .select()
      .from(dataRequests)
      .where(eq(dataRequests.id, id))
      .limit(1);
    if (!request) throw notFound("Request not found.");
    if (request.status === "completed" || request.status === "rejected")
      throw badRequest("CLOSED", "This request is already closed.");

    await this.db
      .update(dataRequests)
      .set({
        status: input.status,
        response: input.response,
        handledBy: actor.id,
        handledAt: new Date(),
      })
      .where(eq(dataRequests.id, id));
    await this.notifications.notify(request.userId, {
      type: "privacy.resolved",
      title: `Your data request was ${input.status.replace("_", " ")}`,
      body: input.response,
      link: "/privacy",
    });
    await this.audit.record({
      actor,
      action: `privacy.request_${input.status}`,
      targetType: "data_request",
      targetId: id,
      details: {},
      client,
    });
  }

  /** Remind admins daily when a request is overdue or due within two days. */
  async dueReminders() {
    const soon = new Date(Date.now() + 2 * DAY);
    const rows = await this.db
      .select()
      .from(dataRequests)
      .where(
        and(inArray(dataRequests.status, ["open", "in_progress"]), lt(dataRequests.dueAt, soon)),
      );
    const day = new Date().toISOString().slice(0, 10);
    for (const request of rows) {
      if (!(await this.lifecycle.noticeOnce(request.userId, `dsr_due_${request.id}`, day)))
        continue;
      await this.notifications.notifyRoles(["admin", "super_admin"], {
        type: "privacy.request",
        title:
          request.dueAt.getTime() < Date.now()
            ? "A data request is overdue"
            : "A data request is due soon",
        body: `Type: ${request.type}. Due ${request.dueAt.toISOString().slice(0, 10)}.`,
        link: "/privacy/requests",
      });
    }
  }
}
