import { and, count, desc, eq, gte, inArray, leaveRequests, lte, newId } from "@cyneform/db";
import type { CreateLeaveInput, DecideLeaveInput, LeaveQuery, LeaveRequest } from "@cyneform/types";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthUser } from "../access/auth-user";
import { AuditService } from "../audit/audit.service";
import type { ClientInfo } from "../common/client-info";
import { badRequest, conflict, forbidden, notFound } from "../common/errors";
import { DB, type Db } from "../database/database.module";
import { UsersService } from "../users/users.service";

const todayEAT = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }); // YYYY-MM-DD
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;

@Injectable()
export class LeaveService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async hydrate(rows: (typeof leaveRequests.$inferSelect)[]): Promise<LeaveRequest[]> {
    const names = await this.users.names(rows.flatMap((r) => [r.userId, r.decidedBy]));
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: names.get(r.userId) ?? "Unknown",
      startDate: r.startDate,
      endDate: r.endDate,
      days: daysBetween(r.startDate, r.endDate),
      reason: r.reason,
      status: r.status,
      decidedByName: r.decidedBy ? (names.get(r.decidedBy) ?? null) : null,
      decisionNote: r.decisionNote,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  private async one(id: string): Promise<LeaveRequest> {
    const [row] = await this.db
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.id, id))
      .limit(1);
    if (!row) throw notFound("Leave request not found.");
    const [request] = await this.hydrate([row]);
    if (!request) throw notFound("Leave request not found.");
    return request;
  }

  async create(user: AuthUser, input: CreateLeaveInput, client: ClientInfo): Promise<LeaveRequest> {
    if (input.startDate < todayEAT())
      throw badRequest("PAST_DATE", "Leave cannot start in the past.");
    const [clash] = await this.db
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.userId, user.id),
          inArray(leaveRequests.status, ["pending", "approved"]),
          lte(leaveRequests.startDate, input.endDate),
          gte(leaveRequests.endDate, input.startDate),
        ),
      )
      .limit(1);
    if (clash)
      throw conflict("LEAVE_OVERLAP", "You already have leave requested for part of these dates.");

    const id = newId();
    await this.db.insert(leaveRequests).values({ id, userId: user.id, ...input });
    await this.audit.record({
      actor: user,
      action: "leave.requested",
      targetType: "leave_request",
      targetId: id,
      details: { ...input },
      client,
    });
    return this.one(id);
  }

  async mine(userId: string): Promise<LeaveRequest[]> {
    const rows = await this.db
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.userId, userId))
      .orderBy(desc(leaveRequests.createdAt));
    return this.hydrate(rows);
  }

  async list(q: LeaveQuery) {
    const where = q.status ? eq(leaveRequests.status, q.status) : undefined;
    const [rows, [{ total } = { total: 0 }]] = await Promise.all([
      this.db
        .select()
        .from(leaveRequests)
        .where(where)
        .orderBy(desc(leaveRequests.createdAt))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      this.db.select({ total: count() }).from(leaveRequests).where(where),
    ]);
    return {
      items: await this.hydrate(rows),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async decide(
    id: string,
    input: DecideLeaveInput,
    actor: AuthUser,
    client: ClientInfo,
  ): Promise<LeaveRequest> {
    const [r] = await this.db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
    if (!r) throw notFound("Leave request not found.");
    if (r.userId === actor.id)
      throw forbidden("SELF_DECISION", "You cannot decide your own leave request.");
    if (r.status !== "pending")
      throw conflict("ALREADY_DECIDED", "This request has already been decided.");

    await this.db
      .update(leaveRequests)
      .set({
        status: input.decision,
        decidedBy: actor.id,
        decidedAt: new Date(),
        decisionNote: input.note ?? null,
      })
      .where(and(eq(leaveRequests.id, id), eq(leaveRequests.status, "pending")));
    await this.audit.record({
      actor,
      action: `leave.${input.decision}`,
      targetType: "leave_request",
      targetId: id,
      details: { userId: r.userId, note: input.note },
      client,
    });
    return this.one(id);
  }

  /** Own requests only. Pending ones, or approved ones that have not started yet. */
  async cancel(id: string, user: AuthUser, client: ClientInfo): Promise<LeaveRequest> {
    const [r] = await this.db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.id, id), eq(leaveRequests.userId, user.id)))
      .limit(1);
    if (!r) throw notFound("Leave request not found.");
    const cancellable =
      r.status === "pending" || (r.status === "approved" && r.startDate > todayEAT());
    if (!cancellable) throw conflict("NOT_CANCELLABLE", "This request can no longer be cancelled.");

    await this.db
      .update(leaveRequests)
      .set({ status: "cancelled" })
      .where(eq(leaveRequests.id, id));
    await this.audit.record({
      actor: user,
      action: "leave.cancelled",
      targetType: "leave_request",
      targetId: id,
      client,
    });
    return this.one(id);
  }
}
