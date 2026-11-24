import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import {
  and,
  desc,
  eq,
  isNull,
  trainingFiles,
  trainingViews,
  userProfiles,
  users,
} from "@cyneform/db";
import type { TrainingItem, UploadTrainingInput, ViewSession } from "@cyneform/types";
import {
  DEFAULT_WATERMARK,
  renderWatermark,
  TRAINING_MAX_BYTES,
  TRAINING_TYPES,
} from "@cyneform/validators";
import { Inject, Injectable } from "@nestjs/common";
import type { Response } from "express";
import type { AuthUser } from "../access/auth-user";
import { AuditService } from "../audit/audit.service";
import type { ClientInfo } from "../common/client-info";
import { badRequest, forbidden, notFound } from "../common/errors";
import { env } from "../config/env";
import { DB, type Db } from "../database/database.module";
import { NotificationsService } from "../notifications/notifications.service";
import { PointsService } from "../points/points.service";

type FileType = (typeof TRAINING_TYPES)[number];
const TTL = 600_000;
const root = () => path.resolve(env.UPLOAD_DIR);
const mime: Record<FileType, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp4: "video/mp4",
  jpg: "image/jpeg",
  png: "image/png",
};

async function validMagic(file: string, type: FileType) {
  const fh = await open(file, "r");
  try {
    const b = Buffer.alloc(12);
    await fh.read(b, 0, b.length, 0);
    if (type === "pdf") return b.subarray(0, 4).toString() === "%PDF";
    if (type === "png") return b.subarray(0, 4).equals(Buffer.from([137, 80, 78, 71]));
    if (type === "jpg") return b[0] === 255 && b[1] === 216 && b[2] === 255;
    if (type === "mp4") return b.subarray(4, 8).toString() === "ftyp";
    return b.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]));
  } finally {
    await fh.close();
  }
}

