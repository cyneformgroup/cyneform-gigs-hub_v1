import { and, count, eq, getNumber, gt, leadClaims, leads, lte } from "@cyneform/db";
import { createQueue, type EventJob, QUEUES } from "@cyneform/queue";
import type { ActiveClaim } from "@cyneform/types";
import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import type { AuthUser } from "../access/auth-user";
import { AuditService } from "../audit/audit.service";
import type { ClientInfo } from "../common/client-info";
import { AppError, badRequest, conflict, forbidden, notFound } from "../common/errors";
import { env } from "../config/env";
import { DB, type Db } from "../database/database.module";
import { NotificationsService } from "../notifications/notifications.service";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

@Injectable()
export class ClaimsService implements OnModuleDestroy {
  private readonly log = new Logger(ClaimsService.name);
  private readonly events = createQueue<EventJob>(QUEUES.events, env.REDIS_URL);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  onModuleDestroy() {
    return this.events.close();
  }

  private emit(e: EventJob) {
    return this.events
      .add(e.type, e, {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 500,
        removeOnFail: 500,
      })
      .catch((err) => this.log.error(`Could not emit ${e.type}: ${(err as Error).message}`));
  }

  /** SELECT ... FOR UPDATE: whoever holds this lock decides the lead's fate. */
  private async lockLead(tx: Tx, id: string) {
    const [lead] = await tx.select().from(leads).where(eq(leads.id, id)).limit(1).for("update");
    if (!lead) throw notFound("Gig not found.");
    return lead;
  }

  private async reset(tx: Tx, leadId: string) {
    await tx
      .update(leads)
      .set({ status: "new", claimedBy: null, claimedAt: null })
      .where(eq(leads.id, leadId));
    await tx.delete(leadClaims).where(eq(leadClaims.leadId, leadId));
  }

  async claim(leadId: string, actor: AuthUser, client?: ClientInfo) {
    const minutes = await getNumber("leads.claim_minutes");
    const max = await getNumber("leads.max_active_claims");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + minutes * 60_000);
    const state = { stale: null as string | null };

    try {
      await this.db.transaction(async (tx) => {
        const lead = await this.lockLead(tx, leadId);
        let status = lead.status;
        if (status === "claimed") {
          if (lead.claimedBy === actor.id)
            throw conflict("ALREADY_YOURS", "You already claimed this lead.");
          const [c] = await tx
            .select()
            .from(leadClaims)
            .where(eq(leadClaims.leadId, leadId))
            .limit(1);
          if (c && c.expiresAt <= now) {
            // The holder's time ran out before the sweep got to it: free it now.
            await tx.delete(leadClaims).where(eq(leadClaims.leadId, leadId));
            state.stale = c.userId;
            status = "new";
          }
        }
        if (status !== "new")
          throw conflict("ALREADY_CLAIMED", "Lead was claimed by another user. Please refresh.");
        if (lead.startsAt <= now)
          throw badRequest("EVENT_STARTED", "This event has already started.");

        const [mine] = await tx
          .select({ n: count() })
          .from(leadClaims)
          .where(and(eq(leadClaims.userId, actor.id), gt(leadClaims.expiresAt, now)));
        if (Number(mine?.n ?? 0) >= max) {
          throw conflict(
            "CLAIM_LIMIT",
            "You already have a claimed lead. Mark outreach sent or release it first.",
          );
        }
        await tx
          .update(leads)
          .set({ status: "claimed", claimedBy: actor.id, claimedAt: now })
          .where(eq(leads.id, leadId));
        await tx.insert(leadClaims).values({ leadId, userId: actor.id, claimedAt: now, expiresAt });
      });
    } catch (e) {
      // Spec ERR-002: both the winner and the loser are audited.
      if (e instanceof AppError) {
        await this.audit.record({
          actor,
          action: "gigs.claim_rejected",
          targetType: "gig",
          targetId: leadId,
          details: { reason: e.message },
          client,
        });
      }
      throw e;
    }

