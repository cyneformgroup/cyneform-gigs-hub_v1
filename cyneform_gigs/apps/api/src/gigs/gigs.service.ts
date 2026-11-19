import { and, asc, count, desc, eq, gt, inArray, leadSources, leads, like, or } from "@cyneform/db";
import type {
  GigItem,
  GigPage,
  GigQuery,
  LeadStatus,
  ReviewGigsInput,
  ReviewResult,
} from "@cyneform/types";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { SQL } from "drizzle-orm";
import type { AuthUser } from "../access/auth-user";
import { AuditService } from "../audit/audit.service";
import type { ClientInfo } from "../common/client-info";
import { DB, type Db } from "../database/database.module";
import { GigNotifier } from "./gig-notifier.service";

type Row = typeof leads.$inferSelect;
const toItem = (l: Row, sourceName: string | null): GigItem => ({
  id: l.id,
  title: l.title,
  description: l.description,
  clientName: l.clientName,
  venue: l.venue,
  location: l.location,
  category: l.category,
  budget: l.budget,
  currency: l.currency,
  startsAt: l.startsAt.toISOString(),
  endsAt: l.endsAt?.toISOString() ?? null,
  eventUrl: l.eventUrl,
  contacts: JSON.parse(l.contacts),
  status: l.status,
  sourceName,
  createdAt: l.createdAt.toISOString(),
  publishedAt: l.publishedAt?.toISOString() ?? null,
  rejectReason: l.rejectReason,
});

@Injectable()
export class GigsService {
  private readonly log = new Logger(GigsService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(GigNotifier) private readonly notifier: GigNotifier,
  ) {}

  /** Reviewers see every status. Everyone else only sees upcoming published gigs. */
  async list(q: GigQuery, actor: AuthUser): Promise<GigPage> {
    const reviewer = actor.permissions.has("gigs.review");
    const status = reviewer ? q.status : "new";
    const conds: (SQL | undefined)[] = [eq(leads.status, status)];
    if (!reviewer) conds.push(gt(leads.startsAt, new Date()));
    if (reviewer && q.sourceId) conds.push(eq(leads.sourceId, q.sourceId));
    if (q.search)
      conds.push(or(like(leads.title, `%${q.search}%`), like(leads.venue, `%${q.search}%`)));
    const where = and(...conds);

    const [t] = await this.db.select({ total: count() }).from(leads).where(where);
    const rows = await this.db
      .select({ l: leads, sourceName: leadSources.name })
      .from(leads)
      .leftJoin(leadSources, eq(leadSources.id, leads.sourceId))
      .where(where)
      .orderBy(status === "new" ? asc(leads.startsAt) : desc(leads.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);

    const counts: Record<string, number> = {};
    if (reviewer) {
      for (const g of await this.db
        .select({ status: leads.status, n: count() })
        .from(leads)
        .groupBy(leads.status))
        counts[g.status] = Number(g.n);
    }
    return {
      items: rows.map((r) => toItem(r.l, r.sourceName)),
      total: Number(t?.total ?? 0),
      page: q.page,
      pageSize: q.pageSize,
      counts,
    };
  }

  async review(
    input: ReviewGigsInput,
    actor: AuthUser,
    client?: ClientInfo,
  ): Promise<ReviewResult> {
    const approve = input.action === "approve";
    const from: LeadStatus[] = approve ? ["pending_review", "rejected"] : ["pending_review", "new"];
    const now = new Date();

    const rows = await this.db
      .select({ id: leads.id, startsAt: leads.startsAt })
      .from(leads)
      .where(and(inArray(leads.id, input.ids), inArray(leads.status, from)));
    const ids = rows.filter((r) => !approve || r.startsAt > now).map((r) => r.id); // never publish past events

    if (ids.length > 0) {
      await this.db
        .update(leads)
        .set(
          approve
            ? {
                status: "new",
                publishedAt: now,
                reviewedBy: actor.id,
                reviewedAt: now,
                rejectReason: null,
              }
            : {
                status: "rejected",
                publishedAt: null,
                reviewedBy: actor.id,
                reviewedAt: now,
                rejectReason: input.reason ?? null,
              },
        )
        .where(inArray(leads.id, ids));
      await this.audit.record({
        actor,
        action: approve ? "gigs.approved" : "gigs.rejected",
        targetType: "gig",
        targetId: ids[0] ?? "batch",
        details: {
          count: ids.length,
          ids: ids.slice(0, 50),
          reason: input.reason,
        },
        client,
      });
      if (approve)
        void this.notifier
          .announce(ids)
          .catch((e) => this.log.error(`Announce failed: ${(e as Error).message}`));
    }
    return { updated: ids.length, skipped: input.ids.length - ids.length };
  }
}
