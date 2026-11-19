import robotsParser from "robots-parser";
import { assertPublicUrl } from "./guard";

const MAX_BYTES = 3_000_000;

/** Native fetch with manual redirects, so every hop passes the private-address guard. */
export async function safeFetch(
  url: string,
  userAgent: string,
  timeoutMs: number,
): Promise<{ res: Response; url: string }> {
  let current = url;
  for (let hop = 0; hop <= 5; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, {
      redirect: "manual",
      headers: {
        "user-agent": userAgent,
        accept: "text/html,application/xhtml+xml,text/calendar;q=0.9,*/*;q=0.5",
        "accept-language": "en",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const next = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && next) {
      current = new URL(next, current).toString();
      continue;
    }
    return { res, url: current };
  }
  throw new Error("Too many redirects");
}

export async function readText(res: Response): Promise<string> {
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("Page too large");
  return (await res.text()).slice(0, MAX_BYTES);
}

type Rule = {
  isAllowed: (url: string) => boolean;
  delay?: number;
  error?: string;
};

/** robots.txt per site, cached for the run. 4xx = allowed; 5xx or unreachable = denied (fail closed). */
export class Robots {
  private readonly cache = new Map<string, Promise<Rule>>();
  private readonly token: string;

  constructor(
    private readonly userAgent: string,
    private readonly timeoutMs: number,
  ) {
    this.token = userAgent.split(/[/\s]/)[0] ?? userAgent;
  }

  private load(origin: string): Promise<Rule> {
    let p = this.cache.get(origin);
    if (!p) {
      p = this.fetchRules(origin);
      this.cache.set(origin, p);
    }
    return p;
  }

  private async fetchRules(origin: string): Promise<Rule> {
    try {
      const { res } = await safeFetch(`${origin}/robots.txt`, this.userAgent, this.timeoutMs);
      if (res.status >= 500)
        return {
          isAllowed: () => false,
          error: `robots.txt unavailable (HTTP ${res.status})`,
        };
      if (res.status >= 400) return { isAllowed: () => true };
      const rules = robotsParser(`${origin}/robots.txt`, (await res.text()).slice(0, 500_000));
      return {
        isAllowed: (u) => rules.isAllowed(u, this.token) !== false,
        delay: rules.getCrawlDelay(this.token),
      };
    } catch (e) {
      return {
        isAllowed: () => false,
        error: `robots.txt unreachable: ${(e as Error).message.slice(0, 120)}`,
      };
    }
  }

  async check(url: string): Promise<{ ok: boolean; error?: string }> {
    const rule = await this.load(new URL(url).origin);
    return { ok: rule.isAllowed(url), error: rule.error };
  }

  async crawlDelay(origin: string): Promise<number | undefined> {
    return (await this.load(origin)).delay;
  }
}
