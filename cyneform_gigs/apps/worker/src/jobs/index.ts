import { daily } from "./daily";
import { sessionCleanup } from "./session-cleanup";

export const handlers: Record<string, () => Promise<void>> = {
  "session-cleanup": sessionCleanup,
  "daily-8am": daily,
};

export const schedules = [
  { id: "session-cleanup", pattern: "0 * * * *" }, // hourly
  { id: "daily-8am", pattern: "0 8 * * *" }, // 8:00 AM EAT
];
