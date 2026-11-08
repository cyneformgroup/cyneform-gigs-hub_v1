import { auditLogs, desc } from "@cyneform/db";
import { Inject, Injectable } from "@nestjs/common";
import type { ClientInfo } from "../common/client-info";
import { sha256 } from "../common/crypto";
import { DB, type Db } from "../database/database.module";

export interface AuditEntry {
  actor?: { id: string; role: string } | null; // null = system
  action: string; // category.action
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  client?: ClientInfo;
}

/** Append-only audit trail. Each row hashes the one before it, so tampering is detectable. */
@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  record(e: AuditEntry): Promise<void> {
    return this.db.transaction(async (tx) => {
      const [last] = await tx
        .select({ hash: auditLogs.rowHash })
        .from(auditLogs)
        .orderBy(desc(auditLogs.id))
        .limit(1)
        .for("update");
      const prevHash = last?.hash ?? null;
      const occurredAt = new Date();
      const rowHash = sha256(
        Buffer.concat([
          prevHash ?? Buffer.alloc(0),
          Buffer.from(
            JSON.stringify([
              occurredAt.toISOString(),
              e.actor?.id ?? null,
              e.action,
              e.targetType ?? null,
              e.targetId ?? null,
              e.details ?? null,
            ]),
          ),
        ]),
      );
      await tx.insert(auditLogs).values({
        occurredAt,
        actorUserId: e.actor?.id ?? null,
        actorRole: e.actor?.role ?? null,
        action: e.action,
        targetType: e.targetType ?? null,
        targetId: e.targetId ?? null,
        details: e.details ?? null,
        ipAddress: e.client?.ip ?? null,
        userAgent: e.client?.userAgent ?? null,
        prevHash,
        rowHash,
      });
    });
  }
}
