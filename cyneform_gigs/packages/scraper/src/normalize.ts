import { createHash } from "node:crypto";
import { type GigDraft, GigDraftSchema } from "@cyneform/validators";
import type { RawGig } from "./extract";

const uniq = <T>(a: T[] | null | undefined) => [...new Set(a ?? [])];
const EAT_MS = 3 * 3_600_000;

export const normPhone = (p: string) => {
  const d = p.replace(/\D/g, "");
  return d.startsWith("254") ? `+${d}` : `+254${d.replace(/^0/, "")}`;
};

/** Spec: regex extraction of emails, +254/07 phones, @handles and websites. */
export function extractContacts(text: string) {
  return {
    emails: uniq(text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)).map((e) => e.toLowerCase()),
    phones: uniq(
      (text.match(/(?<!\d)(?:\+254|254|0)[\s-]?[17]\d{2}[\s-]?\d{3}[\s-]?\d{3}(?!\d)/g) ?? []).map(
        normPhone,
      ),
    ),
    handles: uniq(text.match(/(?<![\w@.])@[A-Za-z0-9_.]{3,30}/g)).map((h) => h.replace(/\.$/, "")),
    websites: uniq(text.match(/https?:\/\/[^\s)>"'<]+/g)).map((w) => w.replace(/[.,;]+$/, "")),
  };
}

/** Dates without a timezone are treated as Nairobi time. */
export function parseDate(raw?: string): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  let t: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) t = Date.parse(`${s}T00:00:00+03:00`);
  else if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(s)) t = Date.parse(`${s}+03:00`);
  else t = Date.parse(/(?:Z|[+-]\d{2}:?\d{2}|GMT|UTC|EAT)$/i.test(s) ? s : `${s} GMT+0300`);
  return Number.isNaN(t) ? null : new Date(t);
}

export function parsePrice(
  raw?: string,
  currencyHint?: string,
): { budget: number | null; currency: string | null } {
  if (!raw) return { budget: null, currency: null };
  if (/free/i.test(raw)) return { budget: 0, currency: currencyHint?.toUpperCase() ?? "KES" };
  const m = raw.match(/(KES|KSHS?|USD|EUR|GBP|\$|€|£)?\s*(\d[\d,]*(?:\.\d+)?)\s*(KES|KSHS?|USD)?/i);
  if (!m?.[2]) return { budget: null, currency: null };
  const sym = (m[1] ?? m[3] ?? currencyHint ?? "KES").toUpperCase();
  const currency = sym.startsWith("KS")
    ? "KES"
    : (({ $: "USD", "€": "EUR", "£": "GBP" } as Record<string, string>)[sym] ?? sym);
  return {
    budget: Number(m[2].replace(/,/g, "")),
    currency: currency.length === 3 ? currency : null,
  };
}

export function canonicalUrl(u: string): string {
  try {
    const x = new URL(u);
    x.hash = "";
    for (const k of [...x.searchParams.keys()])
      if (/^(utm_|fbclid$|gclid$|ref$)/i.test(k)) x.searchParams.delete(k);
    return x.toString().replace(/\/$/, "");
  } catch {
    return u;
  }
}

/** Same title + venue + Nairobi calendar day = same gig, even across different websites. */
export function fingerprint(g: Pick<GigDraft, "title" | "venue" | "startsAt">): string {
  const n = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const day = new Date(g.startsAt.getTime() + EAT_MS).toISOString().slice(0, 10);
  return createHash("sha256")
    .update(`${n(g.title)}|${n(g.venue)}|${day}`)
    .digest("hex");
}

export function normalize(
  raw: RawGig,
  ctx: { category: string | null; sourceUrl: string },
): { gig?: GigDraft; ownUrl: boolean; reason?: string } {
  const ownUrl = !!raw.url;
  const startsAt = parseDate(raw.date);
  if (!startsAt)
    return {
      ownUrl,
      reason: raw.date ? `Unreadable date: ${raw.date.slice(0, 40)}` : "No date found",
    };
  const { budget, currency } = parsePrice(raw.price, raw.currency);
  const text = [raw.description, raw.contact, raw.address, raw.venue].filter(Boolean).join(" ");
  const r = GigDraftSchema.safeParse({
    title: raw.title,
    description: raw.description?.slice(0, 5000) ?? null,
    clientName: raw.organizer ?? null,
    venue: raw.venue ?? null,
    location: raw.address ?? null,
    category: ctx.category,
    budget,
    currency,
    startsAt,
    endsAt: parseDate(raw.endDate),
    eventUrl: canonicalUrl(raw.url ?? ctx.sourceUrl),
    contacts: extractContacts(text),
  });
  if (!r.success) {
    const i = r.error.issues[0];
    return { ownUrl, reason: `${i?.path.join(".") || "gig"}: ${i?.message}` };
  }
  return { gig: r.data, ownUrl };
}

/** Returns the rejection reason, or null if the gig passes. */
export function filterGig(
  g: GigDraft,
  f: { include: string[]; exclude: string[]; windowDays: number },
  now = new Date(),
): string | null {
  if (g.startsAt < now) return "Event already passed";
  if (g.startsAt.getTime() > now.getTime() + f.windowDays * 86_400_000)
    return `More than ${f.windowDays} days away`;
  const hay =
    `${g.title} ${g.description ?? ""} ${g.venue ?? ""} ${g.category ?? ""}`.toLowerCase();
  const hit = (k: string) => hay.includes(k.toLowerCase());
  if (f.include.length && !f.include.some(hit)) return "No include keyword matched";
  const bad = f.exclude.find(hit);
  return bad ? `Excluded keyword: ${bad}` : null;
}
