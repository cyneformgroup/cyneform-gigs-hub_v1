import {
  and,
  desc,
  eq,
  harvestRunErrors,
  harvestRuns,
  isNull,
  leadSources,
  newId,
} from "@cyneform/db";
import { createQueue, createQueueEvents, QUEUES, type ScrapeJob } from "@cyneform/queue";
import type { PreviewResult, RunDetail, RunItem, SourceInput, SourceItem } from "@cyneform/types";
import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { Cron } from "croner";
import type { AuthUser } from "../access/auth-user";
import { AuditService } from "../audit/audit.service";
import type { ClientInfo } from "../common/client-info";
import { badRequest, notFound } from "../common/errors";
import { env } from "../config/env";
import { DB, type Db } from "../database/database.module";

const TZ = "Africa/Nairobi";

function checkSchedule(expr: string | null) {
  if (!expr) return;
  try {
    const [a, b] = new Cron(expr, { timezone: TZ }).nextRuns(2);
    if (a && b && b.getTime() - a.getTime() < 15 * 60_000) throw new Error("too frequent");
  } catch (e) {
    throw badRequest(
      "BAD_SCHEDULE",
      (e as Error).message === "too frequent"
        ? "Runs must be at least 15 minutes apart."
        : "Invalid schedule. Use 5 fields, e.g. 0 8 * * *",
    );
  }
}

type SourceRow = typeof leadSources.$inferSelect;
const toItem = (r: SourceRow): SourceItem => {
  const f = JSON.parse(r.filters) as { include: string[]; exclude: string[] };
  return {
    id: r.id,
    name: r.name,
    startUrls: JSON.parse(r.startUrls),
    category: r.category,
    schedule: r.schedule,
    nextRunAt:
      r.enabled && r.schedule
        ? (new Cron(r.schedule, { timezone: TZ }).nextRun()?.toISOString() ?? null)
        : null,
    includeKeywords: f.include,
    excludeKeywords: f.exclude,
    maxPages: r.maxPages,
    enabled: r.enabled,
    autoPublish: r.autoPublish,
    health: r.health,
    lastRunAt: r.lastRunAt?.toISOString() ?? null,
    tosCheckedAt: r.tosCheckedAt?.toISOString() ?? null,
    tosNote: r.tosNote,
    config: JSON.parse(r.config),
  };
};

const columns = (i: SourceInput) => ({
  name: i.name,
  startUrls: JSON.stringify(i.startUrls),
  strategy: i.config.strategy,
  config: JSON.stringify(i.config),
  filters: JSON.stringify({
    include: i.includeKeywords,
    exclude: i.excludeKeywords,
  }),
  category: i.category ?? null,
  maxPages: i.maxPages ?? null,
  schedule: i.schedule,
  enabled: i.enabled,
  autoPublish: i.autoPublish,
  tosNote: i.tosNote ?? null,
});

@Injectable()
export class SourcesService implements OnModuleDestroy {
  private readonly log = new Logger(SourcesService.name);
  private readonly scrape = createQueue<ScrapeJob>(QUEUES.scrape, env.REDIS_URL);
  private readonly cron = createQueue<Record<string, never>>(QUEUES.cron, env.REDIS_URL);
  private readonly events = createQueueEvents(QUEUES.scrape, env.REDIS_URL);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async onModuleDestroy() {
    await Promise.all([this.scrape.close(), this.cron.close(), this.events.close()]);
  }

  private async row(id: string) {
    const [r] = await this.db
      .select()
      .from(leadSources)
      .where(and(eq(leadSources.id, id), isNull(leadSources.deletedAt)))
      .limit(1);
    if (!r) throw notFound("Source not found.");
    return r;
  }

  /** Asks the worker to reconcile schedules with the database. */
  private sync() {
    return this.cron
      .add(
        "sync-sources",
        {},
        { jobId: "sync-sources", removeOnComplete: true, removeOnFail: true },
      )
      .catch((e) => this.log.error(`Could not queue schedule sync: ${(e as Error).message}`));
  }

  async list(): Promise<SourceItem[]> {
    const rows = await this.db
      .select()
      .from(leadSources)
      .where(isNull(leadSources.deletedAt))
      .orderBy(desc(leadSources.createdAt));
    return rows.map(toItem);
  }

