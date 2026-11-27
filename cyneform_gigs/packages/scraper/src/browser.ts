import type { SourceConfig } from "@cyneform/validators";
import { chromium } from "playwright-core";
import { extractSelectors, type RawGig } from "./extract";
import { assertPublicUrl } from "./guard";
import { Robots } from "./http";
import type { CrawlError, Tuning } from "./types";

type BrowserConfig = Extract<SourceConfig, { strategy: "browser" }>;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sameHost = (a: string, b: string) => {
  try {
    return new URL(a).hostname === new URL(b).hostname;
  } catch {
    return false;
  }
};

export async function crawlBrowser(startUrls: string[], cfg: BrowserConfig, tuning: Tuning) {
  const raws: RawGig[] = [];
  const errors: CrawlError[] = [];
  let pages = 0;
  let blocked = false;
  const robots = new Robots(tuning.userAgent, tuning.timeoutS * 1000);
  const approvedUrls: string[] = [];
  for (const url of startUrls) {
    try {
      await assertPublicUrl(url);
      const gate = await robots.check(url);
      if (!gate.ok)
        errors.push({ url, stage: "robots", message: gate.error ?? "Disallowed by robots.txt" });
      else approvedUrls.push(url);
    } catch (error) {
      errors.push({ url, stage: "fetch", message: (error as Error).message.slice(0, 300) });
    }
  }
  if (approvedUrls.length === 0) return { raws, pages, errors, blocked };

  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  try {
    browser = await chromium.launch({ headless: true, channel: "chromium" });
  } catch (error) {
    const message = `Browser launch failed: ${(error as Error).message.slice(0, 250)}`;
    for (const url of approvedUrls) errors.push({ url, stage: "fetch", message });
    return { raws, pages, errors, blocked };
  }
  try {
    const context = await browser.newContext({
      userAgent: tuning.userAgent,
      javaScriptEnabled: true,
      viewport: { width: 1280, height: 900 },
    });
    let deniedByRobots: string | undefined;
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = request.url();
      const resource = request.resourceType();
      if (["image", "media", "font"].includes(resource)) return route.abort();
      if (["data:", "blob:", "about:"].some((prefix) => url.startsWith(prefix)))
        return route.continue();
      try {
        await assertPublicUrl(url);
        if (resource === "document") {
          const rule = await robots.check(url);
          if (!rule.ok) {
            deniedByRobots = rule.error ?? "Disallowed by robots.txt";
            return route.abort();
          }
        }
      } catch {
        return route.abort();
      }
      return route.continue();
    });

    for (const start of approvedUrls) {
      let next: string | undefined = start;
      let hops = 0;
      const requestedDelay = await robots.crawlDelay(new URL(start).origin);
      const pageDelay = Math.max(
        tuning.delayMs,
        requestedDelay ? Math.min(requestedDelay, 30) * 1000 : 0,
      );
      while (next && pages < tuning.maxPages) {
        const url = next;
        next = undefined;
        try {
          await assertPublicUrl(url);
          const gate = await robots.check(url);
          if (!gate.ok) {
            errors.push({
              url,
              stage: "robots",
              message: gate.error ?? "Disallowed by robots.txt",
            });
            break;
          }
          const page = await context.newPage();
          try {
            const response = await page.goto(url, {
              waitUntil: "domcontentloaded",
              timeout: tuning.timeoutS * 1000,
            });
            const status = response?.status() ?? 0;
            if ([401, 403, 429].includes(status)) {
              blocked = true;
              errors.push({ url, stage: "fetch", message: `HTTP ${status}. Not retrying.` });
              break;
            }
            if (status >= 400) {
              errors.push({ url, stage: "fetch", message: `HTTP ${status}` });
              break;
            }
            const landed = page.url();
            await assertPublicUrl(landed);
            const finalGate = await robots.check(landed);
            if (!finalGate.ok) {
              errors.push({
                url: landed,
                stage: "robots",
                message: finalGate.error ?? "Disallowed by robots.txt",
              });
              break;
            }
            if (cfg.waitFor)
              await page.waitForSelector(cfg.waitFor, { timeout: 10_000 }).catch(() => undefined);
            else
              await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
            for (let i = 0; i < cfg.scrolls; i++) {
              await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
              await page.waitForTimeout(Math.max(800, tuning.delayMs));
            }
            pages++;
            const result = extractSelectors(await page.content(), landed, cfg);
            raws.push(...result.items);
            tuning.onPage?.(pages, raws.length);
            if (result.next && sameHost(result.next, landed) && ++hops < tuning.maxPages)
              next = result.next;
          } finally {
            await page.close();
          }
        } catch (error) {
          const message = (error as Error).message.slice(0, 300);
          if (deniedByRobots) {
            errors.push({ url, stage: "robots", message: deniedByRobots });
            deniedByRobots = undefined;
          } else {
            errors.push({ url, stage: "fetch", message });
          }
          break;
        }
        await sleep(pageDelay);
      }
      if (blocked) break;
    }
  } finally {
    await browser.close();
  }
  return { raws: raws.slice(0, 2000), pages, errors, blocked };
}
