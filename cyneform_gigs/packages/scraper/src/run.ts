import { crawl } from "./crawl";
import { filterGig, fingerprint, normalize } from "./normalize";
import type { Found, SourceSpec, Tuning } from "./types";

export async function runSource(spec: SourceSpec, t: Tuning) {
  const c = await crawl(spec.startUrls, spec.config, t);
  const seen = new Set<string>();
  const gigs: Found[] = [];
  const rejected: { title: string; reason: string }[] = [];

  for (const raw of c.raws) {
    const n = normalize(raw, {
      category: spec.category,
      sourceUrl: spec.startUrls[0] ?? "",
    });
    if (!n.gig) {
      rejected.push({
        title: raw.title ?? "(untitled)",
        reason: n.reason ?? "Invalid",
      });
      continue;
    }
    const why = filterGig(n.gig, {
      include: spec.include,
      exclude: spec.exclude,
      windowDays: t.windowDays,
    });
    if (why) {
      rejected.push({ title: n.gig.title, reason: why });
      continue;
    }
    const fp = fingerprint(n.gig);
    if (seen.has(fp)) continue;
    seen.add(fp);
    gigs.push({ gig: n.gig, fingerprint: fp, ownUrl: n.ownUrl });
  }
  return {
    gigs,
    rejected,
    found: c.raws.length,
    pages: c.pages,
    errors: c.errors,
    blocked: c.blocked,
  };
}
