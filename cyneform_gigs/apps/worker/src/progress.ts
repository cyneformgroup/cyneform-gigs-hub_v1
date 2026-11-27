import { Redis } from "ioredis";

export const HARVEST_CHANNEL = "harvest:events";
let pub: Redis | null = null;

export type HarvestEvent =
  | { type: "run.started"; runId: string; sourceId: string; sourceName: string; trigger: string }
  | { type: "run.progress"; runId: string; sourceId: string; pages: number; found: number }
  | {
      type: "run.finished";
      runId: string;
      sourceId: string;
      sourceName: string;
      status: string;
      pages: number;
      found: number;
      added: number;
      duplicates: number;
      rejected: number;
      error?: string;
    };

export function publish(e: HarvestEvent) {
  try {
    pub ??= new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    pub.on("error", () => undefined);
    void pub
      .publish(HARVEST_CHANNEL, JSON.stringify({ ...e, at: Date.now() }))
      .catch(() => undefined);
  } catch {
    // Live updates are best effort and must not interrupt harvesting.
  }
}

export function throttledProgress(runId: string, sourceId: string) {
  let last = 0;
  return (pages: number, found: number) => {
    const now = Date.now();
    if (now - last < 1000) return;
    last = now;
    publish({ type: "run.progress", runId, sourceId, pages, found });
  };
}