    if (state.stale) {
      await this.notifications.notify(state.stale, {
        type: "gigs.claim_expired",
        title: "Your claim expired and the lead was released",
        link: "/gigs",
      });
    }
    await this.audit.record({
      actor,
      action: "gigs.claimed",
      targetType: "gig",
      targetId: leadId,
      details: { expiresAt },
      client,
    });
    await this.notifications.notify(actor.id, {
      type: "gigs.claimed",
      title: `Lead claimed. You have ${minutes} minutes to send outreach.`,
      link: "/gigs",
    });
    void this.emit({ type: "lead.claimed", leadId, userId: actor.id });
    return { expiresAt: expiresAt.toISOString() };
  }

  /** A BDP releases their own claim; anyone with gigs.assign can release someone else's. */
  async release(leadId: string, actor: AuthUser, client?: ClientInfo) {
    const state = { holder: "" };
    await this.db.transaction(async (tx) => {
      const lead = await this.lockLead(tx, leadId);
      if (lead.status !== "claimed" || !lead.claimedBy)
        throw badRequest("NOT_CLAIMED", "This lead is not currently claimed.");
      if (lead.claimedBy !== actor.id && !actor.permissions.has("gigs.assign")) throw forbidden();
      state.holder = lead.claimedBy;
      await this.reset(tx, leadId);
    });
    await this.audit.record({
      actor,
      action: "gigs.released",
      targetType: "gig",
      targetId: leadId,
      details: { holder: state.holder },
      client,
    });
    if (state.holder !== actor.id) {
      await this.notifications.notify(state.holder, {
        type: "gigs.released",
        title: "A manager released your claim on a lead",
        link: "/gigs",
      });
    }
  }

  /** Minimal for now. Phase 7 adds channels, the CRM entry and evidence in this same transaction. */
  async markOutreachSent(leadId: string, actor: AuthUser, client?: ClientInfo) {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      const lead = await this.lockLead(tx, leadId);
      if (lead.status !== "claimed" || lead.claimedBy !== actor.id)
        throw badRequest("NOT_CLAIMABLE", "This lead is not in a claimable state.");
      const [c] = await tx.select().from(leadClaims).where(eq(leadClaims.leadId, leadId)).limit(1);
      if (!c || c.expiresAt <= now)
        throw badRequest("CLAIM_EXPIRED", "Your claim has expired. Please claim the lead again.");
      await tx
        .update(leads)
        .set({ status: "outreach_sent", outreachSentAt: now })
        .where(eq(leads.id, leadId));
      await tx.delete(leadClaims).where(eq(leadClaims.leadId, leadId));
    });
    await this.audit.record({
      actor,
      action: "gigs.outreach_sent",
      targetType: "gig",
      targetId: leadId,
      client,
    });
    void this.emit({ type: "lead.outreach_sent", leadId, userId: actor.id });
  }

  async mine(actor: AuthUser): Promise<ActiveClaim[]> {
    const rows = await this.db
      .select({ c: leadClaims, l: leads })
      .from(leadClaims)
      .innerJoin(leads, eq(leads.id, leadClaims.leadId))
      .where(and(eq(leadClaims.userId, actor.id), gt(leadClaims.expiresAt, new Date())));
    return rows.map(({ c, l }) => ({
      leadId: l.id,
      title: l.title,
      venue: l.venue,
      startsAt: l.startsAt.toISOString(),
      eventUrl: l.eventUrl,
      claimedAt: c.claimedAt.toISOString(),
      expiresAt: c.expiresAt.toISOString(),
    }));
  }

  /** Every 5 minutes (worker schedule): return expired claims to the pool. */
  async sweepExpired() {
    const expired = await this.db
      .select()
      .from(leadClaims)
      .where(lte(leadClaims.expiresAt, new Date()));
    for (const c of expired) {
      const out = { released: false };
      await this.db.transaction(async (tx) => {
        const lead = await this.lockLead(tx, c.leadId).catch(() => null);
        if (lead?.status === "claimed" && lead.claimedBy === c.userId) {
          await this.reset(tx, c.leadId);
          out.released = true;
        } else {
          await tx.delete(leadClaims).where(eq(leadClaims.leadId, c.leadId));
        }
      });
      if (out.released) {
        await this.notifications.notify(c.userId, {
          type: "gigs.claim_expired",
          title: "Your claim expired and the lead was released",
          link: "/gigs",
        });
        await this.audit.record({
          actor: null,
          action: "gigs.claim_expired",
          targetType: "gig",
          targetId: c.leadId,
          details: { userId: c.userId },
        });
      }
    }
    if (expired.length) this.log.log(`Swept ${expired.length} expired claim(s)`);
    return expired.length;
  }

  /** Freeze, deactivate, leave or delete: put every unsent claim back in the pool. */
  async releaseAllFor(
    userId: string,
    reason: string,
    actor: Pick<AuthUser, "id" | "role"> | null,
    client?: ClientInfo,
  ) {
    const held = await this.db
      .select({ leadId: leadClaims.leadId })
      .from(leadClaims)
      .where(eq(leadClaims.userId, userId));
    for (const h of held) {
      await this.db.transaction(async (tx) => {
        const lead = await this.lockLead(tx, h.leadId).catch(() => null);
        if (lead?.status === "claimed" && lead.claimedBy === userId) await this.reset(tx, h.leadId);
        else await tx.delete(leadClaims).where(eq(leadClaims.leadId, h.leadId));
      });
    }
    if (held.length) {
      await this.audit.record({
        actor,
        action: "gigs.released_all",
        targetType: "user",
        targetId: userId,
        details: { reason, count: held.length },
        client,
      });
    }
  }
}
