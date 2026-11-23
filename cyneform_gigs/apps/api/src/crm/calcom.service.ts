import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, calcomEvents, crmEntries, eq, like, notInArray } from "@cyneform/db";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { AuditService } from "../audit/audit.service";
import { AppError } from "../common/errors";
import { env } from "../config/env";
import { DB, type Db } from "../database/database.module";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PointsService } from "../points/points.service";
import type { CrmService } from "./crm.service";

type Booking = {
  uid?: string;
  startTime?: string;
  attendees?: { email?: string }[];
  metadata?: Record<string, unknown>;
};

@Injectable()
export class CalcomService {
  private readonly log = new Logger(CalcomService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly points: PointsService,
    private readonly crm: CrmService,
  ) {}

  private verify(raw: Buffer, signature: string | undefined) {
    const secret = env.CALCOM_WEBHOOK_SECRET;
    if (!secret) throw new AppError("NOT_CONFIGURED", "Webhook is not configured.", 503);
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    const got = Buffer.from(signature ?? "", "utf8");
    const want = Buffer.from(expected, "utf8");
    if (got.length !== want.length || !timingSafeEqual(got, want))
      throw new AppError("BAD_SIGNATURE", "Invalid signature.", 401);
  }

  private async findEntry(b: Booking) {
    const id = typeof b.metadata?.crmEntryId === "string" ? b.metadata.crmEntryId : null;
    if (id) {
      const [e] = await this.db.select().from(crmEntries).where(eq(crmEntries.id, id)).limit(1);
      if (e) return e;
    }
    const open = notInArray(crmEntries.currentStatus, ["won", "lost"]);
    for (const a of b.attendees ?? []) {
      if (!a.email) continue;
      const rows = await this.db
        .select()
        .from(crmEntries)
        .where(
          and(
            open,
            like(crmEntries.contacts, `%"${a.email.toLowerCase().replace(/[%_"\\]/g, "")}"%`),
          ),
        )
        .limit(2);
      if (rows.length === 1) return rows[0];
    }
    return null;
  }

  async handle(raw: Buffer, signature: string | undefined) {
    this.verify(raw, signature);
    const body = JSON.parse(raw.toString("utf8")) as { triggerEvent?: string; payload?: Booking };
    const type = String(body.triggerEvent ?? "")
      .toLowerCase()
      .replace(/_/g, ".");
    const b = body.payload ?? {};

    const hash = createHash("sha256").update(raw).digest("hex");
    const ins = await this.db
      .insert(calcomEvents)
      .ignore()
      .values({
        payloadHash: hash,
        eventType: type.slice(0, 40),
        bookingUid: b.uid?.slice(0, 100) ?? null,
      });
    await this.audit.record({
      actor: null,
      action: "webhook_received",
      targetType: "calcom",
      targetId: b.uid ?? "unknown",
      details: { event_type: type, booking_id: b.uid },
    });
    if (!ins[0].affectedRows) return; // replay

    const e = await this.findEntry(b);
    if (!e)
      return void this.log.warn(`Cal.com ${type}: no matching CRM entry for booking ${b.uid}`);
    const startsAt = b.startTime ? new Date(b.startTime) : null;
    const when = startsAt?.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });

    if (type === "booking.created") {
      const statuses = JSON.parse(e.statuses) as string[];
      await this.db
        .update(crmEntries)
        .set({
          callStatus: "booked",
          callStartsAt: startsAt,
          calBookingUid: b.uid ?? null,
          ...(statuses.includes("alignment_call_booked")
            ? {}
            : {
                statuses: JSON.stringify([...statuses, "alignment_call_booked"]),
                currentStatus: "alignment_call_booked",
              }),
        })
        .where(eq(crmEntries.id, e.id));
      await this.notifications.notify(e.userId, {
        type: "crm.call_booked",
        title: `Alignment call booked for ${e.clientName}`,
        body: when,
        link: `/crm/${e.id}`,
      });
      // Layered scheme only (no-ops while it is off): +2 for the booking, and the Quality Multiplier upgrade to 2.0.
      await this.points
        .award({ userId: e.userId, ruleKey: "call_booked", leadId: e.leadId, crmEntryId: e.id })
        .catch(() => undefined);
      await this.crm.awardQuality(e, "hook_call");
    } else if (type === "booking.rescheduled") {
      await this.db
        .update(crmEntries)
        .set({
          callStatus: "rescheduled",
          callStartsAt: startsAt,
          calBookingUid: b.uid ?? e.calBookingUid,
        })
        .where(eq(crmEntries.id, e.id));
      await this.notifications.notify(e.userId, {
        type: "crm.call_changed",
        title: `Call rescheduled for ${e.clientName}`,
        body: when,
        link: `/crm/${e.id}`,
      });
    } else if (type === "booking.cancelled") {
      await this.db
        .update(crmEntries)
        .set({ callStatus: "cancelled" })
        .where(eq(crmEntries.id, e.id));
      await this.notifications.notify(e.userId, {
        type: "crm.call_changed",
        title: `Call cancelled for ${e.clientName}`,
        link: `/crm/${e.id}`,
      });
    }
  }
}
