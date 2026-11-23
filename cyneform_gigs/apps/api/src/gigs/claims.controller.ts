import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { type AuthUser, CurrentUser, RequirePermissions } from "../access/auth-user";
import { clientInfo } from "../common/client-info";
import type { OutreachDto } from "../crm/crm.dto";
import { ClaimsService } from "./claims.service";

@Controller("gigs")
export class ClaimsController {
  constructor(@Inject(ClaimsService) private readonly claims: ClaimsService) {}

  @RequirePermissions("gigs.claim")
  @Get("claims/mine")
  mine(@CurrentUser() actor: AuthUser) {
    return this.claims.mine(actor);
  }

  @RequirePermissions("gigs.claim")
  @Post(":id/claim")
  @HttpCode(200)
  claim(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.claims.claim(id, actor, clientInfo(req));
  }

  @RequirePermissions("gigs.claim")
  @Post(":id/outreach")
  @HttpCode(200)
  outreach(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: OutreachDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.claims.markOutreachSent(id, dto, actor, clientInfo(req));
  }

  /** Owner or gigs.assign, enforced in the service. */
  @RequirePermissions("gigs.view")
  @Post(":id/release")
  @HttpCode(204)
  release(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ) {
    return this.claims.release(id, actor, clientInfo(req));
  }
}
