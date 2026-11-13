import { type ConnectionOptions, Queue, QueueEvents } from "bullmq";

export const QUEUES = { mail: "mail", cron: "cron", scrape: "scrape" } as const;

/** One email, already rendered by the API. The worker only delivers it. */
export type MailJob = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  template?: string;
};

/**
 * Producers (the API) fail fast when Redis is down instead of hanging a request.
 * Workers must never give up on a command (maxRetriesPerRequest: null).
 */
export function redisOptions(url: string, role: "producer" | "worker"): ConnectionOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    tls: u.protocol === "rediss:" ? {} : undefined,
    ...(role === "worker" ? { maxRetriesPerRequest: null } : { enableOfflineQueue: false }),
  };
}

export function createQueue<T>(name: string, url: string) {
  return new Queue<T>(name, { connection: redisOptions(url, "producer") });
}

export type ScrapeJob =
  | {
      kind: "run";
      sourceId: string;
      trigger: "schedule" | "manual";
      by?: string;
    }
  | { kind: "preview"; input: unknown }; // validated again by the worker

/** Lets the API wait for a preview job's result without doing the scraping itself. */
export function createQueueEvents(name: string, url: string) {
  return new QueueEvents(name, { connection: redisOptions(url, "worker") });
}
