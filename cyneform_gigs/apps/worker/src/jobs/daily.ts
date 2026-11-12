export const dailyTasks: { name: string; run: () => Promise<void> }[] = [
  // Phase 4: harvest, Phase 5: claim expiry, Phase 6: points expiry, Phase 12: inactivity, reminders...
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
