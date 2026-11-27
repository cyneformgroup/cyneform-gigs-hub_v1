import { sql } from "@cyneform/db";
import { createQueueEvents, QUEUES } from "@cyneform/queue";
import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "../access/auth-user";
import { env } from "../config/env";
import { DB, type Db } from "../database/database.module";

@Controller("health")
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Public()
  @Get()
  async check() {
    const database = await this.db.execute(sql`SELECT 1`).then(
      () => "up" as const,
      () => "down" as const,
    );
    return { status: "ok" as const, database, time: new Date().toISOString() };
  }

  @Public()
  @Get("ready")
  async ready() {
    const [database, redis] = await Promise.all([
      this.db.execute(sql`SELECT 1`).then(
        () => "ok" as const,
        () => "down" as const,
      ),
      (async () => {
        const client = createQueueEvents(QUEUES.events, env.REDIS_URL);
        try {
          await client.waitUntilReady();
          return "ok" as const;
        } catch {
          return "down" as const;
        } finally {
          await client.close().catch(() => undefined);
        }
      })(),
    ]);
    const result = {
      status: database === "ok" && redis === "ok" ? ("ok" as const) : ("error" as const),
      database,
      redis,
      time: new Date().toISOString(),
    };
    if (result.status !== "ok") throw new ServiceUnavailableException(result);
    return result;
  }
}
