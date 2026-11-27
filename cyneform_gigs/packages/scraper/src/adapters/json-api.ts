import { Robots, readText, safeFetch } from "../http";
import type { Adapter } from "./types";

const get = (value: unknown, path?: string): unknown => {
  if (!path) return undefined;
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object") return (current as Record<string, unknown>)[key];
    return undefined;
  }, value);
};
const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim() || undefined
    : undefined;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sameHost = (a: string, b: string) => {
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
};

export const jsonApi: Adapter = async ({ startUrls, params, tuning }) => {
  const raws: import("../extract").RawGig[] = [];
  const errors: import("../types").CrawlError[] = [];
  const robots = new Robots(tuning.userAgent, tuning.timeoutS * 1000);
  let pages = 0;
  let blocked = false;
  if (!params.title) {
    return {
      raws,
      pages,
      errors: [
        { url: startUrls[0] ?? "", stage: "parse", message: 'The "title" setting is required' },
      ],
      blocked,
    };
  }

  for (const start of startUrls) {
    let next: string | undefined = start;
    const requestedDelay = await robots.crawlDelay(new URL(start).origin);
    const pageDelay = Math.max(
      tuning.delayMs,
      requestedDelay ? Math.min(requestedDelay, 30) * 1000 : 0,
    );
    while (next && pages < tuning.maxPages) {
      const url = next;
      next = undefined;
      try {
        const gate = await robots.check(url);
        if (!gate.ok) {
          errors.push({ url, stage: "robots", message: gate.error ?? "Disallowed by robots.txt" });
          break;
        }
        const { res, url: finalUrl } = await safeFetch(
          url,
          tuning.userAgent,
          tuning.timeoutS * 1000,
        );
        const finalGate = await robots.check(finalUrl);
        if (!finalGate.ok) {
          errors.push({
            url: finalUrl,
            stage: "robots",
            message: finalGate.error ?? "Disallowed by robots.txt",
          });
          break;
        }
        if ([401, 403, 429].includes(res.status)) {
          blocked = true;
          errors.push({ url, stage: "fetch", message: `HTTP ${res.status}. Not retrying.` });
          break;
        }
        if (!res.ok) {
          errors.push({ url, stage: "fetch", message: `HTTP ${res.status}` });
          break;
        }
        const body = await readText(res);
        let json: unknown;
        try {
          json = JSON.parse(body);
        } catch {
          errors.push({ url, stage: "parse", message: "Response was not valid JSON" });
          break;
        }
        const items = get(json, params.itemsPath) ?? json;
        if (!Array.isArray(items)) {
          errors.push({ url, stage: "parse", message: "Items path did not lead to a list" });
          break;
        }
        pages++;
        for (const item of items) {
          const link = text(get(item, params.url));
          let eventUrl: string | undefined;
          try {
            if (link) eventUrl = new URL(link, params.baseUrl ?? finalUrl).toString();
          } catch {
            // Invalid URLs are left absent and rejected by normal validation.
          }
          raws.push({
            title: text(get(item, params.title)),
            url: eventUrl,
            date: text(get(item, params.date)),
            endDate: text(get(item, params.endDate)),
            venue: text(get(item, params.venue)),
            description: text(get(item, params.description)),
            organizer: text(get(item, params.organizer)),
            price: text(get(item, params.price)),
            contact: text(get(item, params.contact)),
          });
        }
        tuning.onPage?.(pages, raws.length);
        const cursor = text(get(json, params.nextPath));
        if (cursor) {
          const candidate = new URL(cursor, finalUrl).toString();
          if (sameHost(candidate, finalUrl)) next = candidate;
        }
      } catch (error) {
        errors.push({ url, stage: "fetch", message: (error as Error).message.slice(0, 300) });
        break;
      }
      await sleep(pageDelay);
    }
    if (blocked) break;
  }
  return { raws: raws.slice(0, 2000), pages, errors, blocked };
};
