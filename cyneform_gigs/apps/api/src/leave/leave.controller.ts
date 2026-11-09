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
import type { CreateLeaveDto, DecideLeaveDto, LeaveQueryDto } from "./leave.dto";
import { LeaveService } from "./leave.service";

@Controller("leave")
export class LeaveController {
  constructor(@Inject(LeaveService) private readonly leave: LeaveService) {}

  @RequirePermissions("leave.request")
  @Post()
  create(@Body() dto: CreateLeaveDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.leave.create(user, dto, clientInfo(req));
  }

  @RequirePermissions("leave.request")
  @Get("mine")
  mine(@CurrentUser() user: AuthUser) {
    return this.leave.mine(user.id);
  }

  @RequirePermissions("leave.request")
  @Post(":id/cancel")
  @HttpCode(200)
  cancel(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.leave.cancel(id, user, clientInfo(req));
  }

  @RequirePermissions("leave.view_all")
  @Get()
  list(@Query() q: LeaveQueryDto) {
    return this.leave.list(q);
  }

  @RequirePermissions("leave.decide")
  @Post(":id/decide")
  @HttpCode(200)
  decide(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: DecideLeaveDto,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ) {
    return this.leave.decide(id, dto, user, clientInfo(req));
  }
}
