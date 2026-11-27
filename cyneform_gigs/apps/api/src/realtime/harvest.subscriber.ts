import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Redis } from "ioredis";
import type { RealtimeGateway } from "./realtime.gateway";

export const HARVEST_CHANNEL = "harvest:events";

@Injectable()
export class HarvestSubscriber implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(HarvestSubscriber.name);
  private sub: Redis | null = null;

  constructor(private readonly gateway: RealtimeGateway) {}

  async onModuleInit() {
    this.sub = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
    this.sub.on("error", (e) => this.log.warn(`redis subscriber: ${e.message}`));
    await this.sub.subscribe(HARVEST_CHANNEL);
    this.sub.on("message", (_ch, msg) => {
      try {
        this.gateway.toHarvest(JSON.parse(msg));
      } catch {
        // Ignore malformed event payloads.
      }
    });
  }

  onModuleDestroy() {
    this.sub?.disconnect();
  }
}
