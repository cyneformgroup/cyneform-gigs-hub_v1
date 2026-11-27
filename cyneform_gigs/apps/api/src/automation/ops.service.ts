import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { getNumber, lt, notifications } from "@cyneform/db";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { env } from "../config/env";
import { DB, type Db } from "../database/database.module";

@Injectable()
export class OpsService {
  private readonly log = new Logger(OpsService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async cleanup() {
    const days = await getNumber("ops.notification_days");
    const before = new Date(Date.now() - days * 86_400_000);
    const [deleted] = await this.db
      .delete(notifications)
      .where(lt(notifications.createdAt, before));
    const tempDir = path.resolve(env.UPLOAD_DIR, "tmp");
    let tempDeleted = 0;
    try {
      for (const entry of await readdir(tempDir)) {
        const file = path.join(tempDir, entry);
        try {
          const info = await stat(file);
          if (info.mtimeMs < Date.now() - 86_400_000) {
            await rm(file, { recursive: true, force: true });
            tempDeleted++;
          }
        } catch {
          // A concurrently removed temporary file needs no further cleanup.
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const count = (deleted as { affectedRows?: number }).affectedRows ?? 0;
    this.log.log(
      `Operations cleanup: ${count} old notifications, ${tempDeleted} temporary uploads removed`,
    );
    return { notifications: count, temporaryUploads: tempDeleted };
  }
}
