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
} from "@nestjs/common";
import type { Request } from "express";
import { type AuthUser, CurrentUser, RequirePermissions } from "../access/auth-user";
import { clientInfo } from "../common/client-info";
import { BonusService } from "./bonus.service";
import { EquityService } from "./equity.service";
// biome-ignore lint/style/useImportType: Nest needs runtime DTO constructors for Zod validation metadata.
import {
  BonusDecisionDto,
  BonusQueryDto,
  GrantEquityDto,
  MilestoneDto,
  PayBonusDto,
  PayPayoutDto,
} from "./rewards.dto";

@Controller()
export class RewardsController {
  constructor(
    @Inject(BonusService) private readonly bonus: BonusService,
    @Inject(EquityService) private readonly equity: EquityService,
  ) {}
  @RequirePermissions("bonus.view_all") @Get("bonus") bonuses(@Query() q: BonusQueryDto) {
    return this.bonus.list(q);
  }
  @RequirePermissions("compensation.view_own") @Get("bonus/mine") myBonuses(
    @CurrentUser() actor: AuthUser,
  ) {
    return this.bonus.mine(actor);
  }
  @RequirePermissions("bonus.authorize")
  @Post("bonus/:id/decision")
  @HttpCode(204)
  decide(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: BonusDecisionDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.bonus.decide(id, dto, actor, clientInfo(req));
  }
  @RequirePermissions("compensation.manage")
  @Post("bonus/:id/pay")
  @HttpCode(204)
  payBonus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: PayBonusDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.bonus.pay(id, dto, actor, clientInfo(req));
  }
  @RequirePermissions("equity.view_all") @Get("equity") grants() {
    return this.equity.list();
  }
  @RequirePermissions("compensation.view_own") @Get("equity/mine") myEquity(
    @CurrentUser() actor: AuthUser,
  ) {
    return this.equity.mine(actor);
  }
  @RequirePermissions("equity.view_all") @Get("equity/milestones") milestones() {
    return this.equity.milestones();
  }
  @RequirePermissions("equity.view_all") @Get("equity/payouts") payouts() {
    return this.equity.payouts();
  }
  @RequirePermissions("equity.view_all") @Get("equity/eligibility/:userId") eligibility(
    @Param("userId", ParseUUIDPipe) userId: string,
  ) {
    return this.equity.eligibility(userId);
  }
  @RequirePermissions("equity.manage")
  @Post("equity/grant")
  @HttpCode(204)
  grant(@Body() dto: GrantEquityDto, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.equity.grant(dto, actor, clientInfo(req));
  }
  @RequirePermissions("equity.manage")
  @Post("equity/milestones")
  @HttpCode(204)
  recordMilestone(@Body() dto: MilestoneDto, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.equity.recordMilestone(dto, actor, clientInfo(req));
  }
  @RequirePermissions("compensation.manage")
  @Post("equity/payouts/:id/pay")
  @HttpCode(204)
  payPayout(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: PayPayoutDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.equity.payPayout(id, dto, actor, clientInfo(req));
  }
}
