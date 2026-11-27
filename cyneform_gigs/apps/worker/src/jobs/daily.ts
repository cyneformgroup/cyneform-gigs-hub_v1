import { emit } from "../events";

export const dailyTasks: { name: string; run: () => Promise<void> }[] = [
  { name: "leave-return", run: () => emit({ type: "automation.leave" }) },
  { name: "inactivity", run: () => emit({ type: "automation.inactivity" }) },
  { name: "vault-reset", run: () => emit({ type: "automation.vault" }) },
  { name: "points-expiry", run: () => emit({ type: "points.expire" }) },
  { name: "crm-reminders", run: () => emit({ type: "crm.reminders" }) },
  { name: "rollover-expiry", run: () => emit({ type: "compensation.expire" }) },
  { name: "bonus-queue", run: () => emit({ type: "bonus.process" }) },
  { name: "equity-vesting", run: () => emit({ type: "equity.daily" }) },
  // Phase 7+: reminders, inactivity...
];

export async function daily() {
  for (const task of dailyTasks) {
    try {
      await task.run();
      console.log(`[daily] ${task.name} ok`);
    } catch (err) {
      console.error(`[daily] ${task.name} failed:`, err);
    }
  }
  console.log(`[daily] finished, ${dailyTasks.length} task(s)`);
}
