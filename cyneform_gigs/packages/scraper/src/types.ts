import type { GigDraft, SourceConfig } from "@cyneform/validators";

export type SourceSpec = {
  startUrls: string[];
  config: SourceConfig;
  category: string | null;
  include: string[];
  exclude: string[];
};
export type Tuning = {
  maxPages: number;
  delayMs: number;
  concurrency: number;
  timeoutS: number;
  retries: number;
  windowDays: number;
  userAgent: string;
};
export type CrawlError = {
  url: string;
  stage: "robots" | "fetch" | "parse";
  message: string;
};
export type Found = { gig: GigDraft; fingerprint: string; ownUrl: boolean };
