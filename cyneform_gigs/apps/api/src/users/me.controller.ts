import { Body, Controller, Get, Inject, Patch, Req } from "@nestjs/common";
import type { Request } from "express";
import { type AuthUser, CurrentUser } from "../access/auth-user";
import { clientInfo } from "../common/client-info";
import type { UpdateMeDto } from "./users.dto";
import { UsersService } from "./users.service";

@Controller("me")
export class MeController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get("profile")
  profile(@CurrentUser() me: AuthUser) {
    return this.users.detail(me.id, null);
  }

  @Patch("profile")
  update(@Body() dto: UpdateMeDto, @CurrentUser() me: AuthUser, @Req() req: Request) {
    return this.users.updateSelf(me, dto, clientInfo(req));
  }
}
