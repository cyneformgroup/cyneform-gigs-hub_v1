import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  meetingAttendees,
  meetings,
  roles,
  userProfiles,
  users,
} from "@cyneform/db";
import { createQueue, type EventJob, QUEUES } from "@cyneform/queue";
import type { CreateMeetingInput, MeetingItem } from "@cyneform/types";
import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { AuthUser } from "../access/auth-user";
import { AuditService } from "../audit/audit.service";
import type { ClientInfo } from "../common/client-info";
import { storedEmail } from "../common/crypto";
import { badRequest, forbidden, notFound } from "../common/errors";
import { env } from "../config/env";
import { DB, type Db } from "../database/database.module";
import { MailService } from "../mail/mail.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PointsService } from "../points/points.service";

@Injectable()
export class CalendarService implements OnModuleDestroy {
  private readonly events = createQueue<EventJob>(QUEUES.events, env.REDIS_URL);
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(PointsService) private readonly points: PointsService,
  ) {}
  onModuleDestroy() {
    return this.events.close();
  }
  private reminderId(id: string) {
    return `calendar-reminder-${id}`;
  }
  private async recipients(ids: string[]) {
    if (!ids.length) return [];
    return this.db
      .select({
        id: users.id,
        name: userProfiles.fullName,
        email: users.businessEmail,
        emailCt: users.businessEmailCt,
      })
      .from(users)
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(
        and(
          inArray(users.id, ids),
          eq(roles.code, "bdp"),
          eq(users.status, "active"),
          isNull(users.deletedAt),
        ),
      );
  }
  private addCalendar(date: Date, recurrence: string, n: number) {
    const d = new Date(date);
    if (recurrence === "daily") d.setUTCDate(d.getUTCDate() + n);
    if (recurrence === "weekly") d.setUTCDate(d.getUTCDate() + 7 * n);
    if (recurrence === "monthly") {
      const day = d.getUTCDate();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + n);
      const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      d.setUTCDate(Math.min(day, lastDay));
    }
    return d;
  }
  private async scheduleReminder(meetingId: string, startsAt: Date, minutes: number) {
    await this.events.add(
      "calendar.reminder",
      { type: "calendar.reminder", meetingId },
      {
        jobId: this.reminderId(meetingId),
        delay: Math.max(0, startsAt.getTime() - minutes * 60_000 - Date.now()),
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    );
  }
  async create(input: CreateMeetingInput, actor: AuthUser, client?: ClientInfo) {
    const starts = new Date(input.startsAt);
    if (!Number.isFinite(starts.getTime()) || starts.getTime() <= Date.now())
      throw badRequest("PAST_MEETING", "Choose a meeting time in the future.");
    const selected = input.allBdps
      ? await this.db
          .select({ id: users.id })
          .from(users)
          .innerJoin(roles, eq(roles.id, users.roleId))
          .where(and(eq(roles.code, "bdp"), eq(users.status, "active"), isNull(users.deletedAt)))
      : await this.recipients(input.attendeeIds);
    if (!input.allBdps && selected.length !== new Set(input.attendeeIds).size)
      throw badRequest("INVALID_ATTENDEES", "Choose active BDP accounts only.");
    const ids = selected.map((p) => p.id);
    const count = input.recurrence === "none" ? 1 : (input.occurrences ?? 0);
    const seriesId = count > 1 ? randomUUID() : null;
    const created: { id: string; starts: Date; link: string }[] = [];
    for (let i = 0; i < count; i++) {
      const at = this.addCalendar(starts, input.recurrence, i);
      const id = randomUUID();
      const link = input.link || `https://meet.jit.si/cyneform-${randomUUID().slice(0, 12)}`;
      await this.db.transaction(async (tx) => {
        await tx.insert(meetings).values({
          id,
          seriesId,
          title: input.title,
          description: input.description ?? null,
          startsAt: at,
          durationMin: input.durationMin,
          agenda: input.agenda ?? null,
          link,
          reminderMinutes: input.reminderMinutes,
          recurrence: input.recurrence,
          createdBy: actor.id,
        });
        if (ids.length)
          await tx
            .insert(meetingAttendees)
            .values(ids.map((userId) => ({ meetingId: id, userId })));
      });
      created.push({ id, starts: at, link });
      await this.scheduleReminder(id, at, input.reminderMinutes);
    }
    const people = await this.recipients(ids);
    const first = created[0];
    if (!first) throw badRequest("NO_MEETINGS", "No meeting occurrences were created.");
    const formatted = first.starts.toLocaleString("en-KE", {
      timeZone: "Africa/Nairobi",
      dateStyle: "medium",
      timeStyle: "short",
    });
    for (const p of people) {
      await this.notifications.notify(p.id, {
        type: "calendar.invite",
        title: `Meeting: ${input.title}`,
        body: `${formatted} EAT · ${input.durationMin} min${count > 1 ? ` · repeats ${input.recurrence} (${count} meetings)` : ""}`,
        link: "/calendar",
      });
      const email = storedEmail(p.email, p.emailCt);
      if (email)
        await this.mail.send(
          email,
          `Meeting invitation: ${input.title}`,
          `You are invited to ${input.title}.\nWhen: ${formatted} EAT\nDuration: ${input.durationMin} minutes\n${count > 1 ? `This meeting repeats ${input.recurrence}, for ${count} meetings.\n` : ""}Join: ${first.link}${input.agenda ? `\nAgenda: ${input.agenda}` : ""}`,
        );
    }
    await this.audit.record({
      actor,
      action: "calendar.created",
      targetType: "meeting",
      targetId: first.id,
      details: { count, seriesId, attendeeCount: ids.length },
      client,
    });
    return { count, seriesId };
  }
  async list(actor: AuthUser, from?: string, to?: string): Promise<MeetingItem[]> {
    const manage = actor.permissions.has("calendar.manage");
    const now = new Date();
    const conditions = [
      gte(meetings.startsAt, from ? new Date(from) : now),
      lte(meetings.startsAt, to ? new Date(to) : new Date(now.getTime() + 60 * 86_400_000)),
    ];
    const rows = await this.db
      .select({
        meeting: meetings,
        attendeeId: meetingAttendees.userId,
        status: meetingAttendees.status,
        name: userProfiles.fullName,
      })
      .from(meetings)
      .leftJoin(meetingAttendees, eq(meetingAttendees.meetingId, meetings.id))
      .leftJoin(userProfiles, eq(userProfiles.userId, meetingAttendees.userId))
      .where(and(...conditions))
      .orderBy(asc(meetings.startsAt));
    const map = new Map<string, MeetingItem>();
    for (const row of rows) {
      const m = row.meeting;
      let item = map.get(m.id);
      if (!item) {
        item = {
          id: m.id,
          seriesId: m.seriesId,
          title: m.title,
          description: m.description,
          startsAt: m.startsAt.toISOString(),
          durationMin: m.durationMin,
          agenda: m.agenda,
          link: m.link,
          recurrence: m.recurrence as MeetingItem["recurrence"],
          cancelled: !!m.cancelledAt,
          myStatus: null,
          attendees: [],
        };
        map.set(m.id, item);
      }
      if (row.attendeeId && row.status) {
        if (manage || row.attendeeId === actor.id)
          item.attendees.push({
            userId: row.attendeeId,
            name: row.name,
            status: row.status as MeetingItem["attendees"][number]["status"],
          });
        if (row.attendeeId === actor.id) item.myStatus = row.status as MeetingItem["myStatus"];
      }
    }
    return [...map.values()].filter((m) => manage || m.myStatus !== null);
  }
  async attendance(
    id: string,
    userId: string,
    attended: boolean,
    actor: AuthUser,
    client?: ClientInfo,
  ) {
    const manage = actor.permissions.has("calendar.manage");
    if (!manage && userId !== actor.id) throw forbidden();
    const [meeting] = await this.db.select().from(meetings).where(eq(meetings.id, id)).limit(1);
    if (!meeting || meeting.cancelledAt) throw notFound("Meeting not found.");
    if (!manage) {
      const now = Date.now();
      const start = meeting.startsAt.getTime();
      const end = start + meeting.durationMin * 60_000;
      if (now < start || now > end + 30 * 60_000)
        throw badRequest(
          "ATTENDANCE_WINDOW",
          "Attendance can be confirmed from the start of the meeting until 30 minutes after it ends.",
        );
      if (!attended)
        throw forbidden("BDP_ATTENDANCE", "BDPs can only confirm attendance for themselves.");
    }
    let award = false;
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(meetingAttendees)
        .where(and(eq(meetingAttendees.meetingId, id), eq(meetingAttendees.userId, userId)))
        .for("update")
        .limit(1);
      if (!row) throw notFound("Attendee not found.");
      award = attended && !row.attendanceAwarded;
      await tx
        .update(meetingAttendees)
        .set({
          status: attended ? "attended" : "absent",
          attendanceAwarded: row.attendanceAwarded || attended,
          markedBy: actor.id,
          markedAt: new Date(),
        })
        .where(eq(meetingAttendees.id, row.id));
    });
    if (award)
      await this.points.award({ userId, ruleKey: "meeting_attendance", note: meeting.title });
    await this.audit.record({
      actor,
      action: "calendar.attendance_marked",
      targetType: "meeting",
      targetId: id,
      details: { userId, attended },
      client,
    });
  }
  async cancel(id: string, actor: AuthUser, client?: ClientInfo) {
    const [m] = await this.db
      .select()
      .from(meetings)
      .where(and(eq(meetings.id, id), isNull(meetings.cancelledAt)))
      .limit(1);
    if (!m) throw notFound("Meeting not found.");
    const people = await this.db
      .select({ id: meetingAttendees.userId })
      .from(meetingAttendees)
      .where(eq(meetingAttendees.meetingId, id));
    await this.db.update(meetings).set({ cancelledAt: new Date() }).where(eq(meetings.id, id));
    const job = await this.events.getJob(this.reminderId(id));
    if (job) await job.remove();
    for (const p of people)
      await this.notifications.notify(p.id, {
        type: "calendar.cancelled",
        title: `Meeting cancelled: ${m.title}`,
        body: "This meeting has been cancelled.",
        link: "/calendar",
      });
    await this.audit.record({
      actor,
      action: "calendar.cancelled",
      targetType: "meeting",
      targetId: id,
      details: {},
      client,
    });
  }
  async remind(id: string) {
    const [m] = await this.db
      .select()
      .from(meetings)
      .where(and(eq(meetings.id, id), isNull(meetings.cancelledAt)))
      .limit(1);
    if (!m) return;
    const people = await this.db
      .select({
        id: users.id,
        name: userProfiles.fullName,
        email: users.businessEmail,
        emailCt: users.businessEmailCt,
      })
      .from(meetingAttendees)
      .innerJoin(users, eq(users.id, meetingAttendees.userId))
      .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(
        and(
          eq(meetingAttendees.meetingId, id),
          eq(meetingAttendees.status, "pending"),
          eq(users.status, "active"),
        ),
      );
    const formatted = m.startsAt.toLocaleString("en-KE", {
      timeZone: "Africa/Nairobi",
      dateStyle: "medium",
      timeStyle: "short",
    });
    for (const p of people) {
      await this.notifications.notify(p.id, {
        type: "calendar.reminder",
        title: `Reminder: ${m.title} starts soon`,
        body: `${formatted} EAT`,
        link: "/calendar",
      });
      const email = storedEmail(p.email, p.emailCt);
      if (email)
        await this.mail.send(
          email,
          `Reminder: ${m.title} starts soon`,
          `${m.title} starts at ${formatted} EAT.\nJoin: ${m.link}`,
        );
    }
  }
}
