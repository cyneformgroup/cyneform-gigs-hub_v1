import { jsonApi } from "./json-api";
import type { Adapter } from "./types";

export const ADAPTERS: Record<string, Adapter> = { "json-api": jsonApi };
export const ADAPTER_NAMES = Object.keys(ADAPTERS);
export type { Adapter, AdapterResult } from "./types";