@Injectable()
export class TrainingService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(PointsService) private readonly points: PointsService,
  ) {}
  private sign(fileId: string, userId: string, expires: number, mode: "view" | "download") {
    const body = `${fileId}.${userId}.${expires}.${mode}`;
    return `${Buffer.from(body).toString("base64url")}.${createHmac("sha256", env.FILE_URL_SECRET).update(body).digest("base64url")}`;
  }
  private verify(token: string) {
    const [encoded, mac, extra] = token.split(".");
    if (!encoded || !mac || extra) return null;
    try {
      const body = Buffer.from(encoded, "base64url").toString();
      const expected = createHmac("sha256", env.FILE_URL_SECRET).update(body).digest();
      const actual = Buffer.from(mac, "base64url");
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
      const [fileId, userId, expiry, mode, tail] = body.split(".");
      if (
        !fileId ||
        !userId ||
        tail ||
        !["view", "download"].includes(mode) ||
        !Number.isSafeInteger(Number(expiry)) ||
        Number(expiry) < Date.now()
      )
        return null;
      return { fileId, userId, mode: mode as "view" | "download" };
    } catch {
      return null;
    }
  }
  async upload(
    file: Express.Multer.File | undefined,
    input: UploadTrainingInput,
    actor: AuthUser,
    client?: ClientInfo,
  ) {
    if (!file) throw badRequest("NO_FILE", "Choose a file to upload.");
    const tmp = file.path;
    let finalPath: string | undefined;
    try {
      const ext = path
        .extname(file.originalname)
        .slice(1)
        .toLowerCase()
        .replace("jpeg", "jpg") as FileType;
      if (!TRAINING_TYPES.includes(ext))
        throw badRequest("BAD_TYPE", "Allowed types: PDF, DOCX, PPTX, MP4, JPG, PNG.");
      if (file.size > TRAINING_MAX_BYTES)
        throw badRequest("TOO_BIG", "The file is larger than 50 MB.");
      if (!tmp || !(await validMagic(tmp, ext)))
        throw badRequest("BAD_CONTENT", "The file content does not match its type.");
      const folder = (input.folder || "General").trim().replace(/\s+/g, "-").toLowerCase();
      const storedName = `${randomUUID()}.${ext}`;
      const dir = path.join(root(), "training", folder);
      await mkdir(dir, { recursive: true });
      finalPath = path.join(dir, storedName);
      await rename(tmp, finalPath);
      const id = randomUUID();
      await this.db.insert(trainingFiles).values({
        id,
        title: input.title,
        description: input.description ?? null,
        folder,
        originalName: path.basename(file.originalname).slice(0, 255),
        storedName,
        fileType: ext,
        sizeBytes: file.size,
        watermark: input.watermark || DEFAULT_WATERMARK,
        uploadedBy: actor.id,
      });
      await this.notifications.notifyRoles(["bdp"], {
        type: "training.new",
        title: `New training material: ${input.title}`,
        body: `Folder: ${folder}`,
        link: "/training",
      });
      await this.audit.record({
        actor,
        action: "training.uploaded",
        targetType: "training_file",
        targetId: id,
        details: { title: input.title, type: ext, size: file.size },
        client,
      });
      return { id };
    } catch (e) {
      await rm(tmp, { force: true });
      if (finalPath) await rm(finalPath, { force: true });
      throw e;
    }
  }
  async list(actor: AuthUser): Promise<TrainingItem[]> {
    const rows = await this.db
      .select()
      .from(trainingFiles)
      .where(isNull(trainingFiles.deletedAt))
      .orderBy(desc(trainingFiles.createdAt));
    const seen = await this.db
      .selectDistinct({ id: trainingViews.fileId })
      .from(trainingViews)
      .where(eq(trainingViews.userId, actor.id));
    const set = new Set(seen.map((x) => x.id));
    return rows.map((f) => ({
      id: f.id,
      title: f.title,
      description: f.description,
      folder: f.folder,
      fileType: f.fileType as FileType,
      sizeBytes: f.sizeBytes,
      uploadedAt: f.createdAt.toISOString(),
      viewed: set.has(f.id),
    }));
  }
  async remove(id: string, actor: AuthUser, client?: ClientInfo) {
    const [row] = await this.db
      .select({ id: trainingFiles.id })
      .from(trainingFiles)
      .where(and(eq(trainingFiles.id, id), isNull(trainingFiles.deletedAt)))
      .limit(1);
    if (!row) throw notFound("File not found.");
    await this.db
      .update(trainingFiles)
      .set({ deletedAt: new Date() })
      .where(eq(trainingFiles.id, id));
    await this.audit.record({
      actor,
      action: "training.removed",
      targetType: "training_file",
      targetId: id,
      details: {},
      client,
    });
  }
  async startView(id: string, actor: AuthUser, client?: ClientInfo): Promise<ViewSession> {
    const [f] = await this.db
      .select()
      .from(trainingFiles)
      .where(and(eq(trainingFiles.id, id), isNull(trainingFiles.deletedAt)))
      .limit(1);
    if (!f) throw notFound("File not found.");
    const [u] = await this.db
      .select({ name: userProfiles.fullName, no: userProfiles.contractorNumber })
      .from(userProfiles)
      .where(eq(userProfiles.userId, actor.id))
      .limit(1);
    let first = false;
    await this.db.transaction(async (tx) => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, actor.id)).for("update");
      const [prior] = await tx
        .select({ id: trainingViews.id })
        .from(trainingViews)
        .where(and(eq(trainingViews.fileId, id), eq(trainingViews.userId, actor.id)))
        .limit(1);
      first = !prior;
      await tx.insert(trainingViews).values({
        fileId: id,
        userId: actor.id,
        ip: client?.ip?.slice(0, 64) ?? null,
        userAgent: client?.userAgent?.slice(0, 255) ?? null,
      });
    });
    if (first && f.fileType !== "mp4")
      await this.points.award({ userId: actor.id, ruleKey: "training_completed", note: f.title });
    const expiry = Date.now() + TTL;
    const office = f.fileType === "docx" || f.fileType === "pptx";
    return {
      title: f.title,
      fileType: f.fileType as FileType,
      url: `/training/stream/${this.sign(id, actor.id, expiry, "view")}`,
      expiresAt: new Date(expiry).toISOString(),
      watermark: renderWatermark(f.watermark, {
        name: u?.name ?? "BDP",
        contractor: u?.no ?? "",
        date: new Date().toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi" }),
      }),
      downloadable: office,
    };
  }
  async markPlayed(id: string, actor: AuthUser) {
    const [file] = await this.db
      .select({ title: trainingFiles.title, fileType: trainingFiles.fileType })
      .from(trainingFiles)
      .where(and(eq(trainingFiles.id, id), isNull(trainingFiles.deletedAt)))
      .limit(1);
    if (!file) throw notFound("File not found.");
    if (file.fileType !== "mp4")
      throw badRequest("NOT_VIDEO", "Playback tracking is only available for videos.");
    let award = false;
    await this.db.transaction(async (tx) => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, actor.id)).for("update");
      const [view] = await tx
        .select({ id: trainingViews.id })
        .from(trainingViews)
        .where(and(eq(trainingViews.fileId, id), eq(trainingViews.userId, actor.id)))
        .orderBy(desc(trainingViews.viewedAt))
        .limit(1);
      if (!view) throw notFound("Open this video before starting playback.");
      const [played] = await tx
        .select({ id: trainingViews.id })
        .from(trainingViews)
        .where(
          and(
            eq(trainingViews.fileId, id),
            eq(trainingViews.userId, actor.id),
            eq(trainingViews.played, true),
          ),
        )
        .limit(1);
      if (!played) {
        award = true;
        await tx.update(trainingViews).set({ played: true }).where(eq(trainingViews.id, view.id));
      }
    });
    if (award)
      await this.points.award({
        userId: actor.id,
        ruleKey: "training_completed",
        note: file.title,
      });
  }
  async downloadLink(id: string, actor: AuthUser, client?: ClientInfo) {
    const [f] = await this.db
      .select()
      .from(trainingFiles)
      .where(and(eq(trainingFiles.id, id), isNull(trainingFiles.deletedAt)))
      .limit(1);
    if (!f) throw notFound("File not found.");
    if (f.fileType !== "docx" && f.fileType !== "pptx")
      throw forbidden("Download is not available for this file type.");
    await this.audit.record({
      actor,
      action: "training.download",
      targetType: "training_file",
      targetId: id,
      details: {},
      client,
    });
    return { url: `/training/stream/${this.sign(id, actor.id, Date.now() + TTL, "download")}` };
  }
  async stream(token: string, actor: AuthUser, range: string | undefined, res: Response) {
    const t = this.verify(token);
    if (!t || t.userId !== actor.id)
      throw forbidden("INVALID_LINK", "This link is invalid or has expired.");
    const [f] = await this.db
      .select()
      .from(trainingFiles)
      .where(and(eq(trainingFiles.id, t.fileId), isNull(trainingFiles.deletedAt)))
      .limit(1);
    if (!f) throw notFound("File not found.");
    if ((t.mode === "download") !== (f.fileType === "docx" || f.fileType === "pptx"))
      throw forbidden("INVALID_LINK", "This link is invalid or has expired.");
    const base = path.resolve(root(), "training");
    const file = path.resolve(base, f.folder, f.storedName);
    if (!file.startsWith(`${base}${path.sep}`)) throw forbidden();
    const size = (await stat(file)).size;
    let start = 0;
    let end = size - 1;
    let status = 200;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!m || (!m[1] && !m[2])) {
        res.status(416).setHeader("Content-Range", `bytes */${size}`).end();
        return;
      }
      if (m[1]) {
        start = Number(m[1]);
        end = m[2] ? Math.min(Number(m[2]), end) : end;
      } else start = Math.max(0, size - Number(m[2]));
      if (start > end || start >= size) {
        res.status(416).setHeader("Content-Range", `bytes */${size}`).end();
        return;
      }
      status = 206;
    }
    res
      .status(status)
      .setHeader("Content-Type", mime[f.fileType as FileType])
      .setHeader("Content-Length", String(end - start + 1))
      .setHeader("Accept-Ranges", "bytes")
      .setHeader("Cache-Control", "no-store, private")
      .setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Disposition",
      t.mode === "download"
        ? `attachment; filename="${f.title.replace(/[^\w .-]/g, "_")}.${f.fileType}"`
        : "inline",
    );
    if (status === 206) res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    createReadStream(file, { start, end }).pipe(res);
  }
}
