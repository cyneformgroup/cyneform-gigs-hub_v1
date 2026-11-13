import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { type AuthUser, CurrentUser, RequirePermissions } from "../access/auth-user";
import { clientInfo } from "../common/client-info";
import type { RunQueryDto, SourceInputDto } from "./sources.dto";
import { SourcesService } from "./sources.service";

@Controller("sources")
export class SourcesController {
  constructor(@Inject(SourcesService) private readonly sources: SourcesService) {}

  @RequirePermissions("sources.view")
  @Get()
  list() {
    return this.sources.list();
  }

  @RequirePermissions("sources.view")
  @Get("runs")
  runs(@Query() q: RunQueryDto) {
    return this.sources.runs(q);
  }

  @RequirePermissions("sources.view")
  @Get("runs/:id")
  run(@Param("id", ParseUUIDPipe) id: string) {
    return this.sources.run(id);
  }

  @RequirePermissions("sources.manage")
  @Post("test")
  @HttpCode(200)
  test(@Body() dto: SourceInputDto) {
    return this.sources.preview(dto);
  }

  @RequirePermissions("sources.manage")
  @Post()
  create(@Body() dto: SourceInputDto, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.sources.create(dto, actor, clientInfo(req));
  }

  @RequirePermissions("sources.manage")
  @Put(":id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SourceInputDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.sources.update(id, dto, actor, clientInfo(req));
  }

  @RequirePermissions("sources.manage")
  @Delete(":id")
  @HttpCode(204)
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.sources.remove(id, actor, clientInfo(req));
  }

  @RequirePermissions("sources.manage")
  @Post(":id/run")
  @HttpCode(202)
  runNow(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.sources.runNow(id, actor, clientInfo(req));
  }
}
