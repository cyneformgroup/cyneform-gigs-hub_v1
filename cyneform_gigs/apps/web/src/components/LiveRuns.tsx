import { useHarvestLive } from "../lib/useLive";
import { Badge, Card } from "./ui";

export function LiveRuns() {
  const runs = useHarvestLive();
  if (runs.length === 0) return null;
  return (
    <Card className="mt-4">
      <h2 className="font-semibold">Live harvests</h2>
      <ul className="mt-2 divide-y divide-slate-100 text-sm">
        {runs.map((run) => (
          <li key={run.runId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <b>{run.sourceName}</b>
              <span className="block text-xs text-slate-500">
                {run.pages} page(s) read, {run.found} item(s) found
                {run.added !== undefined ? `, ${run.added} added` : ""}
                {run.error ? `, ${run.error}` : ""}
              </span>
            </span>
            <span className="flex items-center gap-2">
              {run.status === "running" && (
                <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" aria-hidden />
              )}
              <Badge value={run.status} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
