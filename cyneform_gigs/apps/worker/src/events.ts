import { type EventJob, QUEUES, redisOptions } from "@cyneform/queue";
import { Queue } from "bullmq";
import { env } from "./env";

let queue: Queue<EventJob> | undefined;

export async function emit(event: EventJob) {
  queue ??= new Queue<EventJob>(QUEUES.events, {
    connection: redisOptions(env.REDIS_URL, "worker"),
  });
  await queue.add(event.type, event, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 500,
    removeOnFail: 500,
  });
}
