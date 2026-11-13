import type { SourceConfig } from "@cyneform/validators";
import * as cheerio from "cheerio";

export type RawGig = {
  title?: string;
  description?: string;
  url?: string;
  date?: string;
  endDate?: string;
  venue?: string;
  address?: string;
  organizer?: string;
  price?: string;
  currency?: string;
  contact?: string;
};

// biome-ignore lint/suspicious/noExplicitAny: JSON-LD and cheerio scopes are loosely typed
type Json = any;

const clean = (s: unknown) =>
  typeof s === "string" ? s.replace(/\s+/g, " ").trim() || undefined : undefined;
const abs = (href: string | undefined, base: string) => {
  try {
    return href ? new URL(href, base).toString() : undefined;
  } catch {
    return undefined;
  }
};
const nameOf = (v: Json): string | undefined =>
  typeof v === "string"
    ? clean(v)
    : Array.isArray(v)
      ? nameOf(v[0])
      : v && typeof v === "object"
        ? nameOf(v.name)
        : undefined;

// ---- JSON-LD (schema.org Event) ----
function walk(node: Json, out: Json[]) {
  if (Array.isArray(node)) {
    node.forEach((n) => {
      walk(n, out);
    });
    return;
  }
  if (!node || typeof node !== "object") return;
  if ([].concat(node["@type"] ?? []).some((t) => /Event$/.test(String(t)))) out.push(node);
  for (const k of ["@graph", "itemListElement", "item"]) if (node[k]) walk(node[k], out);
}

/** isDetail: the page itself is the event, so its URL is the gig's own URL. */
export function extractJsonLd(html: string, pageUrl: string, isDetail: boolean): RawGig[] {
  const $ = cheerio.load(html);
  const events: Json[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      walk(JSON.parse($(el).text()), events);
    } catch {
      /* ignore broken blocks */
    }
  });
  return events.map((e) => {
    const loc = Array.isArray(e.location) ? e.location[0] : e.location;
    const offer = Array.isArray(e.offers) ? e.offers[0] : e.offers;
    const a = loc?.address;
    return {
      title: clean(e.name),
      description: clean(cheerio.load(String(e.description ?? "")).text()),
      url: abs(clean(e.url), pageUrl) ?? (isDetail ? pageUrl : undefined),
      date: clean(e.startDate),
      endDate: clean(e.endDate),
      venue: nameOf(loc),
      address:
        typeof a === "string"
          ? clean(a)
          : clean([a?.streetAddress, a?.addressLocality].filter(Boolean).join(", ")),
      organizer: nameOf(e.organizer ?? e.performer),
      price: offer?.price != null ? String(offer.price) : undefined,
      currency: clean(offer?.priceCurrency),
    };
  });
}

export function collectLinks(html: string, pageUrl: string, selector: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $(selector).each((_, el) => {
    const u = abs($(el).attr("href"), pageUrl);
    if (u) urls.add(u);
  });
  return [...urls];
}

// ---- CSS selectors ----
function pick(scope: Json, spec: string | undefined, base: string): string | undefined {
  if (!spec) return undefined;
  const i = spec.lastIndexOf("@");
  const css = i < 0 ? spec : spec.slice(0, i);
  const attr = i < 0 ? undefined : spec.slice(i + 1);
  const el = !css ? scope : scope.is(css) ? scope : scope.find(css).first();
  if (!el.length) return undefined;
  const v = attr ? el.attr(attr) : el.text();
  return attr === "href" || attr === "src" ? abs(clean(v), base) : clean(v);
}

export function extractSelectors(
  html: string,
  pageUrl: string,
  cfg: Extract<SourceConfig, { strategy: "selectors" }>,
) {
  const $ = cheerio.load(html);
  const f = cfg.fields;
  const items: RawGig[] = [];
  $(cfg.itemSelector).each((_, el) => {
    const s = $(el);
    items.push({
      title: pick(s, f.title, pageUrl),
      url: pick(s, f.link, pageUrl),
      date: pick(s, f.date, pageUrl),
      venue: pick(s, f.venue, pageUrl),
      description: pick(s, f.description, pageUrl),
      organizer: pick(s, f.organizer, pageUrl),
      price: pick(s, f.price, pageUrl),
      contact: pick(s, f.contact, pageUrl),
    });
  });
  return {
    items,
    next: cfg.nextSelector ? pick($.root(), cfg.nextSelector, pageUrl) : undefined,
  };
}

// ---- iCal (.ics) feeds ----
const icsDate = (v?: string) => {
  const m = v?.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return v;
  // Floating or TZID times are assumed to be Nairobi time.
  return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}${m[7] ? "Z" : "+03:00"}`;
};

export function extractIcal(body: string, pageUrl: string): RawGig[] {
  const text = body.replace(/\r?\n[ \t]/g, ""); // unfold long lines
  return text
    .split("BEGIN:VEVENT")
    .slice(1)
    .map((block) => {
      const get = (k: string) => {
        const m = block.match(new RegExp(`^${k}[^:\\n]*:(.*)$`, "mi"));
        return m?.[1] ? clean(m[1].replace(/\\n/gi, " ").replace(/\\,/g, ",")) : undefined;
      };
      return {
        title: get("SUMMARY"),
        description: get("DESCRIPTION"),
        venue: get("LOCATION"),
        date: icsDate(get("DTSTART")),
        endDate: icsDate(get("DTEND")),
        url: get("URL") ?? undefined,
        organizer: undefined,
        ...(get("URL") ? {} : { url: undefined }),
        contact: pageUrl && undefined,
      };
    });
}
