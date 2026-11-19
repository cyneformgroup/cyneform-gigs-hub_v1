import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { type AuthUser, CurrentUser, RequirePermissions } from "../access/auth-user";
import { clientInfo } from "../common/client-info";
import type { GigQueryDto, ReviewGigsDto } from "./gigs.dto";
import { GigsService } from "./gigs.service";

@Controller("gigs")
export class GigsController {
  constructor(@Inject(GigsService) private readonly gigs: GigsService) {}

  @RequirePermissions("gigs.view")
  @Get()
  list(@Query() q: GigQueryDto, @CurrentUser() actor: AuthUser) {
    return this.gigs.list(q, actor);
  }

  @RequirePermissions("gigs.review")
  @Post("review")
  @HttpCode(200)
  review(@Body() dto: ReviewGigsDto, @CurrentUser() actor: AuthUser, @Req() req: Request) {
    return this.gigs.review(dto, actor, clientInfo(req));
  }
}
