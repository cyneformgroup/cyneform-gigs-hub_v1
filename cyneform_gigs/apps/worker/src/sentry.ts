import * as Sentry from "@sentry/bun";
import type { Worker } from "bullmq";

export function attachSentry(worker: Worker) {
  worker.on("failed", (job, error) => {
    if (!process.env.SENTRY_DSN) return;
    const attempts = job?.opts.attempts ?? 1;
    if ((job?.attemptsMade ?? 0) < attempts) return;
    Sentry.withScope((scope) => {
      scope.setTag("queue", worker.name);
      scope.setTag("job", job?.name ?? "unknown");
      if (job?.id) scope.setExtra("jobId", job.id);
      scope.setExtra("attempts", job?.attemptsMade);
      Sentry.captureException(error);
    });
  });
  worker.on("error", (error) => {
    if (process.env.SENTRY_DSN) Sentry.captureException(error);
  });
}
