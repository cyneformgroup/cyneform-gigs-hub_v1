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
import type { AdjustDto, AwardDto, LedgerQueryDto, VerifyDto } from "./points.dto";
import { PointsService } from "./points.service";

@Controller("points")
export class PointsController {
  constructor(@Inject(PointsService) private readonly points: PointsService) {}

  @RequirePermissions("points.view_own")
  @Get("me")
  me(@Query() query: LedgerQueryDto, @CurrentUser() actor: AuthUser) {
    return this.points.me(actor, query.page);
  }

  @RequirePermissions("points.view_all")
  @Get("ledger")
  ledger(@Query() query: LedgerQueryDto) {
    return this.points.ledger(query);
  }

  @RequirePermissions("points.view_all")
  @Get("bdps")
  bdps() {
    return this.points.bdps();
  }

  @RequirePermissions("points.manage")
  @Get("pending")
  pending() {
    return this.points.pending();
  }

  @RequirePermissions("points.manage")
  @Post("award")
  award(@Body() dto: AwardDto, @CurrentUser() actor: AuthUser, @Req() request: Request) {
    return this.points.award({ ...dto, actor, client: clientInfo(request) });
  }

  @RequirePermissions("points.manage")
  @Post("adjust")
  @HttpCode(204)
  adjust(@Body() dto: AdjustDto, @CurrentUser() actor: AuthUser, @Req() request: Request) {
    return this.points.adjust(dto, actor, clientInfo(request));
  }

  @RequirePermissions("points.manage")
  @Post(":id/verify")
  @HttpCode(204)
  verify(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: VerifyDto,
    @CurrentUser() actor: AuthUser,
    @Req() request: Request,
  ) {
    return this.points.verify(id, dto, actor, clientInfo(request));
  }
}
