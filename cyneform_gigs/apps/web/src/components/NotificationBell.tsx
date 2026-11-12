import type { NotificationPage } from "@cyneform/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../lib/api";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<NotificationPage>("/notifications"),
    refetchInterval: 30_000,
  });
  const read = useMutation({
    mutationFn: (id: string) => api<void>(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: refresh,
  });
  const readAll = useMutation({
    mutationFn: () => api<void>("/notifications/read-all", { method: "POST" }),
    onSuccess: refresh,
  });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {!!data?.unread && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
              <span className="text-sm font-semibold">Notifications</span>
              {!!data?.unread && (
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => readAll.mutate()}
                >
                  Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {data?.items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`block w-full px-4 py-3 text-left text-sm hover:bg-slate-50 ${n.readAt ? "text-slate-500" : "font-medium"}`}
                    onClick={() => {
                      if (!n.readAt) read.mutate(n.id);
                      setOpen(false);
                      if (n.link) navigate(n.link);
                    }}
                  >
                    <span className="block">{n.title}</span>
                    {n.body && (
                      <span className="block text-xs font-normal text-slate-500">{n.body}</span>
                    )}
                    <span className="block text-xs font-normal text-slate-400">
                      {new Date(n.createdAt).toLocaleString("en-KE")}
                    </span>
                  </button>
                </li>
              ))}
              {data?.items.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-slate-500">Nothing yet.</li>
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
