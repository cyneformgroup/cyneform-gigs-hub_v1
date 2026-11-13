import type { SourceConfig } from "@cyneform/validators";
import { CheerioCrawler, Configuration } from "crawlee";
import { collectLinks, extractIcal, extractJsonLd, extractSelectors, type RawGig } from "./extract";
import { assertPublicUrl } from "./guard";
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

  const crawler = new CheerioCrawler(
    {
      maxRequestsPerCrawl: t.maxPages,
      maxConcurrency: t.concurrency,
      sameDomainDelaySecs: t.delayMs / 1000,
      maxRequestRetries: t.retries,
      requestHandlerTimeoutSecs: t.timeoutS,
      respectRobotsTxtFile: true,
      additionalMimeTypes: ["text/calendar", "text/plain"],
      preNavigationHooks: [
        async (ctx, gotOptions) => {
          await assertPublicUrl(ctx.request.url);
          gotOptions.headers = {
            ...gotOptions.headers,
            "user-agent": t.userAgent,
          };
        },
      ],
      onSkippedRequest: ({ url, reason }) => {
        if (reason === "robotsTxt")
          errors.push({
            url,
            stage: "robots",
            message: "Disallowed by robots.txt",
          });
      },
      requestHandler: async ({ request, body, addRequests }) => {
        const url = request.loadedUrl ?? request.url;
        await assertPublicUrl(url); // after redirects
        pages++;
        const html = typeof body === "string" ? body : body.toString("utf8");

        if (cfg.strategy === "ical") {
          raws.push(...extractIcal(html, url));
        } else if (cfg.strategy === "jsonld") {
          const isDetail = request.label === "detail";
          raws.push(...extractJsonLd(html, url, isDetail));
          if (!isDetail && cfg.linkSelector) {
            const links = collectLinks(html, url, cfg.linkSelector).filter((l) => sameHost(l, url));
            await addRequests(links.slice(0, t.maxPages).map((u) => ({ url: u, label: "detail" })));
          }
        } else {
          const { items, next } = extractSelectors(html, url, cfg);
          raws.push(...items);
          if (next && sameHost(next, url) && pages < t.maxPages)
            await addRequests([{ url: next, label: "list" }]);
        }
      },
      failedRequestHandler: async ({ request }, error) => {
        const message = error.message.slice(0, 300);
        errors.push({ url: request.url, stage: "fetch", message });
        if (/\b(401|403|429)\b/.test(message)) blocked = true; // never evade: mark blocked and stop
      },
    },
    new Configuration({ persistStorage: false }),
  );

  await crawler.run(startUrls.map((url) => ({ url, label: "list" })));
  return { raws: raws.slice(0, 2000), pages, errors, blocked };
}