  async create(input: SourceInput, actor: AuthUser, client?: ClientInfo): Promise<SourceItem> {
    checkSchedule(input.schedule);
    const id = newId();
    await this.db.insert(leadSources).values({
      id,
      ...columns(input),
      tosCheckedAt: input.tosChecked ? new Date() : null,
      createdBy: actor.id,
    });
    await this.audit.record({
      actor,
      action: "sources.created",
      targetType: "source",
      targetId: id,
      details: { name: input.name, strategy: input.config.strategy },
      client,
    });
    await this.sync();
    return toItem(await this.row(id));
  }

  async update(
    id: string,
    input: SourceInput,
    actor: AuthUser,
    client?: ClientInfo,
  ): Promise<SourceItem> {
    const before = await this.row(id);
    checkSchedule(input.schedule);
    await this.db
      .update(leadSources)
      .set({
        ...columns(input),
        tosCheckedAt: input.tosChecked ? (before.tosCheckedAt ?? new Date()) : null,
      })
      .where(eq(leadSources.id, id));
    await this.audit.record({
      actor,
      action: "sources.updated",
      targetType: "source",
      targetId: id,
      details: { name: input.name, enabled: input.enabled },
      client,
    });
    await this.sync();
    return toItem(await this.row(id));
  }

  async remove(id: string, actor: AuthUser, client?: ClientInfo) {
    await this.row(id);
    await this.db
      .update(leadSources)
      .set({ deletedAt: new Date(), enabled: false })
      .where(eq(leadSources.id, id));
    await this.audit.record({
      actor,
      action: "sources.deleted",
      targetType: "source",
      targetId: id,
      client,
    });
    await this.sync();
  }

  async runNow(id: string, actor: AuthUser, client?: ClientInfo) {
    await this.row(id);
    await this.scrape.add(
      "run",
      { kind: "run", sourceId: id, trigger: "manual", by: actor.id },
      { attempts: 1, removeOnComplete: 500, removeOnFail: 500 },
    );
    await this.audit.record({
      actor,
      action: "sources.run_requested",
      targetType: "source",
      targetId: id,
      client,
    });
    return { queued: true };
  }

  /** Dry run: the worker fetches and extracts; nothing is stored. */
  async preview(input: SourceInput): Promise<PreviewResult> {
    checkSchedule(input.schedule);
    const job = await this.scrape.add(
      "preview",
      { kind: "preview", input },
      { attempts: 1, removeOnComplete: true, removeOnFail: true },
    );
    try {
      await this.events.waitUntilReady();
      return (await job.waitUntilFinished(this.events, 90_000)) as PreviewResult;
    } catch (e) {
      const msg = (e as Error).message;
      throw badRequest(
        "PREVIEW_FAILED",
        /timed out/i.test(msg)
          ? "The worker did not respond in time. Is it running?"
          : msg.slice(0, 300),
      );
    }
  }

  private mapRun(r: typeof harvestRuns.$inferSelect, sourceName: string | null): RunItem {
    return {
      id: r.id,
      sourceId: r.sourceId,
      sourceName,
      trigger: r.trigger,
      status: r.status,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      pages: r.pages,
      found: r.found,
      added: r.added,
      duplicates: r.duplicates,
      rejected: r.rejected,
      errorCount: r.errorCount,
    };
  }

  async runs(q: { sourceId?: string; limit: number }): Promise<RunItem[]> {
    const rows = await this.db
      .select({ r: harvestRuns, sourceName: leadSources.name })
      .from(harvestRuns)
      .leftJoin(leadSources, eq(leadSources.id, harvestRuns.sourceId))
      .where(q.sourceId ? eq(harvestRuns.sourceId, q.sourceId) : undefined)
      .orderBy(desc(harvestRuns.startedAt))
      .limit(q.limit);
    return rows.map((x) => this.mapRun(x.r, x.sourceName));
  }

  async run(id: string): Promise<RunDetail> {
    const [x] = await this.db
      .select({ r: harvestRuns, sourceName: leadSources.name })
      .from(harvestRuns)
      .leftJoin(leadSources, eq(leadSources.id, harvestRuns.sourceId))
      .where(eq(harvestRuns.id, id))
      .limit(1);
    if (!x) throw notFound("Run not found.");
    const errors = await this.db
      .select({
        url: harvestRunErrors.url,
        stage: harvestRunErrors.stage,
        message: harvestRunErrors.message,
      })
      .from(harvestRunErrors)
      .where(eq(harvestRunErrors.runId, id));
    return { ...this.mapRun(x.r, x.sourceName), errors };
  }
}
