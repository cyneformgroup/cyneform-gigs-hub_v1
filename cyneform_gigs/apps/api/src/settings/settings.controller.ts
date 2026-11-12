import { Body, Controller, Get, Inject, Put, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { type AuthUser, CurrentUser, RequirePermissions } from "../access/auth-user";
import { clientInfo } from "../common/client-info";

import type { UpdateSettingsDto } from "./settings.dto";
import { SettingsService } from "./settings.service";

@Controller("settings")
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  @RequirePermissions("settings.view")
  @Get()
  list() {
    return this.settings.list();
  }

  @RequirePermissions("settings.view")
  @Get("history")
  history(@Query("key") key?: string) {
    return this.settings.history(key);
  }

  @RequirePermissions("settings.manage")
  @Put()
  update(@Body() dto: UpdateSettingsDto, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.settings.update(dto, actor, clientInfo(req));
  }
}
