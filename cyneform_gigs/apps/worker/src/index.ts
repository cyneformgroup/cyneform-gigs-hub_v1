import { type MailJob, QUEUES, redisOptions } from "@cyneform/queue";
import { Worker } from "bullmq";
import { registerSchedules, runCron } from "./cron";
import { env } from "./env";
import { sendMail } from "./mail";

const connection = redisOptions(env.REDIS_URL, "worker");

const mailWorker = new Worker<MailJob>(QUEUES.mail, sendMail, {
  connection,
  concurrency: 5,
});
const cronWorker = new Worker(QUEUES.cron, runCron, {
  connection,
  concurrency: 1,
});

for (const w of [mailWorker, cronWorker]) {
  w.on("failed", (job, err) => console.error(`[${w.name}] job ${job?.id} failed: ${err.message}`));
  w.on("error", (err) => console.error(`[${w.name}] worker error: ${err.message}`));
}

await registerSchedules();
console.log("Worker ready: mail + cron");

const stop = async () => {
  await Promise.all([mailWorker.close(), cronWorker.close()]);
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
