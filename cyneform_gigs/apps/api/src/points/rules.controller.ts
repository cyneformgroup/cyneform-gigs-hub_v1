import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { type AuthUser, CurrentUser, RequirePermissions } from "../access/auth-user";
import { clientInfo } from "../common/client-info";
import type { RestoreVersionDto, UpdateRulesDto } from "./points.dto";
import { RulesService } from "./rules.service";

@Controller("points/rules")
export class RulesController {
  constructor(@Inject(RulesService) private readonly rules: RulesService) {}

  @RequirePermissions("rules.view")
  @Get()
  view() {
    return this.rules.view();
  }

  @RequirePermissions("rules.view")
  @Get("versions")
  versions() {
    return this.rules.versions();
  }

  @RequirePermissions("rules.manage")
  @Put()
  update(@Body() dto: UpdateRulesDto, @CurrentUser() actor: AuthUser, @Req() request: Request) {
    return this.rules.update(dto, actor, clientInfo(request));
  }

  @RequirePermissions("rules.manage")
  @Post("versions/:id/restore")
  restore(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RestoreVersionDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: Request,
  ) {
    return this.rules.restore(id, dto, actor, clientInfo(request));
  }
}
