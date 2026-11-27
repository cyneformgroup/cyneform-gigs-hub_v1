import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { type AuthUser, CurrentUser, RequirePermissions } from "../access/auth-user";
import { clientInfo } from "../common/client-info";
import { AccountsService } from "./accounts.service";
// biome-ignore lint/style/useImportType: Nest validation reads DTO classes from runtime parameter metadata.
import {
  CreateDataRequestDto,
  DataRequestQueryDto,
  DeleteAccountDto,
  ResolveDataRequestDto,
} from "./automation.dto";
import { PrivacyService } from "./privacy.service";

@Controller()
export class AutomationController {
  constructor(
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(PrivacyService) private readonly privacy: PrivacyService,
  ) {}

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

  @RequirePermissions("privacy.self")
  @Get("privacy/export")
  async exportMine(@CurrentUser() actor: AuthUser, @Req() req: Request, @Res() res: Response) {
    const data = await this.privacy.exportMine(actor, clientInfo(req));
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(data, null, 2));
  }

  @RequirePermissions("privacy.self")
  @Post("privacy/requests")
  createRequest(
    @Body() dto: CreateDataRequestDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.privacy.create(dto, actor, clientInfo(req));
  }

  @RequirePermissions("privacy.self")
  @Get("privacy/requests/mine")
  mine(@CurrentUser() actor: AuthUser) {
    return this.privacy.mine(actor);
  }

  @RequirePermissions("privacy.manage")
  @Get("privacy/requests")
  list(@Query() query: DataRequestQueryDto) {
    return this.privacy.list(query);
  }

  @RequirePermissions("privacy.manage")
  @Post("privacy/requests/:id/resolve")
  @HttpCode(204)
  resolve(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ResolveDataRequestDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.privacy.resolve(id, dto, actor, clientInfo(req));
  }
}
