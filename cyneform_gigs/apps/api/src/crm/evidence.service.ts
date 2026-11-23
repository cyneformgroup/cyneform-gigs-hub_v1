import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { and, count, crmEntries, crmFiles, eq } from "@cyneform/db";
import { Inject, Injectable } from "@nestjs/common";
import type { AuthUser } from "../access/auth-user";
import type { AuditService } from "../audit/audit.service";
import type { ClientInfo } from "../common/client-info";
import { badRequest, notFound } from "../common/errors";
import { env } from "../config/env";
import { DB, type Db } from "../database/database.module";
import type { PointsService } from "../points/points.service";
import type { CrmService } from "./crm.service";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 10;
const TYPES: { mime: string; ext: string; magic: number[] }[] = [
  { mime: "image/jpeg", ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  { mime: "image/png", ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "application/pdf", ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46] },
];
const ROOT = () => resolve(env.UPLOAD_DIR);

@Injectable()
export class EvidenceService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly crm: CrmService,
    private readonly points: PointsService,
  ) {}

  async upload(
    entryId: string,
    file: { buffer: Buffer; originalname: string; size: number } | undefined,
    actor: AuthUser,
    client?: ClientInfo,
  ) {
    if (!file) throw badRequest("NO_FILE", "Please choose a file.");
    if (file.size > MAX_BYTES) throw badRequest("TOO_LARGE", "File exceeds 10MB limit.");
    const type = TYPES.find((t) => t.magic.every((b, i) => file.buffer[i] === b));
    if (!type) throw badRequest("BAD_TYPE", "Evidence must be a JPG, PNG or PDF file.");

    const [e] = await this.db.select().from(crmEntries).where(eq(crmEntries.id, entryId)).limit(1);
    if (!e || e.userId !== actor.id) throw notFound("CRM entry not found.");
    const [c] = await this.db
      .select({ n: count() })
      .from(crmFiles)
      .where(eq(crmFiles.entryId, entryId));
    const before = Number(c?.n ?? 0);
    if (before >= MAX_FILES)
      throw badRequest("TOO_MANY", `An entry can hold up to ${MAX_FILES} files.`);

    const key = `${entryId}/${randomUUID()}.${type.ext}`;
    await mkdir(join(ROOT(), entryId), { recursive: true });
    await writeFile(join(ROOT(), key), file.buffer, { flag: "wx", mode: 0o640 });
    const name =
      file.originalname.replace(/[^\w. -]/g, "_").slice(0, 200) || `evidence.${type.ext}`;
    await this.db.insert(crmFiles).values({
      entryId,
      userId: actor.id,
      originalName: name,
      mime: type.mime,
      size: file.size,
      storageKey: key,
      sha256: createHash("sha256").update(file.buffer).digest("hex"),
    });
    await this.audit.record({
      actor,
      action: "crm.evidence_uploaded",
      targetType: "crm_entry",
      targetId: entryId,
      details: { mime: type.mime, size: file.size },
      client,
    });
    if (before === 0) {
      await this.points
        .award({
          userId: e.userId,
          ruleKey: "evidence_uploaded",
          leadId: e.leadId,
          crmEntryId: e.id,
        })
        .catch(() => undefined);
    }
    await this.crm.evaluateCompletion(entryId);
    return this.crm.detail(entryId, actor);
  }

  private async file(id: string, actor: AuthUser) {
    const [row] = await this.db
      .select({ f: crmFiles, owner: crmEntries.userId, done: crmEntries.isCompleted })
      .from(crmFiles)
      .innerJoin(crmEntries, eq(crmEntries.id, crmFiles.entryId))
      .where(eq(crmFiles.id, id))
      .limit(1);
    if (!row || (row.owner !== actor.id && !actor.permissions.has("crm.view_all")))
      throw notFound("File not found.");
    return row;
  }

  async open(id: string, actor: AuthUser) {
    const { f } = await this.file(id, actor);
    return {
      stream: createReadStream(join(ROOT(), f.storageKey)),
      mime: f.mime,
      name: f.originalName,
    };
  }

  async remove(id: string, actor: AuthUser, client?: ClientInfo) {
    const { f, owner, done } = await this.file(id, actor);
    if (owner !== actor.id) throw notFound("File not found.");
    const [c] = await this.db
      .select({ n: count() })
      .from(crmFiles)
      .where(eq(crmFiles.entryId, f.entryId));
    if (done && Number(c?.n ?? 0) <= 1)
      throw badRequest(
        "LAST_FILE",
        "A completed entry must keep at least one evidence file. Upload a new one first.",
      );
    await this.db.delete(crmFiles).where(and(eq(crmFiles.id, id)));
    await unlink(join(ROOT(), f.storageKey)).catch(() => undefined);
    await this.audit.record({
      actor,
      action: "crm.evidence_deleted",
      targetType: "crm_entry",
      targetId: f.entryId,
      details: { fileId: id },
      client,
    });
  }
}
