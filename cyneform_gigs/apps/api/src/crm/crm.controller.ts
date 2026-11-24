import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { memoryStorage } from "multer";
import { type AuthUser, CurrentUser, RequirePermissions } from "../access/auth-user";
import { clientInfo } from "../common/client-info";
// biome-ignore lint/style/useImportType: Nest needs runtime DTO constructors for Zod validation metadata.
import { ChangeEntryStatusDto, EntryQueryDto, FlagEntryDto, UpdateEntryDto } from "./crm.dto";
import { CrmService } from "./crm.service";
import { EvidenceService } from "./evidence.service";

@Controller("crm")
export class CrmController {
  constructor(
    @Inject(CrmService) private readonly crm: CrmService,
    @Inject(EvidenceService) private readonly evidence: EvidenceService,
  ) {}

  @RequirePermissions("crm.view_own")
  @Get()
  list(@Query() q: EntryQueryDto, @CurrentUser() actor: AuthUser) {
    return this.crm.list(q, actor);
  }

  // Static "files" routes come before ":id".
  @RequirePermissions("crm.view_own")
  @Get("files/:fileId")
  async download(
    @Param("fileId", ParseUUIDPipe) fileId: string,
    @CurrentUser() actor: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const f = await this.evidence.open(fileId, actor);
    res.set({
      "Content-Type": f.mime,
      "Content-Disposition": `attachment; filename="${f.name.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    });
    return new StreamableFile(f.stream);
  }

  @RequirePermissions("crm.edit_own")
  @Delete("files/:fileId")
  @HttpCode(204)
  removeFile(
    @Param("fileId", ParseUUIDPipe) fileId: string,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.evidence.remove(fileId, actor, clientInfo(req));
  }

  @RequirePermissions("crm.view_own")
  @Get(":id")
  detail(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.crm.detail(id, actor);
  }

  @RequirePermissions("crm.edit_own")
  @Patch(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateEntryDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.crm.update(id, dto, actor, clientInfo(req));
  }

  @RequirePermissions("crm.edit_own")
  @Post(":id/status")
  @HttpCode(200)
  status(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ChangeEntryStatusDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.crm.changeStatus(id, dto, actor, clientInfo(req));
  }

  @RequirePermissions("crm.flag")
  @Post(":id/flag")
  @HttpCode(200)
  flag(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: FlagEntryDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.crm.flag(id, dto, actor, clientInfo(req));
  }

  @RequirePermissions("crm.edit_own")
  @Post(":id/evidence")
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; size: number } | undefined,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.evidence.upload(id, file, actor, clientInfo(req));
  }
}
