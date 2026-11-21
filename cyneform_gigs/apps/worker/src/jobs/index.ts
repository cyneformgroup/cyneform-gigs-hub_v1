import { emit } from "../events";
import { daily } from "./daily";
import { sessionCleanup } from "./session-cleanup";
import { syncSources } from "./sync-sources";

export const handlers: Record<string, () => Promise<void>> = {
  "session-cleanup": sessionCleanup,
  "daily-8am": daily,
  "sync-sources": syncSources,
  "claim-expiry": () => emit({ type: "claims.sweep" }),
};

export const schedules = [
  { id: "session-cleanup", pattern: "0 * * * *" }, // hourly
  { id: "daily-8am", pattern: "0 8 * * *" }, // 8:00 AM EAT
  { id: "sync-sources", pattern: "*/15 * * * *" },
  { id: "claim-expiry", pattern: "*/5 * * * *" },
];
