import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getSocket } from "./realtime";

export type LiveRun = {
  runId: string;
  sourceId: string;
  sourceName: string;
  status: string;
  pages: number;
  found: number;
  added?: number;
  error?: string;
  at: number;
};

export function useHarvestLive(): LiveRun[] {
  const queryClient = useQueryClient();
  const [runs, setRuns] = useState<Record<string, LiveRun>>({});
  useEffect(() => {
    const socket = getSocket();
    const onHarvest = (event: {
      type: string;
      runId: string;
      sourceId: string;
      sourceName?: string;
      status?: string;
      pages?: number;
      found?: number;
      added?: number;
      error?: string;
      at: number;
    }) => {
      setRuns((prev) => {
        const old = prev[event.runId];
        const next: LiveRun = {
          runId: event.runId,
          sourceId: event.sourceId,
          sourceName: event.sourceName ?? old?.sourceName ?? "Source",
          at: event.at,
          status: event.type === "run.finished" ? (event.status ?? "success") : "running",
          pages: event.pages ?? old?.pages ?? 0,
          found: event.found ?? old?.found ?? 0,
          added: event.added ?? old?.added,
          error: event.error,
        };
        return { ...prev, [event.runId]: next };
      });
      if (event.type === "run.finished") {
        void queryClient.invalidateQueries({ queryKey: ["sources"] });
        void queryClient.invalidateQueries({ queryKey: ["runs"] });
        void queryClient.invalidateQueries({ queryKey: ["leads"] });
        setTimeout(
          () =>
            setRuns((previous) => {
              const { [event.runId]: _gone, ...rest } = previous;
              return rest;
            }),
          60_000,
        );
      }
    };
    socket.on("harvest", onHarvest);
    return () => {
      socket.off("harvest", onHarvest);
    };
  }, [queryClient]);
  return Object.values(runs).sort((a, b) => b.at - a.at);
}

export function useLiveNotifications() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const socket = getSocket();
    const onNotification = () =>
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    socket.on("notification", onNotification);
    return () => {
      socket.off("notification", onNotification);
    };
  }, [queryClient]);
}
