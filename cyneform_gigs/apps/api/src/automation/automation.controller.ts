import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { type AuthUser, CurrentUser, RequirePermissions } from "../access/auth-user";
import { clientInfo } from "../common/client-info";
import type { AccountsService } from "./accounts.service";
import type { DeleteAccountDto } from "./automation.dto";

@Controller()
export class AutomationController {
  constructor(private readonly accounts: AccountsService) {}

  @RequirePermissions("users.delete")
  @Get("accounts/:id/delete-preview")
  preview(@Param("id", ParseUUIDPipe) id: string) {
    return this.accounts.preview(id);
  }

  @RequirePermissions("users.delete")
  @Post("accounts/:id/delete")
  @HttpCode(204)
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: DeleteAccountDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.accounts.remove(id, dto, actor, clientInfo(req));
  }
}
