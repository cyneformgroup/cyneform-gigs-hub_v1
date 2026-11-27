import { randomBytes } from "node:crypto";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";

@Injectable()
export class TicketService implements OnModuleDestroy {
  private readonly redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 2,
  });

  async issue(userId: string, live: boolean): Promise<string> {
    const ticket = randomBytes(24).toString("base64url");
    await this.redis.set(`rt:ticket:${ticket}`, JSON.stringify({ userId, live }), "EX", 30);
    return ticket;
  }

  async consume(ticket: string): Promise<{ userId: string; live: boolean } | null> {
    const raw = await this.redis.getdel(`rt:ticket:${ticket}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as { userId: string; live: boolean };
    } catch {
      return null;
    }
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }
}
