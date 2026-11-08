import { sql } from "@cyneform/db";
import { Controller, Get, Inject } from "@nestjs/common";
import { Public } from "../access/auth-user";
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
}
