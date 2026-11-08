import type { Request } from "express";

export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}
export const clientInfo = (req: Request): ClientInfo => ({
  ip: req.ip ?? null,
  userAgent: req.get("user-agent")?.slice(0, 255) ?? null,
});
