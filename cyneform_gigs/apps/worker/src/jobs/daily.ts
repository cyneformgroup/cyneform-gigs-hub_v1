import { emit } from "../events";

export const dailyTasks: { name: string; run: () => Promise<void> }[] = [
  { name: "points-expiry", run: () => emit({ type: "points.expire" }) },
  { name: "crm-reminders", run: () => emit({ type: "crm.reminders" }) },
  { name: "rollover-expiry", run: () => emit({ type: "compensation.expire" }) },
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
