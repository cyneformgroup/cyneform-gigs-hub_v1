import { QUEUES, redisOptions } from "@cyneform/queue";
import { type Job, Queue } from "bullmq";
import { env } from "./env";
import { handlers, schedules } from "./jobs";

export async function runCron(job: Job) {
  const handler = handlers[job.name];
  if (!handler) throw new Error(`No handler for cron job "${job.name}"`);
  await handler();
}

export async function registerSchedules() {
  const queue = new Queue(QUEUES.cron, {
    connection: redisOptions(env.REDIS_URL, "worker"),
  });
  for (const s of schedules) {
    await queue.upsertJobScheduler(
      s.id,
      { pattern: s.pattern, tz: "Africa/Nairobi" },
      { name: s.id },
    );
  }
  await queue.close();
}
