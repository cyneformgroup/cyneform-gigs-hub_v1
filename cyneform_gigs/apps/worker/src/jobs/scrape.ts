import {
  and,
  db,
  eq,
  getNumber,
  gt,
  harvestRunErrors,
  harvestRuns,
  isNull,
  leadSources,
  leads,
  newId,
} from "@cyneform/db";
import type { ScrapeJob } from "@cyneform/queue";
import { runSource, type Tuning } from "@cyneform/scraper";
import type { PreviewResult } from "@cyneform/types";
import { SourceInputSchema } from "@cyneform/validators";
import type { Job } from "bullmq";
import { env } from "../env";
import { notifyAdmins } from "../notify";

async function tuning(maxPages?: number | null): Promise<Tuning> {
  return {
    maxPages: maxPages ?? (await getNumber("harvest.max_pages")),
    delayMs: await getNumber("harvest.delay_ms"),
    concurrency: await getNumber("harvest.concurrency"),
    timeoutS: await getNumber("harvest.timeout_s"),
    retries: await getNumber("harvest.retries"),
    windowDays: await getNumber("harvest.window_days"),
    userAgent: env.BOT_USER_AGENT,
  };
}

export async function processScrape(job: Job<ScrapeJob>) {
  const d = job.data;
  return d.kind === "preview"
    ? preview(d.input)
    : runSourceJob(d.sourceId, d.trigger, d.by ?? null);
}

async function preview(raw: unknown): Promise<PreviewResult> {
  const input = SourceInputSchema.parse(raw);
  const t = await tuning();
  const r = await runSource(
    {
      startUrls: input.startUrls,
      config: input.config,
      category: input.category ?? null,
      include: input.includeKeywords,
      exclude: input.excludeKeywords,
    },
    { ...t, maxPages: Math.min(5, t.maxPages) },
  );
  return {
    pages: r.pages,
    blocked: r.blocked,
    acceptedTotal: r.gigs.length,
    accepted: r.gigs.slice(0, 15).map(({ gig }) => ({
      title: gig.title,
      startsAt: gig.startsAt.toISOString(),
      venue: gig.venue,
      url: gig.eventUrl,
    })),
    rejectedTotal: r.rejected.length,
    rejected: r.rejected.slice(0, 15),
    errors: r.errors.slice(0, 10),
  };
}

async function runSourceJob(sourceId: string, trigger: "schedule" | "manual", by: string | null) {
  const [src] = await db
    .select()
    .from(leadSources)
    .where(and(eq(leadSources.id, sourceId), isNull(leadSources.deletedAt)))
    .limit(1);
  if (!src) return { skipped: "source not found" };

  const recent = new Date(Date.now() - 30 * 60_000);
  const [busy] = await db
    .select({ id: harvestRuns.id })
    .from(harvestRuns)
    .where(
      and(
        eq(harvestRuns.sourceId, sourceId),
        eq(harvestRuns.status, "running"),
        gt(harvestRuns.startedAt, recent),
      ),
    )
    .limit(1);
  if (busy) return { skipped: "already running" };

  const runId = newId();
  await db
    .insert(harvestRuns)
    .values({ id: runId, sourceId, trigger, startedBy: by, status: "running" });

  try {
    const filters = JSON.parse(src.filters) as {
      include: string[];
      exclude: string[];
    };
    const r = await runSource(
      {
        startUrls: JSON.parse(src.startUrls),
        config: JSON.parse(src.config),
        category: src.category,
        include: filters.include,
        exclude: filters.exclude,
      },
      await tuning(src.maxPages),
    );

    let added = 0;
    let duplicates = 0;
    for (const { gig, fingerprint, ownUrl } of r.gigs) {
      if (ownUrl) {
        const [hit] = await db
          .select({ id: leads.id })
          .from(leads)
          .where(eq(leads.eventUrl, gig.eventUrl))
          .limit(1);
        if (hit) {
          duplicates++;
          continue;
        }
      }
      const [res] = await db
        .insert(leads)
        .ignore()
        .values({
          sourceId,
          runId,
          fingerprint,
          title: gig.title,
          description: gig.description,
          clientName: gig.clientName,
          venue: gig.venue,
          location: gig.location,
          category: gig.category,
          budget: gig.budget,
          currency: gig.currency,
          startsAt: gig.startsAt,
          endsAt: gig.endsAt,
          eventUrl: gig.eventUrl,
          contacts: JSON.stringify(gig.contacts),
          status: src.autoPublish ? "new" : "pending_review",
          publishedAt: src.autoPublish ? new Date() : null,
        });
      if (res.affectedRows === 1) added++;
      else duplicates++; // unique fingerprint = same gig already stored
    }

    const alertPct = await getNumber("harvest.error_alert_pct");
    const rate = (100 * r.errors.length) / Math.max(1, r.pages + r.errors.length);
    const health = r.blocked
      ? "blocked"
      : r.pages === 0
        ? "failed"
        : rate > alertPct || r.found === 0
          ? "degraded"
          : "healthy";
    const status = r.pages === 0 ? "failed" : r.errors.length ? "partial" : "success";

    await db
      .update(harvestRuns)
      .set({
        status,
        finishedAt: new Date(),
        pages: r.pages,
        found: r.found,
        added,
        duplicates,
        rejected: r.rejected.length,
        errorCount: r.errors.length,
      })
      .where(eq(harvestRuns.id, runId));
    if (r.errors.length) {
      await db.insert(harvestRunErrors).values(
        r.errors.slice(0, 100).map((e) => ({
          runId,
          url: e.url.slice(0, 500),
          stage: e.stage,
          message: e.message,
        })),
      );
    }
    await db
      .update(leadSources)
      .set({ health, lastRunAt: new Date() })
      .where(eq(leadSources.id, sourceId));

    if (health !== "healthy" && health !== src.health) {
      await notifyAdmins({
        title: `Source "${src.name}" is ${health}`,
        body: r.blocked
          ? "The site blocked access. Check its terms."
          : "Check the run history for details.",
        link: "/sources",
      });
    }
    console.log(
      `[scrape] ${src.name}: pages=${r.pages} found=${r.found} added=${added} dup=${duplicates} rejected=${r.rejected.length} errors=${r.errors.length} -> ${health}`,
    );
    return { runId, added };
  } catch (err) {
    const message = (err as Error).message.slice(0, 500);
    await db
      .update(harvestRuns)
      .set({ status: "failed", finishedAt: new Date(), errorCount: 1 })
      .where(eq(harvestRuns.id, runId));
    await db.insert(harvestRunErrors).values({ runId, url: null, stage: "crash", message });
    await db
      .update(leadSources)
      .set({ health: "failed", lastRunAt: new Date() })
      .where(eq(leadSources.id, sourceId));
    throw err;
  }
}
