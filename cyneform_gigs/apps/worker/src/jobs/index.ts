import { emit } from "../events";
import { daily } from "./daily";
import { sessionCleanup } from "./session-cleanup";
import { syncSources } from "./sync-sources";

export const handlers: Record<string, () => Promise<void>> = {
  "session-cleanup": sessionCleanup,
  "daily-8am": daily,
  "sync-sources": syncSources,
  "claim-expiry": () => emit({ type: "claims.sweep" }),
  "thursday-8am": () => emit({ type: "bonus.check" }),
  "friday-report-reminder": () => emit({ type: "reports.remind" }),
  "saturday-report-reminder": () => emit({ type: "reports.remind" }),
  "sunday-report-overdue": () => emit({ type: "reports.overdue" }),
};

export const schedules = [
  { id: "session-cleanup", pattern: "0 * * * *" }, // hourly
  { id: "daily-8am", pattern: "0 8 * * *" }, // 8:00 AM EAT
  { id: "sync-sources", pattern: "*/15 * * * *" },
  { id: "claim-expiry", pattern: "*/5 * * * *" },
  { id: "thursday-8am", pattern: "0 8 * * 4" }, // Thursdays 8:00 AM EAT
  { id: "friday-report-reminder", pattern: "0 9 * * 5" }, // Fridays 9:00 AM EAT
  { id: "saturday-report-reminder", pattern: "0 9 * * 6" }, // Saturdays 9:00 AM EAT
  { id: "sunday-report-overdue", pattern: "0 0 * * 0" }, // Sunday midnight EAT
];
