import { and, db, eq, isNotNull, isNull, leadSources } from "@cyneform/db";
import { QUEUES, redisOptions } from "@cyneform/queue";
import { Queue } from "bullmq";
import { env } from "../env";

export async function syncSources() {
  const queue = new Queue(QUEUES.scrape, {
    connection: redisOptions(env.REDIS_URL, "worker"),
  });
  try {
    const rows = await db
      .select({ id: leadSources.id, schedule: leadSources.schedule })
      .from(leadSources)
      .where(
        and(
          eq(leadSources.enabled, true),
          isNull(leadSources.deletedAt),
          isNotNull(leadSources.schedule),
        ),
      );
    const want = new Map<string, (typeof rows)[number]>(rows.map((r) => [`source:${r.id}`, r]));

    for (const s of await queue.getJobSchedulers(0, -1)) {
      if (s.key.startsWith("source:") && !want.has(s.key)) await queue.removeJobScheduler(s.key);
    }
    for (const [key, r] of want) {
      try {
        await queue.upsertJobScheduler(
          key,
          { pattern: r.schedule as string, tz: "Africa/Nairobi" },
          {
            name: "run",
            data: { kind: "run", sourceId: r.id, trigger: "schedule" },
          },
        );
      } catch (e) {
        console.error(`[sync-sources] bad schedule for ${r.id}:`, (e as Error).message);
      }
    }
    console.log(`[sync-sources] ${want.size} scheduled source(s)`);
  } finally {
    await queue.close();
  }
}
