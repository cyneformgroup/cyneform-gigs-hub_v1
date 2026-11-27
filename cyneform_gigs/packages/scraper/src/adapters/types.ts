import type { RawGig } from "../extract";
import type { CrawlError, Tuning } from "../types";

export type AdapterResult = {
  raws: RawGig[];
  pages: number;
  errors: CrawlError[];
  blocked: boolean;
};
export type Adapter = (ctx: {
  startUrls: string[];
  params: Record<string, string>;
  tuning: Tuning;
}) => Promise<AdapterResult>;
