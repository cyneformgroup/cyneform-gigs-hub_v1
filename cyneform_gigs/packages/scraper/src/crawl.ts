import type { SourceConfig } from "@cyneform/validators";
import { BasicCrawler, Configuration } from "crawlee";
import { collectLinks, extractIcal, extractJsonLd, extractSelectors, type RawGig } from "./extract";
import { Robots, readText, safeFetch } from "./http";
import type { CrawlError, Tuning } from "./types";

const sameHost = (a: string, b: string) => {
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
};

export async function crawl(startUrls: string[], cfg: SourceConfig, t: Tuning) {
  const raws: RawGig[] = [];
  const errors: CrawlError[] = [];
  let pages = 0;
  let blocked = false;
  const robots = new Robots(t.userAgent, t.timeoutS * 1000);

  // Honour a site's Crawl-delay when it asks for more than our default (capped at 30s).
  let delayMs = t.delayMs;
  for (const origin of new Set(startUrls.map((u) => new URL(u).origin))) {
    const d = await robots.crawlDelay(origin);
    if (d) delayMs = Math.max(delayMs, Math.min(d, 30) * 1000);
  }

  const crawler = new BasicCrawler(
    {
      maxRequestsPerCrawl: t.maxPages,
      maxConcurrency: t.concurrency,
      sameDomainDelaySecs: delayMs / 1000,
      maxRequestRetries: t.retries,
      requestHandlerTimeoutSecs: t.timeoutS + 15,
      requestHandler: async ({ request, addRequests }) => {
        const gate = await robots.check(request.url);
        if (!gate.ok) {
          errors.push({
            url: request.url,
            stage: "robots",
            message: gate.error ?? "Disallowed by robots.txt",
          });
          return;
        }
        const { res, url } = await safeFetch(request.url, t.userAgent, t.timeoutS * 1000);
        if (res.status === 401 || res.status === 403) {
          blocked = true; // never evade: record it, do not retry
          errors.push({
            url: request.url,
            stage: "fetch",
            message: `Access refused (HTTP ${res.status}). Not retrying.`,
          });
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`); // 429 and 5xx are retried
        const text = await readText(res);
        pages++;

        if (cfg.strategy === "ical") {
          raws.push(...extractIcal(text, url));
        } else if (cfg.strategy === "jsonld") {
          const isDetail = request.label === "detail";
          raws.push(...extractJsonLd(text, url, isDetail));
          if (!isDetail && cfg.linkSelector) {
            const links = collectLinks(text, url, cfg.linkSelector).filter((l) => sameHost(l, url));
            await addRequests(links.slice(0, t.maxPages).map((u) => ({ url: u, label: "detail" })));
          }
        } else {
          const { items, next } = extractSelectors(text, url, cfg);
          raws.push(...items);
          if (next && sameHost(next, url) && pages < t.maxPages)
            await addRequests([{ url: next, label: "list" }]);
        }
        t.onPage?.(pages, raws.length);
      },
      failedRequestHandler: async ({ request }, error) => {
        const message = error.message.slice(0, 300);
        errors.push({ url: request.url, stage: "fetch", message });
        if (/HTTP 429/.test(message)) blocked = true;
      },
    },
    new Configuration({ persistStorage: false }),
  );

  await crawler.run(startUrls.map((url) => ({ url, label: "list" })));
  return { raws: raws.slice(0, 2000), pages, errors, blocked };
}
