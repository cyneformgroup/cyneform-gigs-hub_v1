import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { diskStorage } from "multer";
import { type AuthUser, CurrentUser, RequirePermissions } from "../access/auth-user";
import { clientInfo } from "../common/client-info";
import { env } from "../config/env";
import type { UploadTrainingDto } from "./training.dto";
import { TrainingService } from "./training.service";

const tempDir = path.resolve(env.UPLOAD_DIR, "tmp");
mkdirSync(tempDir, { recursive: true });

@Controller("training")
export class TrainingController {
  constructor(@Inject(TrainingService) private readonly training: TrainingService) {}
  @RequirePermissions("training.view")
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.training.list(user);
  }
  @RequirePermissions("training.manage")
  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: tempDir,
        filename: (_req, _file, cb) => cb(null, randomUUID()),
      }),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadTrainingDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.training.upload(file, dto, user, clientInfo(req));
  }
  @RequirePermissions("training.view")
  @Get("stream/:token")
  stream(
    @Param("token") token: string,
    @Headers("range") range: string | undefined,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    return this.training.stream(token, user, range, res);
  }
  @RequirePermissions("training.view")
  @Post(":id/view")
  view(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.training.startView(id, user, clientInfo(req));
  }
  @RequirePermissions("training.view")
  @Post(":id/play")
  @HttpCode(204)
  play(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.training.markPlayed(id, user);
  }
  @RequirePermissions("training.view")
  @Post(":id/download")
  download(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.training.downloadLink(id, user, clientInfo(req));
  }
  @RequirePermissions("training.manage")
  @Delete(":id")
  @HttpCode(204)
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.training.remove(id, user, clientInfo(req));
  }
}
