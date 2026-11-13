import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

function isPrivate(ip: string): boolean {
  if (isIP(ip) === 6) {
    const l = ip.toLowerCase();
    return (
      l === "::1" ||
      l === "::" ||
      /^f[cd]/.test(l) ||
      l.startsWith("fe80") ||
      (l.startsWith("::ffff:") && isPrivate(l.slice(7)))
    );
  }
  return PRIVATE_V4.some((r) => r.test(ip));
}

export async function assertPublicUrl(raw: string) {
  const u = new URL(raw);
  if (u.protocol !== "https:") throw new Error("Only https:// links are allowed");
  if (u.port && u.port !== "443") throw new Error("Only the standard https port is allowed");
  const addrs = isIP(u.hostname)
    ? [{ address: u.hostname }]
    : await lookup(u.hostname, { all: true });
  if (addrs.some((a) => isPrivate(a.address)))
    throw new Error("Private or internal addresses are not allowed");
}
