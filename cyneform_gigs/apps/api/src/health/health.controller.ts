import type { Pool } from "@cyneform/db/client";
import type { HealthResponse } from "@cyneform/types";
import { Controller, Get, Inject } from "@nestjs/common";
import { DB_POOL } from "../database/database.module";

@Controller("health")
export class HealthController {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  @Get()
  async check(): Promise<HealthResponse> {
    let database: "up" | "down" = "up";
    try {
      await this.pool.query("SELECT 1");
    } catch {
      database = "down";
    }
    return { status: "ok", database, time: new Date().toISOString() };
  }
}
