import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { type AuthUser, CurrentUser, RequirePermissions } from "../access/auth-user";
import { clientInfo } from "../common/client-info";
import type {
  ApproveDealDto,
  CloseDealDto,
  DealQueryDto,
  EliteDto,
  PayDealDto,
} from "./compensation.dto";
import type { CompensationService } from "./compensation.service";

@Controller("compensation")
export class CompensationController {
  constructor(private readonly comp: CompensationService) {}

  @RequirePermissions("compensation.view_own")
  @Get("summary")
  summary(@CurrentUser() actor: AuthUser) {
    return this.comp.summary(actor);
  }

  @RequirePermissions("compensation.view_own")
  @Get("structure")
  structure() {
    return this.comp.structure();
  }

  @RequirePermissions("compensation.view_own")
  @Get("rollover")
  rollover(@CurrentUser() actor: AuthUser) {
    return this.comp.rollover(actor);
  }

  @RequirePermissions("compensation.view_own")
  @Get("deals")
  deals(@Query() q: DealQueryDto, @CurrentUser() actor: AuthUser) {
    return this.comp.myDeals(q, actor);
  }

  @RequirePermissions("compensation.view_all")
  @Get("admin/deals")
  adminDeals(@Query() q: DealQueryDto) {
    return this.comp.adminDeals(q);
  }

  @RequirePermissions("crm.edit_own")
  @Post("close/:entryId")
  @HttpCode(200)
  close(
    @Param("entryId", ParseUUIDPipe) entryId: string,
    @Body() dto: CloseDealDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.comp.close(entryId, dto, actor, clientInfo(req));
  }

  @RequirePermissions("compensation.manage")
  @Post("elite")
  @HttpCode(204)
  elite(@Body() dto: EliteDto, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.comp.setElite(dto, actor, clientInfo(req));
  }

  @RequirePermissions("compensation.manage")
  @Post(":id/client-paid")
  @HttpCode(204)
  clientPaid(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.comp.markClientPaid(id, actor, clientInfo(req));
  }

  @RequirePermissions("compensation.manage")
  @Post(":id/approve")
  @HttpCode(204)
  approve(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ApproveDealDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.comp.approve(id, dto, actor, clientInfo(req));
  }

  @RequirePermissions("compensation.manage")
  @Post(":id/pay")
  @HttpCode(204)
  pay(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: PayDealDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.comp.pay(id, dto, actor, clientInfo(req));
  }
}
