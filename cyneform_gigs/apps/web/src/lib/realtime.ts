import { io, type Socket } from "socket.io-client";
import { api } from "./api";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(window.location.origin, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    auth: (cb) => {
      api<{ ticket: string }>("/realtime/ticket", { method: "POST" })
        .then((r) => cb({ ticket: r.ticket }))
        .catch(() => cb({}));
    },
  });
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = null;
}
